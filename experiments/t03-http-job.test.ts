import { expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { BRIDGE_PATHS, bridgePath, OP_NAMES, type JobSubmitResponse, type ValidatedBridgeTask } from '@/features/bridge/protocol';
import { createBridgeClient } from '../bridgeClient';
import { contentSender } from './bridgeTestKit';
import { setup, READY } from './dispatcherTestKit';
import { StorageKeys } from '@/core/types/common';
import { startTestServer, data } from '../../../../../../cli/test/helpers/server';
import { FakeExtension, pairFake, EXT_ORIGIN, ASK_HANDLERS } from '../../../../../../cli/test/helpers/fakeExtension';
import { rawRequest } from '../../../../../../cli/test/helpers/http';
import type { JobDetail } from '../../../../../../cli/src/jobs/jobStore';

const SENT={conversationId:'c-1',url:'https://chatgpt.com/c/c-1',userTurnKey:'t-1'};
const MODES=['normal','lost-request','lost-response'] as const;
for(const fault of MODES) {
  it('T03 HTTP job '+fault,async()=>{
    const server=await startTestServer({pollHoldMs:100,extensionOfflineMs:10000});
    try {
      const paired=new FakeExtension(server.port);
      await pairFake(paired,server.cli); // pair only; never start fake execution loop
      expect(paired.token).toBeTruthy();
      const t=setup();
      t.pairing.current={serverId:'synthetic-pairing',port:server.port,token:paired.token!};
      let sendTaskId:string|undefined;
      let injected=false;
      const resultReplies:{status:number;accepted:unknown}[]=[];
      const http=async(input:RequestInfo|URL,init?:RequestInit)=>{
        const url=new URL(String(input));
        if(url.hostname!=='127.0.0.1'||Number(url.port)!==server.port)throw new Error('non-test destination');
        const target=sendTaskId!==undefined && url.pathname===bridgePath.taskResult(sendTaskId);
        if(target&&!injected&&fault==='lost-request'){injected=true;throw new Error('injected request loss');}
        const response=await rawRequest({port:server.port,method:init?.method,path:url.pathname+url.search,
          headers:{...Object.fromEntries(new Headers(init?.headers).entries()),origin:EXT_ORIGIN},
          ...(typeof init?.body==='string'?{rawBody:init.body}:{}),
          ...(init?.signal?{signal:init.signal}:{})});
        if(target){
          resultReplies.push({status:response.status,accepted:(response.json as any)?.data?.accepted});
          if(!injected&&fault==='lost-response'){injected=true;throw new Error('injected response loss after real server result');}
        }
        return new Response(response.status===204?null:JSON.stringify(response.json??null),{status:response.status,headers:{'content-type':'application/json'}});
      };
      const client=createBridgeClient(http as typeof fetch);
      const connection=t.pairing.current;
      t.server.client.ack.mockImplementation((_,id)=>client.ack(connection,id));
      t.server.client.result.mockImplementation((_,id,body)=>client.result(connection,id,body as any));
      t.server.client.progress.mockImplementation((_,id,seq,event)=>client.progress(connection,id,seq,event as Record<string,unknown>));
      let dispatcher=t.dispatcher;
      const effects:{tabId:number;taskId:string;turn:string}[]=[];
      const starts:{tabId:number;task:ValidatedBridgeTask}[]=[];
      t.page.state.onMessage=(tabId,message)=>{
        if(message.type==='gv.bridge.op.start'){
          const task=message.task as ValidatedBridgeTask;
          starts.push({tabId,task});
          if(task.op==='composer.send')effects.push({tabId,taskId:task.taskId,turn:'synthetic-'+(effects.length+1)});
        }
        return {accepted:true};
      };
      const poll=async()=>client.poll(connection,{capabilities:{ops:OP_NAMES.map(name=>({name,v:1}))},
        inflight:await dispatcher.inflight(),policy:{revision:1,state:'allowed'}});
      const initial=await poll();
      expect(initial.ok).toBe(true);
      const submit=await server.cli('POST',BRIDGE_PATHS.jobs,{plugin:'ask',command:'ask',input:{prompt:'synthetic prompt',keepTab:false}});
      expect(submit.status).toBe(202);
      const {jobId}=data<JobSubmitResponse>(submit);
      let job:JobDetail|undefined;
      for(let i=0;i<25;i++){
        const response=await poll();
        if(!response.ok)throw new Error(JSON.stringify(response));
        const message=response.data;
        if(message?.kind==='task'){
          const task=message.task;
          const count=starts.length;
          await dispatcher.onTask(task);
          if(task.op==='conversation.open'){
            const tabs=await t.store.listTabs();
            expect(tabs).toHaveLength(1);
            expect(await dispatcher.onHello(contentSender(tabs[0].tabId,'DOC'),'doc-1')).toBe(true);
          }
          if(task.op!=='conversation.close'){
            expect(starts.length).toBe(count+1);
            const start=starts[count];
            expect(start.task.taskId).toBe(task.taskId);
            let outcome:unknown;
            if(task.op==='conversation.open')outcome=READY;
            else if(task.op==='composer.send'){
              sendTaskId=task.taskId;
              outcome=SENT;
            }else if(task.op==='turns.waitReply'){
              outcome={assistantTurnKey:'t-2',status:'complete',elapsedMs:10,evidence:{}};
            }else if(task.op==='turns.read'){
              outcome={markdown:'OK',turnKey:'t-2',textSha256:createHash('sha256').update('OK').digest('hex'),files:[]};
            }else if(task.op==='model.select'){
              outcome=await ASK_HANDLERS['model.select']!(task.params,task,{progress:async()=>{},aborted:()=>false});
            }else throw new Error('unexpected op '+task.op);
            expect(await dispatcher.onDone(contentSender(start.tabId,'DOC'),{
              taskId:task.taskId,docNonce:'doc-1',outcome:{ok:true,data:outcome}
            })).toBe(true);
            if(task.op==='composer.send'&&fault!=='normal'){
              expect(injected).toBe(true);
              expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]).toHaveLength(1);
              dispatcher=t.make();
              expect(await dispatcher.drainOutbox()).toBe(true);
              expect(t.local.values[StorageKeys.BRIDGE_OUTBOX]??[]).toEqual([]);
              await dispatcher.onTask(task); // stale task replay
              expect(effects).toHaveLength(1);
            }
          }
        }else if(message)throw new Error('unexpected poll '+JSON.stringify(message));
        job=data<JobDetail>(await server.cli('GET',bridgePath.job(jobId)));
        if(['succeeded','failed','cancelled','needs-user','detached'].includes(job.status))break;
      }
      expect(job?.status).toBe('succeeded');
      expect(job?.checkpoints.sent).toMatchObject({conversationId:'c-1',userTurnKey:'t-1'});
      expect(effects).toHaveLength(1);
      const persisted=JSON.parse(await readFile(join(server.paths.jobs,jobId,'job.json'),'utf8'));
      expect(persisted.status).toBe('succeeded');
      expect(persisted.checkpoints.sent).toMatchObject({conversationId:'c-1',userTurnKey:'t-1'});
      expect(await readFile(join(server.paths.jobs,jobId,'output','response.md'),'utf8')).toBe('OK');
      expect(resultReplies).toEqual(fault==='lost-response'?[{status:200,accepted:true},{status:200,accepted:false}]:[{status:200,accepted:true}]);
      console.log('T03-HTTP',fault,JSON.stringify({effects,resultReplies,status:job?.status,persisted: persisted.status,ops:starts.map(s=>s.task.op)}));
    } finally {await server.close();}
  },25000);
}
