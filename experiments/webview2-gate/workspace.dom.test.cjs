const {test}=require("node:test");
const assert=require("node:assert/strict");
const {JSDOM}=require("jsdom");
const fs=require("node:fs"),path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"workspace.js"),"utf8");
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const fixture='<nav><a href="/c/'+A+'">Alpha</a><a href="/g/g-p-123/c/'+B+'">Beta</a></nav><main><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button></main>';
const delay=()=>new Promise(r=>setTimeout(r,260));
const owner="[data-chatws-v1]";
function button(d,txt){return [...d.querySelectorAll("button"+owner)].find(b=>b.textContent===txt);}
test("native sidebar fixture: opt-in, type, draft, turn transition, sorting, route and scope",async()=>{
 const dom=new JSDOM(fixture,{url:"https://chatgpt.com/c/"+A,runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,d=w.document;
 try{
  w.prompt=()=>"accountA";d.hasFocus=()=>false;
  w.eval(script);await delay();assert.equal(d.querySelectorAll("section"+owner).length,1);
  w.eval(script);await delay();assert.equal(d.querySelectorAll("section"+owner).length,1);
  assert.equal(w.localStorage.length,0);button(d,"Enable").click();await delay();
  assert.ok(w.localStorage.getItem("chatws:v1:accountA"));
  const select=d.querySelector("select"+owner);select.value="work";select.dispatchEvent(new w.Event("change"));await delay();
  assert.match(d.querySelector('nav a[href="/c/'+A+'"]').textContent,/work/);
  const composer=d.getElementById("prompt-textarea");composer.textContent="do not retain this draft";
  composer.dispatchEvent(new w.Event("input",{bubbles:true}));await delay();
  const read=()=>JSON.parse(w.localStorage.getItem("chatws:v1:accountA"));
  assert.equal(read()[A].draft,true);assert.ok(!w.localStorage.getItem("chatws:v1:accountA").includes("do not retain"));
  const send=d.querySelector('[data-testid="send-button"]');send.dataset.testid="stop-button";await delay();assert.equal(read()[A].state,"running");
  send.dataset.testid="send-button";await delay();assert.equal(read()[A].state,"ended");assert.equal(read()[A].unread,true);
  button(d,"Activity").click();await delay();assert.match(d.querySelector("section"+owner).textContent,/Alpha/);
  assert.equal(d.querySelectorAll("nav > a").length,2);assert.equal(d.querySelector("nav > a").getAttribute("href"),"/c/"+A);
  let clicked=0;d.querySelector("nav > a").addEventListener("click",e=>{e.preventDefault();clicked++;});
  [...d.querySelectorAll("section"+owner+" a")].find(a=>a.getAttribute("href")==="/c/"+A).click();assert.equal(clicked,1);
  send.dataset.testid="stop-button";await delay();assert.equal(read()[A].state,"running");
  w.history.pushState({},"","/g/g-p-123/c/"+B);w.dispatchEvent(new w.PopStateEvent("popstate"));await delay();
  assert.equal(read()[A].state,"unknown");assert.notEqual(read()[B].state,"running");
  w.prompt=()=>"accountB";button(d,"Account: accountA").click();await delay();
  assert.notEqual(JSON.parse(w.localStorage.getItem("chatws:v1:accountB"))[A].type,"work");
 }finally{w.close();}
});
test("script does not mount on other origins",async()=>{
 const dom=new JSDOM(fixture,{url:"https://example.com/c/"+A,runScripts:"outside-only"});
 try{dom.window.eval(script);await delay();assert.equal(dom.window.document.querySelectorAll(owner).length,0);}finally{dom.window.close();}
});

test("row-local background evidence, hidden markers, ambiguity and non-replay",async()=>{
 const dom=new JSDOM(fixture,{url:"https://chatgpt.com/c/"+A,runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,d=w.document;
 try{
  w.prompt=()=>"accountA";d.hasFocus=()=>true;w.eval(script);await delay();button(d,"Enable").click();await delay();
  const row=d.querySelectorAll("nav > a")[1],read=()=>JSON.parse(w.localStorage.getItem("chatws:v1:accountA"));
  function marker(id){const n=d.createElement("span");n.dataset.testid=id;row.append(n);return n;}
  const t=marker("conversation-type-work"),st=marker("conversation-status-running");
  const hidden=marker("conversation-type-chat");hidden.hidden=true;
  await delay();assert.equal(read()[B].type,"work");assert.equal(read()[B].state,"running");
  const conflict=marker("conversation-status-completed");await delay();assert.equal(read()[B].state,"unknown");conflict.remove();
  await delay();assert.equal(read()[B].state,"running");
  st.dataset.testid="conversation-status-completed";await delay();assert.equal(read()[B].state,"completed");assert.equal(read()[B].unread,true);
  w.history.pushState({},"","/c/"+B);w.dispatchEvent(new w.PopStateEvent("popstate"));await delay();await delay();
  // A read must not be replayed as a new completion merely by a mutation.
  d.dispatchEvent(new w.Event("visibilitychange"));await delay();assert.equal(read()[B].unread,false);
  const sel=d.querySelector("select"+owner);sel.value="chat";sel.dispatchEvent(new w.Event("change"));await delay();
  assert.equal(read()[B].type,"chat");t.remove();await delay();assert.equal(read()[B].type,"chat");
  const stale=d.querySelector("select"+owner);w.history.pushState({},"","/c/"+A);
  stale.value="codex";stale.dispatchEvent(new w.Event("change"));await delay();assert.equal(read()[B].type,"chat");
 }finally{w.close();}
});
