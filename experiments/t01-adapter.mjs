import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {findLayout,collectTurns,widthTargets} from '../src/adapter.js';

const html=readFileSync(new URL('./fixtures/chatgpt.html',import.meta.url),'utf8');
function fixture() {
  const w=new JSDOM(html,{url:'https://chatgpt.com/c/synthetic'}).window;
  const d=w.document, main=d.getElementById('main'), sidebar=d.getElementById('stage-slideover-sidebar');
  const column=d.querySelector('.chat-column'), row=d.querySelector('.app');
  const messages=[...main.querySelectorAll('[data-message-id]')].map(e=>e.getAttribute('data-message-id'));
  return {w,d,main,sidebar,column,row,messages};
}
function oracle(f,layout,allowRefusal=false) {
  if(layout===null && allowRefusal)return 'safe-refusal';
  assert.ok(layout,'expected usable layout');
  assert.equal(layout.main,f.main,'selected wrong main');
  assert.equal(layout.sidebar,f.sidebar,'selected wrong sidebar');
  assert.equal(layout.column,f.column,'selected wrong column');
  assert.equal(layout.row,f.row,'selected wrong row');
  assert.deepEqual(collectTurns(layout.main).map(r=>r.messageId),f.messages);
  for(const node of Object.values(widthTargets(layout)).flatMap(s=>[...s]))
    assert.ok(f.column.contains(node),'width target outside original column');
  return 'exact';
}
function decoy(f) {
  const m=f.d.createElement('main');
  m.hidden=true;
  m.innerHTML='<div data-turn-id-container="decoy"><div data-message-author-role="user" data-message-id="decoy">synthetic inactive turn</div></div>';
  return m;
}
test('T01 oracle distinguishes correct, refusal and deliberately wrong selection',()=>{
  const f=fixture();
  try {
    const layout=findLayout(f.d);
    assert.equal(oracle(f,layout),'exact');
    assert.equal(oracle(f,null,true),'safe-refusal');
    assert.throws(()=>oracle(f,{...layout,main:decoy(f)},true),/selected wrong main/);
  } finally {f.w.close();}
});
const cases=[
  ['unchanged fixture',false,()=>{}],
  ['extra benign wrapper',false,f=>{const el=f.d.createElement('div');f.main.before(el);el.append(f.main);}],
  ['hidden unrelated main outside app',true,f=>f.row.before(decoy(f))],
  ['hidden competing main inside app',true,f=>f.row.prepend(decoy(f))],
  ['hidden legacy sidebar outside app',true,f=>{const el=f.d.createElement('div');el.id='sidebar';el.hidden=true;f.row.before(el);}],
];
for(const [name,allowRefusal,mutate] of cases)test('T01 '+name,()=>{
  const f=fixture();
  try {
    mutate(f);
    const before=f.d.body.outerHTML;
    const layout=findLayout(f.d);
    try {console.log('T01 classification',name,oracle(f,layout,allowRefusal));}
    catch(e){console.log('T01 classification',name,'oracle-discrepancy');throw e;}
    finally {assert.equal(f.d.body.outerHTML,before,'adapter altered fixture during selection');}
  } finally {f.w.close();}
});
