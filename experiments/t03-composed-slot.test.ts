import { expect, it, vi } from 'vitest';
import { TaskSlot, type TaskReply } from '../../../../../../cli/src/jobs/taskSlot';
import { bridgeError, type TaskResultRequest } from '@/features/bridge/protocol';
import { contentSender } from './bridgeTestKit';
import { setup, SENT } from './dispatcherTestKit';
import { StorageKeys } from '@/core/types/common';

const down = () => ({ok:false as const,status:0,error:bridgeError('server-unreachable','injected lost response')});
function map(reply: TaskReply) {
  if(reply.kind==='ok'||reply.kind==='duplicate') return {ok:true as const,status:200,data:{accepted:reply.kind==='ok'}};
  const code=reply.kind==='invalid'?'bad-request':reply.kind;
  return {ok:false as const,status:code==='gone'?410:code==='not-found'?404:400,error:bridgeError(code,'task reply')};
}
function assertOne(effects: unknown[]) {expect(effects).toHaveLength(1);}
it('T03 oracle rejects duplicated simulated provider effect',()=>{
  assertOne([{turn:'one'}]);
  expect(()=>assertOne([{turn:'one'},{turn:'two'}])).toThrow();
});
for(const fault of ['none','lost-result-response','lost-ack-response'] as const) {
  it('T03 actual task slot and dispatcher '+fault, async()=>{
    const t=setup(), slot=new TaskSlot({extensionOfflineMs:30000});
    const effects: {tabId:number;turn:string}[]=[];
    const replies:string[]=[];
    const tabId=await t.bridgeTab('doc-1',true,'J1');
    t.page.state.onMessage=(id,msg)=>{
      if(msg.type==='gv.bridge.op.start') effects.push({tabId:id,turn:'synthetic-turn-'+(effects.length+1)});
      return {accepted:true};
    };
    let loseAck=fault==='lost-ack-response', loseResult=fault==='lost-result-response';
    t.server.client.ack.mockImplementation(async (_c,id)=>{
      const reply=slot.ack(id);
      if(loseAck){loseAck=false;return down();}
      return map(reply);
    });
    t.server.client.result.mockImplementation(async (_c,id,body)=>{
      const reply=slot.result(id,body as TaskResultRequest);
      replies.push(reply.kind);
      if(loseResult){loseResult=false;return down();}
      return map(reply);
    });
    const result=slot.run({jobId:'J1',op:'composer.send',params:{text:'synthetic prompt'},deadlineMs:10000});
    const settled=result.then(value=>({ok:true as const,value}),error=>({ok:false as const,code:error.code}));
    try{
      await vi.waitFor(()=>expect(slot.tasks()).toHaveLength(1));
      const poll=slot.poll({inflight:new Set(),ops:new Set(['composer.send']),policy:'allowed'});
      if(poll?.kind!=='task')throw new Error('expected task');
      const task=poll.task;
      await t.dispatcher.onTask(task);
      if(fault==='lost-ack-response'){
        expect(effects).toEqual([]);
        expect(await settled).toEqual({ok:false,code:'server-unreachable'});
        await t.make().onTask(task);
        expect(effects).toEqual([]);
        expect(slot.tasks()).toEqual([]);
        console.log('T03',fault,JSON.stringify({effects,replies}));
        return;
      }
      assertOne(effects);
      expect(effects[0].tabId).toBe(tabId);
      // Explicit duplicate delivery while in flight must not start another provider action.
      await t.dispatcher.onTask(task);
      assertOne(effects);
      await t.dispatcher.onDone(contentSender(tabId),{
        taskId:task.taskId,docNonce:'doc-1',outcome:{ok:true,data:SENT},
      });
      expect(await settled).toEqual({ok:true,value:SENT});
      if(fault==='lost-result-response'){
        expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toHaveLength(1);
        const restarted=t.make();
        expect(await restarted.drainOutbox()).toBe(true);
        expect(replies).toEqual(['ok','duplicate']);
        expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]??[]).toEqual([]);
        await restarted.onTask(task);
        expect(await restarted.inflight()).toEqual([]);
      } else {
        expect(replies).toEqual(['ok']);
        await t.make().onTask(task);
      }
      assertOne(effects);
      expect(slot.tasks()).toEqual([]);
      console.log('T03',fault,JSON.stringify({effects,replies}));
    }finally{slot.close();}
  },15000);
}
