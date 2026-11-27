from playwright.sync_api import sync_playwright
import json, statistics

# Synthetic fixture: separate conversation list, stream, composer. Compare only
# the observer/scheduling/layout hot path, not the whole product.
HTML='''<style>body{display:flex;margin:0;font:14px sans-serif}nav{width:340px;flex:none;overflow:auto;height:95vh}nav a{display:block;padding:7px;margin:1px;overflow:hidden;white-space:nowrap}main{flex:1;padding:12px;min-width:0}#stream{height:65vh;overflow:auto}#prompt{width:95%;height:60px}</style><nav></nav><main><div id="stream"></div><textarea id="prompt"></textarea></main>'''
JS=r'''async ({mode, count})=>{
const nav=document.querySelector('nav'),stream=document.querySelector('#stream'),prompt=document.querySelector('#prompt');
for(let i=0;i<count;i++){let a=document.createElement('a');a.href='/c/'+String(i).padStart(32,'0');a.textContent='Synthetic conversation '+i;nav.append(a)}
for(let i=0;i<200;i++){let p=document.createElement('p');p.textContent='Existing rendered turn '+i;stream.append(p)}
let timer=null, scans=0, geometryReads=0, workMs=0, callbackBatches=0, records=0, ticks=0, inputs=0, inputDelays=[];
function scan(){timer=null;let start=performance.now();scans++;
// Mirrors installed findSidebar's expensive per-anchor/per-ancestor geometry/style reads.
for(const a of document.querySelectorAll('nav a[href],aside a[href],[role=navigation] a[href]')){
 a.getBoundingClientRect();getComputedStyle(a).display;geometryReads++;
 for(let el=a.parentElement;el&&el!==document.body;el=el.parentElement){el.getBoundingClientRect();getComputedStyle(el).display;geometryReads++;}
}
workMs+=performance.now()-start;
}
function schedule(){if(timer===null)timer=setTimeout(scan,180)}
const observer=new MutationObserver(changes=>{callbackBatches++;records+=changes.length;schedule()});
if(mode==='broad')observer.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-testid','href','disabled','hidden','aria-hidden','inert','class','style']});
if(mode==='scoped')observer.observe(nav,{childList:true,subtree:true,attributes:true,attributeFilter:['href','data-testid','aria-hidden','hidden']});
// Broad installed input handler requests the same entire scan. Scoped input only updates presence.
let draft=false;prompt.addEventListener('input',()=>{inputs++;if(mode==='broad')schedule();else draft=!!prompt.value;});
scan();let start=performance.now();
const streaming=setInterval(()=>{ticks++;const span=document.createElement('span');span.textContent=' token';stream.lastElementChild.append(span);stream.lastElementChild.classList.toggle('streaming');},16);
// Synthetic typing scheduling jitter, not real hardware key-to-paint latency.
let expected=performance.now()+50;const typing=setInterval(()=>{let now=performance.now();inputDelays.push(Math.max(0,now-expected));expected=now+50;prompt.value+='x';prompt.dispatchEvent(new Event('input',{bubbles:true}));},50);
await new Promise(r=>setTimeout(r,2400));clearInterval(streaming);clearInterval(typing);
// Actual sidebar update must still be observed.
const before=scans;const row=document.createElement('a');row.href='/c/new';row.textContent='New conversation';nav.append(row);await new Promise(r=>setTimeout(r,250));
observer.disconnect();if(timer!==null)clearTimeout(timer);
inputDelays.sort((a,b)=>a-b);return {mode,count,scans,geometryReads,callbackBatches,records,workMs:Math.round(workMs*100)/100,ticks,inputs,p95TimerJitterMs:Math.round(inputDelays[Math.floor((inputDelays.length-1)*.95)]*100)/100,sidebarUpdateObserved:scans>before};
}'''
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
 results=[]
 for count in (100,500):
  for mode in ('broad','scoped'):
   page=b.new_page();page.set_content(HTML);results.append(page.evaluate(JS,{'mode':mode,'count':count}));page.close()
 b.close()
print(json.dumps(results,indent=2))
