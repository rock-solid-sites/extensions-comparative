const {test}=require("node:test");
const assert=require("node:assert/strict");
const {JSDOM}=require("jsdom");
const fs=require("node:fs"),path=require("node:path");
const script=fs.readFileSync(path.join(__dirname,"workspace.js"),"utf8");
const A="11111111-1111-4111-8111-111111111111",B="22222222-2222-4222-8222-222222222222";
const fixture='<nav style="display:flex;flex-direction:column"><a href="/c/'+A+'">Alpha</a><a href="/g/g-p-123/c/'+B+'">Beta</a></nav><main><div id="prompt-textarea" contenteditable="true"></div><button data-testid="send-button">Send</button></main>';
const delay=()=>new Promise(r=>setTimeout(r,260));
const owner="[data-chatws-v1]";
// jsdom has no layout engine. Explicitly supply the geometry used by the adapter.
function geometry(w,el,x,y,width,height){
 el.getBoundingClientRect=()=>({x,y,left:x,top:y,right:x+width,bottom:y+height,width,height});
}
function standardLayout(w){
 const d=w.document,nav=d.querySelector("nav");
 geometry(w,nav,64,0,340,600);
 for(const [i,a] of [...nav.querySelectorAll("a")].entries())geometry(w,a,76,80+i*42,310,40);
}
function button(d,txt){return [...d.querySelectorAll("button"+owner)].find(b=>b.textContent===txt);}
test("native sidebar fixture: opt-in, type, draft, turn transition, sorting, route and scope",async()=>{
 const dom=new JSDOM(fixture,{url:"https://chatgpt.com/c/"+A,runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,d=w.document;standardLayout(w);
 try{
  w.prompt=()=>"accountA";d.hasFocus=()=>false;
  w.eval(script);await delay();assert.equal(d.querySelectorAll("section"+owner).length,1);
  w.eval(script);await delay();assert.equal(d.querySelectorAll("section"+owner).length,1);
  assert.equal(w.localStorage.length,0);button(d,"Enable workspace").click();await delay();
  assert.ok(w.localStorage.getItem("chatws:v1:accountA"));
  button(d,"Manage chat ▾").click();await delay();
  const select=d.querySelector('select[aria-label="Conversation type"]');select.value="work";select.dispatchEvent(new w.Event("change"));await delay();
  assert.match(d.querySelector('nav a[href="/c/'+A+'"]').textContent,/Work/);
  const composer=d.getElementById("prompt-textarea");composer.textContent="do not retain this draft";
  composer.dispatchEvent(new w.Event("input",{bubbles:true}));await delay();
  const read=()=>JSON.parse(w.localStorage.getItem("chatws:v1:accountA"));
  assert.equal(read()[A].draft,true);assert.ok(!w.localStorage.getItem("chatws:v1:accountA").includes("do not retain"));
  const send=d.querySelector('[data-testid="send-button"]');send.dataset.testid="stop-button";await delay();assert.equal(read()[A].state,"running");
  send.dataset.testid="send-button";await delay();assert.equal(read()[A].state,"ended");assert.equal(read()[A].unread,true);
  const sort=d.querySelector('select[aria-label="Sort conversations"]');sort.value="activity";sort.dispatchEvent(new w.Event("change"));await delay();
  assert.equal(d.querySelectorAll("section"+owner+" a").length,0);assert.equal(d.querySelector("nav > a").style.order,"0");
  assert.ok(!d.querySelectorAll("nav > a")[1].textContent.includes("?"));
  assert.equal(d.querySelectorAll("nav > a").length,2);assert.equal(d.querySelector("nav > a").getAttribute("href"),"/c/"+A);
  let clicked=0;d.querySelector("nav > a").addEventListener("click",e=>{e.preventDefault();clicked++;});
  d.querySelector("nav > a").click();assert.equal(clicked,1);
  const recent=d.querySelector('select[aria-label="Sort conversations"]');recent.value="native";recent.dispatchEvent(new w.Event("change"));await delay();assert.equal(d.querySelector("nav > a").style.order,"");
  send.dataset.testid="stop-button";await delay();assert.equal(read()[A].state,"running");
  w.history.pushState({},"","/g/g-p-123/c/"+B);w.dispatchEvent(new w.PopStateEvent("popstate"));await delay();
  assert.equal(read()[A].state,"unknown");assert.notEqual(read()[B].state,"running");
  w.prompt=()=>"accountB";d.querySelector('button[aria-label="Workspace account settings"]').click();await delay();
  assert.notEqual(JSON.parse(w.localStorage.getItem("chatws:v1:accountB"))[A].type,"work");
 }finally{w.close();}
});
test("script does not mount on other origins",async()=>{
 const dom=new JSDOM(fixture,{url:"https://example.com/c/"+A,runScripts:"outside-only"});
 try{dom.window.eval(script);await delay();assert.equal(dom.window.document.querySelectorAll(owner).length,0);}finally{dom.window.close();}
});

test("row-local background evidence, hidden markers, ambiguity and non-replay",async()=>{
 const dom=new JSDOM(fixture,{url:"https://chatgpt.com/c/"+A,runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,d=w.document;standardLayout(w);
 try{
  w.prompt=()=>"accountA";d.hasFocus=()=>true;w.eval(script);await delay();button(d,"Enable workspace").click();await delay();
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
  button(d,"Manage chat ▾").click();await delay();
  const sel=d.querySelector('select[aria-label="Conversation type"]');sel.value="chat";sel.dispatchEvent(new w.Event("change"));await delay();
  assert.equal(read()[B].type,"chat");t.remove();await delay();assert.equal(read()[B].type,"chat");
  const stale=d.querySelector('select[aria-label="Conversation type"]');w.history.pushState({},"","/c/"+A);
  stale.value="codex";stale.dispatchEvent(new w.Event("change"));await delay();assert.equal(read()[B].type,"chat");
 }finally{w.close();}
});

test("nested navigation rail and full conversation column, collapse and remount",async()=>{
 const dom=new JSDOM('<nav id="shell" style="display:flex;flex-direction:row"><div id="rail"><button>Home</button></div><div id="column" style="display:flex;flex-direction:column"><header>ChatGPT</header><div id="list"><a href="/c/'+A+'">Alpha</a><a href="/c/'+B+'">Beta</a></div></div></nav><main></main>',{url:"https://chatgpt.com/c/"+A,runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,d=w.document,rail=d.getElementById("rail"),column=d.getElementById("column"),shell=d.getElementById("shell"),list=d.getElementById("list");
 try{
  geometry(w,shell,0,0,404,600);geometry(w,rail,0,0,64,600);geometry(w,column,64,0,340,600);geometry(w,list,64,150,340,200);
  for(const [i,a] of [...list.querySelectorAll("a")].entries())geometry(w,a,76,170+i*42,310,40);
  w.eval(script);await delay();
  const panel=()=>d.querySelector("section"+owner);
  assert.equal(panel().parentElement,column);assert.equal(rail.querySelector(owner),null);
  column.hidden=true;await delay();assert.equal(panel(),null);
  column.hidden=false;await delay();assert.equal(panel().parentElement,column);
  geometry(w,column,64,0,64,600);geometry(w,list,64,150,64,200);
  for(const a of list.querySelectorAll("a"))geometry(w,a,70,170,45,40);
  w.dispatchEvent(new w.Event("resize"));await delay();assert.equal(panel(),null);
  geometry(w,column,64,0,340,600);geometry(w,list,64,150,340,200);
  for(const [i,a] of [...list.querySelectorAll("a")].entries())geometry(w,a,76,170+i*42,310,40);
  w.dispatchEvent(new w.Event("resize"));await delay();assert.equal(panel().parentElement,column);
 }finally{w.close();}
});

test("unsupported layout preserves native order and no duplicate list",async()=>{
 const dom=new JSDOM(fixture.replace('display:flex;flex-direction:column','display:block'),{url:"https://chatgpt.com/c/"+A,runScripts:"outside-only",pretendToBeVisual:true});
 const w=dom.window,d=w.document;standardLayout(w);
 try{
  w.prompt=()=>"accountA";w.eval(script);await delay();button(d,"Enable workspace").click();await delay();
  const sort=d.querySelector('select[aria-label="Sort conversations"]');
  assert.equal(sort.value,"native");assert.equal(sort.querySelector('option[value="activity"]').disabled,true);
  assert.equal(d.querySelectorAll("section"+owner+" a").length,0);
  assert.equal(d.querySelectorAll("nav > a").length,2);assert.equal(d.querySelector("nav > a").style.order,"");
 }finally{w.close();}
});
