/* CHATWS increment 1: native-page metadata only. No network/host bridge. */
(function(){
"use strict";
const TYPES=["unknown","chat","work","codex","opencode"];
const STATES=["unknown","running","ended","completed","failed"];
const ID="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
function identity(raw){
  try{
    const u=new URL(raw,"https://chatgpt.com");
    if(u.origin!=="https://chatgpt.com")return null;
    const m=u.pathname.match(new RegExp("^(?:/g/[a-zA-Z0-9_-]+)?/c/("+ID+")/?$","i"));
    return m?{id:m[1].toLowerCase(),path:u.pathname.replace(/\/$/,"")}:null;
  }catch{return null;}
}
function initial(id){return {id,type:"unknown",state:"unknown",draft:false,unread:false,project:"",related:[],updated:0};}
function reduce(old,event){
  const n={...old};
  if(event.kind==="type"&&TYPES.includes(event.value))n.type=event.value;
  if(event.kind==="draft"&&typeof event.value==="boolean")n.draft=event.value;
  if(event.kind==="running")n.state="running";
  if(event.kind==="detached"&&n.state==="running")n.state="unknown";
  if(event.kind==="ended"&&n.state==="running"){n.state="ended";n.unread=!event.visible;}
  if(event.kind==="native"&&["completed","failed"].includes(event.value)&&n.state!==event.value){n.state=event.value;n.unread=!event.visible;}
  if(event.kind==="read")n.unread=false;
  if(event.kind==="project"&&typeof event.value==="string")n.project=event.value.trim().slice(0,120);
  if(event.kind==="related"&&identity("/c/"+event.value)&&event.value!==n.id)n.related=[...new Set([...n.related,event.value])].slice(0,30);
  if(event.kind==="unlink")n.related=n.related.filter(x=>x!==event.value);
  if(JSON.stringify(n)!==JSON.stringify(old))n.updated=event.now||Date.now();
  return n;
}
function restore(raw){
  const result=Object.create(null);
  try{
    const parsed=JSON.parse(raw||"{}");
    if(!parsed||typeof parsed!=="object"||Array.isArray(parsed))return result;
    for(const [id,v] of Object.entries(parsed).slice(0,5000)){
      if(!identity("/c/"+id)||!v||typeof v!=="object")continue;
      const n=initial(id);
      n.type=TYPES.includes(v.type)?v.type:"unknown";
      n.state=STATES.includes(v.state)&&v.state!=="running"?v.state:"unknown";
      n.draft=v.draft===true;n.unread=v.unread===true;
      n.project=typeof v.project==="string"?v.project.slice(0,120):"";
      n.related=Array.isArray(v.related)?[...new Set(v.related.filter(x=>typeof x==="string"&&x!==id&&identity("/c/"+x)))].slice(0,30):[];
      n.updated=Number.isFinite(v.updated)?v.updated:0;
      result[id]=n;
    }
  }catch{}
  return result;
}
function scopeKey(scope){return typeof scope==="string"&&/^[a-zA-Z0-9_-]{1,48}$/.test(scope)? "chatws:v1:"+scope:null;}
function sortRows(rows,records,mode){
  return [...rows].sort((a,b)=>{
    const x=records[a.id]||initial(a.id),y=records[b.id]||initial(b.id);
    if(mode==="activity")return Number(y.unread)-Number(x.unread)||Number(y.state==="running")-Number(x.state==="running")||Number(y.draft)-Number(x.draft)||y.updated-x.updated;
    if(mode==="type")return x.type.localeCompare(y.type)||a.title.localeCompare(b.title);
    if(mode==="project")return (x.project||"~").localeCompare(y.project||"~")||a.title.localeCompare(b.title);
    return 0;
  });
}
if(typeof module!=="undefined"&&module.exports){module.exports={identity,initial,reduce,restore,scopeKey,sortRows};return;}
if(location.origin!=="https://chatgpt.com"||window!==top||window.__chatwsV1)return;
window.__chatwsV1=true;
let records=Object.create(null),scope=null,active=null,runId=null,armed=false,mode="native",timer=null,panel=null,lastRender="",observer=null,storageError=false;
const owner="data-chatws-v1";
function save(){if(!scope)return;try{localStorage.setItem(scopeKey(scope),JSON.stringify(records));storageError=false;}catch{storageError=true;}}
function update(id,event){
  if(!scope||!id)return;
  const old=records[id]||initial(id),n=reduce(old,event);
  if(!records[id]||n!==old&&JSON.stringify(old)!==JSON.stringify(n)){records[id]=n;save();}
}
function node(tag,text){const e=document.createElement(tag);if(text)e.textContent=text;e.setAttribute(owner,"");return e;}
function button(text,fn){const e=node("button",text);e.type="button";e.style.cssText="padding:3px 6px;border:1px solid currentColor;border-radius:6px;background:transparent;color:inherit;cursor:pointer;font:inherit";e.addEventListener("click",fn);return e;}
function visible(){return document.visibilityState==="visible"&&document.hasFocus();}
function findSidebar(){
  const candidates=[...document.querySelectorAll("nav,aside")].map(el=>({el,count:[...el.querySelectorAll("a[href]")].filter(a=>identity(a.getAttribute("href"))&&!a.closest("["+owner+"]")).length}));
  candidates.sort((a,b)=>b.count-a.count);
  return candidates[0]?.count?candidates[0].el:null;
}
function discover(side){
  const seen=new Set(),rows=[];
  for(const a of side.querySelectorAll("a[href]")){
    if(a.closest("["+owner+"]"))continue;
    const i=identity(a.getAttribute("href"));if(!i||seen.has(i.id))continue;
    seen.add(i.id);
    const badge=a.querySelector("span["+owner+"]"),raw=a.textContent||"";
    rows.push({...i,title:(badge&&raw.endsWith(badge.textContent)?raw.slice(0,raw.length-badge.textContent.length):raw).trim().slice(0,160)||i.id});
  }
  return rows;
}
function observeCurrent(){
  const id=identity(location.href)?.id||null;
  if(id!==active){
    if(runId)update(runId,{kind:"detached"});
    active=id;runId=null;armed=false;
    // On SPA navigation the old composer may still be mounted. Do not attribute its running/draft state to the new route.
    return;
  }
  if(!scope||!active)return;
  const stop=document.querySelector('main button[data-testid="stop-button"]');
  const send=document.querySelector('main button[data-testid="send-button"]');
  const composer=document.querySelector('main #prompt-textarea');
  if(!stop&&send&&send.isConnected)armed=true;
  if(stop&&stop.isConnected&&armed){runId=active;update(active,{kind:"running"});}
  else if(runId===active&&send&&send.isConnected){
    update(active,{kind:"ended",visible:visible()});runId=null;
  }
  // Draft is presence only; never retain text or attachments.
  if(composer&&armed)update(active,{kind:"draft",value:!!(composer.value||composer.textContent||"").trim()});
  if(visible())update(active,{kind:"read"});
}
function switchScope(){
  const value=window.prompt("Local account label (letters, digits, _ or -). Choose a non-sensitive label for each ChatGPT account; metadata is stored in chatgpt.com local storage. Blank disables workspace metadata.",scope||"");
  if(value===null)return;
  const key=scopeKey(value);
  if(value&&!key){window.alert("Invalid label.");return;}
  if(runId)update(runId,{kind:"detached"});
  scope=key?value:null;runId=null;armed=false;storageError=false;
  try{records=key?restore(localStorage.getItem(key)):Object.create(null);}catch{records=Object.create(null);storageError=true;}
  // Account labels are explicit, never inferred from cookies or account UI.
  lastRender="";schedule();
}
function render(side,rows){
  if(panel&&panel.parentElement!==side){panel.remove();panel=null;lastRender="";}
  if(!panel){panel=node("section");panel.style.cssText="padding:8px;margin:4px;border:1px solid color-mix(in srgb,currentColor 18%,transparent);border-radius:8px;font-size:12px;line-height:1.5";side.prepend(panel);}
  const signature=JSON.stringify([scope,active,mode,storageError,rows.map(r=>[r.id,r.title,records[r.id]]),active&&records[active]]);
  if(signature===lastRender)return;lastRender=signature;
  panel.replaceChildren();
  const header=node("div","Workspace ");header.style.fontWeight="600";header.append(button(scope?"Account: "+scope:"Enable",switchScope));panel.append(header);
  if(!scope){panel.append(node("div","Select the local account label to enable metadata."));return;}
  if(storageError)panel.append(node("div","Local storage unavailable; changes may not persist."));
  const controls=node("div");controls.style.cssText="display:flex;gap:4px;flex-wrap:wrap;margin:5px 0";
  for(const [value,label] of [["native","Native"],["activity","Activity"],["type","Type"],["project","Project"]]){
    const b=button(label,()=>{mode=value;lastRender="";schedule();});b.setAttribute("aria-pressed",String(mode===value));if(mode===value)b.style.fontWeight="700";controls.append(b);
  }
  panel.append(controls);
  if(active){
    const r=records[active]||initial(active),line=node("div");
    const select=node("select");select.style.cssText="color:inherit;background:transparent;font:inherit";
    for(const t of TYPES){const o=node("option",t);o.value=t;select.append(o);}select.value=r.type;
    select.addEventListener("change",()=>{update(active,{kind:"type",value:select.value});schedule();});
    line.append(select,button("Project",()=>{const value=window.prompt("Non-sensitive project reference (local reference only; page-origin storage)",r.project);if(value!==null){update(active,{kind:"project",value});schedule();}}),button("Relate",()=>{const v=window.prompt("Related ChatGPT conversation URL");const i=v&&identity(v);if(i){update(active,{kind:"related",value:i.id});schedule();}}));
    panel.append(line,node("div",[r.project,r.draft?"Draft":"",r.state!=="unknown"?r.state:""].filter(Boolean).join(" · ")));
    for(const id of r.related){const row=node("div");const a=node("a","Related: "+(rows.find(x=>x.id===id)?.title||id));a.href="/c/"+id;row.append(a,button("×",()=>{update(active,{kind:"unlink",value:id});schedule();}));panel.append(row);}
  }
  if(mode!=="native"){
    const list=node("div");list.style.cssText="max-height:240px;overflow:auto";
    for(const r of sortRows(rows,records,mode)){
      const v=records[r.id]||initial(r.id),a=node("a",r.title);
      a.href=r.path;a.addEventListener("click",e=>{e.preventDefault();const target=[...side.querySelectorAll("a[href]")].find(x=>!x.closest("["+owner+"]")&&identity(x.getAttribute("href"))?.id===r.id);if(target)target.click();});a.style.cssText="display:block;padding:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:inherit";
      const label=[v.type==="unknown"?"?":v.type,v.draft?"draft":"",v.unread?"unread":"",v.state!=="unknown"?v.state:"",v.project].filter(Boolean).join(" · ");
      a.title=label;a.textContent=r.title+" ["+label+"]";list.append(a);
    }panel.append(list);
  }
}
function decorate(side){
  for(const a of side.querySelectorAll("a[href]")){
    if(a.closest("["+owner+"]"))continue;
    const i=identity(a.getAttribute("href"));if(!i)continue;
    const r=scope&&records[i.id],text=r?[r.type==="unknown"?"?":r.type,r.draft?"draft":"",r.unread?"unread":"",r.state==="running"?"running":r.state==="ended"?"ended":""].filter(Boolean).join(" · "):"";
    let badge=a.querySelector("span["+owner+"]");
    if(!text){badge?.remove();continue;}
    if(!badge){badge=node("span");badge.style.cssText="margin-left:4px;font-size:10px;opacity:.75;white-space:nowrap";a.append(badge);}
    if(badge.textContent!==text)badge.textContent=text;
  }
}
function scan(){
  timer=null;
  if(location.origin!=="https://chatgpt.com")return;
  observeCurrent();
  const side=findSidebar();
  if(!side){panel?.remove();panel=null;lastRender="";return;}
  const rows=discover(side);
  if(scope){let dirty=false,count=Object.keys(records).length;for(const r of rows){if(!records[r.id]&&count<5000){records[r.id]=initial(r.id);dirty=true;count++;}}if(dirty)save();}
  render(side,rows);decorate(side);
}
function schedule(){if(timer===null)timer=setTimeout(scan,180);}
function start(){
  if(observer)return;
  observer=new MutationObserver(changes=>{if(changes.some(m=>!m.target.closest?.("["+owner+"]")&&!(m.type==="childList"&&[...m.addedNodes,...m.removedNodes].length&&[...m.addedNodes,...m.removedNodes].every(n=>n.nodeType===1&&n.hasAttribute(owner)))))schedule();});
  observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:["data-testid","href","disabled"]});
  document.addEventListener("input",schedule,true);document.addEventListener("visibilitychange",schedule);window.addEventListener("focus",schedule);window.addEventListener("popstate",schedule);window.navigation?.addEventListener("currententrychange",schedule);schedule();
}
if(document.body)start();else document.addEventListener("DOMContentLoaded",start,{once:true});
})();