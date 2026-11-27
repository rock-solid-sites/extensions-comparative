const assert=require("node:assert/strict");
const test=require("node:test");
const {identity,initial,reduce,restore,scopeKey,sortRows}=require("./workspace.js");
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
test("native URL identity across project moves and query",()=>{
 assert.equal(identity("/c/"+A).id,A);
 assert.equal(identity("https://chatgpt.com/g/g-p-123/c/"+A+"?model=x").id,A);
 for(const bad of ["/","/c/nope","/share/"+A,"https://evil.test/c/"+A,"https://chatgpt.com.evil.test/c/"+A,"/c/"+A+"/extra"])assert.equal(identity(bad),null);
});
test("account labels cannot alias or form storage paths",()=>{
 assert.notEqual(scopeKey("accountA"),scopeKey("accountB"));
 for(const bad of ["","a/b","__ x",null,"a".repeat(49)])assert.equal(scopeKey(bad),null);
});
test("turn end is not completion and route detachment stays unknown",()=>{
 let n=reduce(initial(A),{kind:"running",now:1});
 assert.equal(n.state,"running");
 assert.equal(reduce(n,{kind:"detached",now:2}).state,"unknown");
 assert.equal(reduce(n,{kind:"ended",visible:false,now:2}).state,"ended");
 assert.equal(reduce(n,{kind:"ended",visible:false,now:2}).unread,true);
 assert.equal(reduce(initial(A),{kind:"ended",visible:false,now:2}).state,"unknown");
});
test("explicit completion and read state",()=>{
 let n=reduce(initial(A),{kind:"native",value:"completed",visible:false,now:1});
 assert.equal(n.unread,true);
 n=reduce(n,{kind:"read",now:2});assert.equal(n.unread,false);
 assert.equal(reduce(n,{kind:"native",value:"completed",visible:false,now:3}).unread,false);
});
test("type and draft independent; no content retention",()=>{
 let n=reduce(initial(A),{kind:"type",value:"work",now:1});
 n=reduce(n,{kind:"draft",value:true,now:2});assert.equal(n.type,"work");assert.equal(n.draft,true);
 assert.deepEqual(reduce(n,{kind:"type",value:"other",now:3}),n);
 assert.deepEqual(reduce(n,{kind:"draft",value:"secret",now:3}),n);
});
test("manual project reference and deduplicated related links",()=>{
 let n=reduce(initial(A),{kind:"project",value:" CHATWS ",now:1});
 n=reduce(n,{kind:"related",value:B,now:2});n=reduce(n,{kind:"related",value:B,now:3});
 n=reduce(n,{kind:"related",value:A,now:4});assert.deepEqual(n.related,[B]);assert.equal(n.project,"CHATWS");
 assert.deepEqual(reduce(n,{kind:"unlink",value:B,now:5}).related,[]);
});
test("restart never resurrects running state, rejects malformed records",()=>{
 const raw=JSON.stringify({[A]:{...initial(A),state:"running",type:"chat",draft:true,related:[B,A,"bad"]},bad:{type:"work"}});
 const r=restore(raw);assert.equal(r[A].state,"unknown");assert.equal(r[A].type,"chat");assert.equal(r[A].draft,true);assert.deepEqual(r[A].related,[B]);assert.equal(r.bad,undefined);
 assert.deepEqual(Object.keys(restore("not json")),[]);
});
test("sort only supplied visible rows and retain native order",()=>{
 const rows=[{id:A,title:"A"},{id:B,title:"B"}];
 const records={[A]:{...initial(A),type:"work",project:"Z"},[B]:{...initial(B),type:"chat",project:"A",unread:true}};
 for(const mode of ["activity","type","project"])assert.deepEqual(sortRows(rows,records,mode).map(x=>x.id),[B,A]);
 assert.deepEqual(sortRows(rows,records,"native"),rows);
 assert.deepEqual(sortRows(rows,records,"native").map(x=>x.id),[A,B]);
});
