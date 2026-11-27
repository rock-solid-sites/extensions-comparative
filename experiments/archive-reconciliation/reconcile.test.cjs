'use strict';
function testArchiveCore(core){
 const {identity,plan,admit}=core;
 const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222",C="33333333-3333-4333-8333-333333333333";
 const h="a".repeat(64),h2="b".repeat(64),t=1795750000000;
 const row=(id=A,title="Example",update_time=t)=>({id,title,update_time});
 const rec=(id=A,over={})=>({id,title:"Example",updated:t,sha256:h,coverage:"verified",hashVerified:true,...over});
 const check=(name,fn)=>{if(!fn())throw Error(name);return name;};
 return [
 check("native and project routes share stable identity",()=>identity("/c/"+A).id===identity("/u/0/g/g-p-example/c/"+A).id),
 check("reject unrelated origin and lookalike routes",()=>identity("https://example.com/c/"+A)===null&&identity("/c/"+A+"/extra")===null&&identity("https://chatgpt.com.evil/c/"+A)===null),
 check("new and changed only; unchanged skipped",()=>{const p=plan([row(),row(B),row(C,"Example",t+1000)],{[A]:rec(),[C]:rec(C)});return p.queue.length===2&&p.unchanged[0]===A&&p.queue[1].reason==="newer-revision";}),
 check("rename does not create a second identity",()=>{const p=plan([row(A,"Renamed")],{[A]:rec()});return p.queue[0].id===A&&p.queue[0].reason==="metadata-change";}),
 check("equal timestamp with observed change is rechecked",()=>plan([row()],{[A]:rec()},[A]).queue[0].reason==="observed-change"),
 check("missing timestamps never certify current",()=>plan([row(A,"Example",null)],{[A]:rec()}).queue[0].reason==="unknown-revision"),
 check("partial archive cannot count as current",()=>plan([row()],{[A]:rec(A,{coverage:"partial"})}).queue[0].reason==="missing-or-unverified"),
 check("conflicting duplicate listing requires reconciliation",()=>{const p=plan([row(),row(A,"Renamed")],{[A]:rec()});return p.queue.length===0&&p.recheck.length===1;}),
 check("dirty conversation absent from listing stays queued",()=>plan([],{},[A]).queue[0].reason==="observed-change-not-listed"),
 check("identical duplicates do not fetch twice",()=>plan([row(),row()]).queue.length===1),
 check("same raw digest is idempotent",()=>admit(rec(),rec())==="unchanged"),
 check("new verified revision keeps previous original",()=>admit(rec(),rec(A,{sha256:h2,updated:t+1000}))==="promote-retain-old"),
 check("partial newer snapshot cannot replace verified raw",()=>admit(rec(),rec(A,{sha256:h2,updated:t+1000,coverage:"partial"}))==="retain-partial"),
 check("equal timestamp different bytes preserved as conflict",()=>admit(rec(),rec(A,{sha256:h2}))==="retain-conflict"),
 check("older snapshot preserved without changing current",()=>admit(rec(),rec(A,{sha256:h2,updated:t-1000}))==="retain-older"),
 check("wrong ID or unverified hash rejected",()=>admit(rec(),rec(B))==="reject"&&admit(rec(),rec(A,{hashVerified:false}))==="reject"),
 check("no deletion from incomplete inventory",()=>{const p=plan([],{[A]:rec()});return p.queue.length===0&&p.unchanged.length===0&&!Object.hasOwn(p,"delete");})
 ];
}
const results=testArchiveCore(require('./reconcile.cjs'));
for(const result of results)console.log('PASS '+result);
console.log(results.length+' checks passed');
