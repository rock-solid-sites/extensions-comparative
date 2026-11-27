'use strict';
// Synthetic, acquisition-independent archive reconciliation experiment. No provider data.
function makeArchiveCore(){
  const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const HASH=/^[0-9a-f]{64}$/;
  const canonicalId=x=>typeof x==="string"&&ID.test(x)?x.toLowerCase():null;
  function identity(raw){
    if(typeof raw!=="string")return null;
    const m=raw.match(/^(?:https:\/\/chatgpt\.com)?((?:\/u\/[0-9]+)?(?:\/g\/[a-z0-9_-]+)?\/c\/([a-f0-9-]+))\/?(?:[?#][^\r\n]*)?$/i);
    return m&&canonicalId(m[2])?{id:canonicalId(m[2]),url:"https://chatgpt.com"+m[1]}:null;
  }
  function time(value){
    if(typeof value==="number"&&Number.isFinite(value)&&value>0)return value<1e12?value*1000:value;
    if(typeof value==="string"&&value.trim()&&!/^\d+(?:\.\d+)?$/.test(value)){
      const t=Date.parse(value);if(Number.isFinite(t)&&t>0)return t;
    }
    return null;
  }
  function summary(row){
    if(!row||typeof row!=="object")return null;
    const id=canonicalId(row.id??row.conversation_id);
    if(!id)return null;
    const url=row.url?identity(row.url):{id,url:"https://chatgpt.com/c/"+id};
    if(!url||url.id!==id)return null;
    return {id,url:url.url,title:typeof row.title==="string"?row.title:null,updated:time(row.update_time)};
  }
  function plan(rows,records={},dirtyIds=[]){
    if(!Array.isArray(rows))throw Error("INVALID_LIST");
    const byId=new Map(),conflicts=new Set();let invalid=0;
    for(const row of rows){
      const s=summary(row);if(!s){invalid++;continue;}
      const prior=byId.get(s.id);
      if(prior&&(prior.updated!==s.updated||prior.title!==s.title))conflicts.add(s.id);
      else if(!prior)byId.set(s.id,s);
    }
    const dirty=new Set(dirtyIds.map(canonicalId).filter(Boolean));
    const queue=[],unchanged=[],recheck=[];
    for(const [id,s] of byId){
      const r=Object.hasOwn(records,id)?records[id]:null;
      if(conflicts.has(id)){recheck.push({id,reason:"conflicting-listing"});continue;}
      let reason=null;
      if(!r||r.coverage!=="verified"||!HASH.test(r.sha256??""))reason="missing-or-unverified";
      else if(dirty.has(id))reason="observed-change";
      else if(s.updated===null||!Number.isFinite(r.updated))reason="unknown-revision";
      else if(s.updated>r.updated)reason="newer-revision";
      else if(s.updated<r.updated)reason="older-listing-recheck";
      else if(s.title===null||s.title!==r.title)reason="metadata-change";
      if(reason)queue.push({...s,reason});else unchanged.push(id);
    }
    for(const id of dirty)if(!byId.has(id))queue.push({id,url:"https://chatgpt.com/c/"+id,title:null,updated:null,reason:"observed-change-not-listed"});
    return {queue,unchanged,recheck,invalid,unique:byId.size};
  }
  // Structural validation, source coverage proof and byte-hash verification
  // are external prerequisites. This is a decision about a verified receipt,
  // NOT a validator and NOT a durable store.
  function admit(previous,receipt){
    if(!receipt||!canonicalId(receipt.id)||!HASH.test(receipt.sha256??"")||receipt.hashVerified!==true)return "reject";
    if(previous&&canonicalId(previous.id)!==canonicalId(receipt.id))return "reject";
    if(receipt.coverage!=="verified")return "retain-partial";
    if(!previous||previous.coverage!=="verified")return "promote";
    if(receipt.sha256===previous.sha256)return "unchanged";
    if(!Number.isFinite(receipt.updated)||!Number.isFinite(previous.updated))return "retain-conflict";
    if(receipt.updated>previous.updated)return "promote-retain-old";
    if(receipt.updated<previous.updated)return "retain-older";
    return "retain-conflict";
  }
  return {identity,summary,plan,admit};
}
module.exports=makeArchiveCore();
