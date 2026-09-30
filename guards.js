(() => {
 const stages=new Set(['revenue','delivery','validation','research','statement','insufficient','capability','unresolved']);
 const scopes=new Set(['明确','上下文关联','人形用途待核实','应用口径待核实']);
 const nonempty=x=>typeof x==='string'&&x.trim().length>0;
 const https=x=>{try{const u=new URL(x);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
 const strings=x=>Array.isArray(x)&&x.every(y=>typeof y==='string');
 const fail=()=>{throw new Error('返回资料的字段、来源或数字口径不完整，当前研究结果未改变。');};
 function source(s,hashed=false){return s&&nonempty(s.id)&&nonempty(s.title)&&nonempty(s.published)&&https(s.url)&&(!hashed||/^[a-f0-9]{64}$/i.test(s.sha256||''));}
 function listing(x,id){if(!x||x.companyId!==id||!Array.isArray(x.sources)||!nonempty(x.coverage)||!Number.isFinite(Date.parse(x.checkedAt))||!x.sources.every(s=>source(s)))fail();return x;}
 function analysis(x,id){
  if(!x||x.companyId!==id||!source(x.source,true)||!Number.isFinite(Date.parse(x.checkedAt))||!nonempty(x.coverage)||!Number.isInteger(x.pageCount)||x.pageCount<1||x.pageCount>400||!Array.isArray(x.facts)||x.facts.length>24||!x.model||typeof x.model.used!=='boolean'||!nonempty(x.model.status)||!nonempty(x.model.message))fail();
  const ids=new Set();
  for(const f of x.facts){if(!f||!nonempty(f.id)||ids.has(f.id)||!Number.isInteger(f.page)||f.page<1||f.page>x.pageCount||!nonempty(f.excerpt)||f.excerpt.length<12||f.excerpt.length>360||!stages.has(f.stage)||!scopes.has(f.scope)||!nonempty(f.label)||!nonempty(f.reason))fail();ids.add(f.id);}
  return x;
 }
 function version(v){const p=v?.patch;return !!(v&&nonempty(v.companyId)&&source(v.source,true)&&p&&stages.has(p.stageKey)&&nonempty(p.stage)&&scopes.has(p.relation)&&nonempty(p.verdict)&&strings(p.known)&&strings(p.unknown)&&Array.isArray(p.evidence)&&p.evidence.length&&p.evidence.every(e=>e&&nonempty(e.source)&&(e.page==null||(Number.isInteger(e.page)&&e.page>0))));}
 (typeof window==='undefined'?globalThis:window).ResearchGuards=Object.freeze({listing,analysis,version});
})();
