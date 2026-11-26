import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createBridge} from './bridge.mjs';

function setup(t) {
  const stateDir=mkdtempSync(join(tmpdir(),'t04-paseo-'));
  t.after(()=>rmSync(stateDir,{recursive:true,force:true}));
  const role={provider:'synthetic-provider',model:'synthetic-model',thinking:'none',requireWorktree:true};
  const cfg={allowedWorkspaceIds:['ws_test'],roles:{review:role},stateDir};
  let hold=null;
  const effects=[];
  const bridge=createBridge(cfg,{cli:async argv=>{
    if(hold&&argv[0]===hold.op){
      hold.entered();
      await hold.wait;
    }
    if(argv[0]==='workspace')return [{workspaceId:'ws_test',cwd:'/tmp/t04-worktree',isolation:'worktree'}];
    if(argv[0]==='inspect')return {Id:'agent_test',Cwd:'/tmp/t04-worktree',Provider:role.provider,Model:role.model,Thinking:'none',Status:'idle',Archived:false};
    if(argv[0]==='run'){
      effects.push('run');
      return {agentId:'agent_test',status:'created',provider:role.provider,cwd:'/tmp/t04-worktree'};
    }
    if(argv[0]==='send'){effects.push('send');return {agentId:'agent_test',status:'sent'};}
    throw new Error('unexpected fake operation '+argv[0]);
  }});
  function gate(op){
    let entered,release;
    const ready=new Promise(resolve=>{entered=resolve});
    const wait=new Promise(resolve=>{release=resolve});
    hold={op,entered,wait};
    return {ready,release};
  }
  const dispatch=()=>bridge.dispatch({workspaceId:'ws_test',role:'review',prompt:'Synthetic harmless fixture'});
  const send=()=>bridge.followup({agentId:'agent_test',prompt:'Synthetic followup'});
  return {cfg,bridge,effects,gate,dispatch,send};
}
test('T04 positive control and pre-operation revocation',async t=>{
  const f=setup(t);
  await f.dispatch(); await f.send();
  assert.deepEqual(f.effects,['run','send']);
  delete f.cfg.roles.review;
  await assert.rejects(f.send(),/revoked/);
  await assert.rejects(f.dispatch(),/not approved/);
  assert.deepEqual(f.effects,['run','send']);
});
for(const phase of ['dispatch','followup']){
  test('T04 revoke role during '+phase+' preflight', {timeout:5000},async t=>{
    const f=setup(t);
    if(phase==='followup')await f.dispatch();
    f.effects.length=0;
    const g=f.gate(phase==='dispatch'?'workspace':'inspect');
    const pending=(phase==='dispatch'?f.dispatch():f.send()).then(value=>({ok:true,value}),error=>({ok:false,message:String(error.message)}));
    await g.ready;
    delete f.cfg.roles.review;
    g.release();
    const result=await pending;
    console.log('T04-PASEO',phase,JSON.stringify({result,effects:f.effects}));
    // Scope: live mutation of the in-memory config object, not real config reload.
    assert.deepEqual(f.effects,[],'revoked role reached simulated effect boundary');
    assert.equal(result.ok,false,'revoked role reported success');
  });
}
