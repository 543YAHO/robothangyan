import {createHash} from 'node:crypto';

export const IFIND_DOCS='https://quantapi.51ifind.com/gwstatic/static/ds_web/quantapi-web/example.html';
const BASE='https://quantapi.51ifind.com/api/v1/';
const hash=s=>createHash('sha256').update(s).digest('hex');
export class MarketError extends Error{constructor(code,message,status=502){super(message);this.code=code;this.status=status;}}
const missing=v=>v===null||v===undefined||(typeof v==='string'&&['','--'].includes(v.trim()));
const number=v=>{if(missing(v))return null;if(typeof v!=='number'&&(typeof v!=='string'||!/^\d+(?:\.\d+)?$/.test(v.trim())))return null;const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;};
const scalar=(v,index=0)=>Array.isArray(v)?v[index]:v;

export function normalizeQuotes(payload,codes,queriedAt){
 if(!payload||!Array.isArray(payload.tables))throw new MarketError('IFIND_SCHEMA','iFinD返回的行情结构不符合预期，未展示未经核实的数据。');
 const byCode=new Map();
 for(const entry of payload.tables){
  if(!entry||typeof entry.thscode!=='string')throw new MarketError('IFIND_SCHEMA','行情缺少可核对的股票代码。');
  if(!codes.includes(entry.thscode))throw new MarketError('IFIND_CODE_MISMATCH','提供方返回非请求股票，未展示代码无法对齐的行情。');
  if(byCode.has(entry.thscode))throw new MarketError('IFIND_DUPLICATE','同一股票返回多组冲突数据，未自动选择价格。');
  const table=entry.table;
  if(!table||typeof table!=='object'||!Object.hasOwn(table,'latest'))throw new MarketError('IFIND_SCHEMA','行情缺少最新价字段，未以0代替。');
  const prices=Array.isArray(table.latest)?table.latest:[table.latest];
  if(prices.length!==1)throw new MarketError('IFIND_SCHEMA','实时快照返回多期价格，暂不猜测最新记录。');
  const raw=prices[0];const parsed=number(raw);const latest=parsed===0?null:parsed;
  if(parsed===null&&!missing(raw))throw new MarketError('IFIND_SCHEMA','价格字段不是有效的非负数。');
  const timeValue=scalar(entry.time??table.time??table.timeStamp??null);
  const sourceTime=typeof timeValue==='string'&&timeValue.length<80&&/\d{4}[-/]?\d{2}[-/]?\d{2}/.test(timeValue)?timeValue:null;
  byCode.set(entry.thscode,{code:entry.thscode,latest,currency:'CNY',unit:'元/股',sourceTime,queriedAt,priceStatus:parsed===0?'zero_unverified':latest===null?'missing':'returned',freshness:sourceTime?'provider_timestamp_only':'unknown',note:parsed===0?'源站返回0，未确认其含义，不展示为有效成交价。':sourceTime?'使用提供方时间；是否盘中实时仍取决于账号权限及市场状态。':'提供方未返回可识别行情时间，不标记为实时价。'});
 }
 return codes.map(code=>byCode.get(code)||{code,latest:null,currency:'CNY',unit:'元/股',sourceTime:null,queriedAt,priceStatus:'missing',freshness:'unknown',note:'提供方未返回该股票；不填0，不用其他股票价格代替。'});
}

export function createIfindClient({fetchFn=(...args)=>fetch(...args),now=()=>Date.now(),timeoutMs=12000}={}){
 let tokens=new Map(),cache=new Map(),lastSuccess=null;const busy=new Set(),rates=new Map();
 function credentials(env){return {refresh:(env.IFIND_REFRESH_TOKEN||'').trim(),access:(env.IFIND_ACCESS_TOKEN||'').trim()};}
 function keyFor(env){const c=credentials(env);return hash(c.refresh+'|'+c.access);}
 function status(env){const c=credentials(env),configured=!!(c.refresh||c.access);const current=lastSuccess?.key===keyFor(env)?lastSuccess:null;return {id:'ifind-http',name:'iFinD HTTP行情接口',configured,state:!configured?'not_configured':current?'verified':'configured_unverified',transport:'HTTP（不是iFinD MCP）',lastSuccessfulAt:current?.at||null,documentation:IFIND_DOCS,scope:'本轮仅连接所选A股样本最新价；尚未连接iFinD产业链、研报或MCP服务。',missing:configured?[]:['有数据接口权限的iFinD账号','refresh_token或仍有效的access_token']};}
 async function call(endpoint,headers,body){
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
   const response=await fetchFn(BASE+endpoint,{method:'POST',headers:{'Content-Type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{}),signal:ctrl.signal,redirect:'error'});
   if(response.status===401||response.status===403)throw new MarketError('IFIND_AUTH','iFinD拒绝访问：凭证失效或账号无对应数据权限。',401);
   if(response.status===429)throw new MarketError('IFIND_RATE_LIMIT','iFinD请求限流，请稍后重试。',429);
   if(!response.ok)throw new MarketError('IFIND_HTTP','iFinD服务暂不可用，业务证据和原研究不受影响。');
   if(Number(response.headers.get('content-length'))>2*1024*1024)throw new MarketError('IFIND_RESPONSE_TOO_LARGE','行情响应超出本轮上限。');
   const reader=response.body.getReader();const chunks=[];let size=0;
   for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2*1024*1024){await reader.cancel();throw new MarketError('IFIND_RESPONSE_TOO_LARGE','行情响应超出本轮上限。');}chunks.push(Buffer.from(value));}
   let data;try{data=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new MarketError('IFIND_SCHEMA','iFinD返回格式变化，暂不展示行情。');}
   if(!data||typeof data!=='object'||Array.isArray(data))throw new MarketError('IFIND_SCHEMA','iFinD响应字段不完整。');
   if(data.errorcode!==undefined&&Number(data.errorcode)!==0)throw new MarketError('IFIND_PROVIDER_ERROR','iFinD报告数据或权限错误，请在官方终端核对权限。');
   return data;
  }catch(e){if(e instanceof MarketError)throw e;if(e.name==='AbortError')throw new MarketError('IFIND_TIMEOUT','iFinD访问超时，请重试；原研究未改变。',504);throw new MarketError('IFIND_NETWORK','iFinD网络请求未完成，原研究未改变。');}finally{clearTimeout(timer);}
 }
 async function accessToken(env,renew=false){
  const c=credentials(env),key=keyFor(env);if(!c.refresh&&!c.access)throw new MarketError('IFIND_NOT_CONFIGURED','iFinD接口已准备，但没有可用的数据凭证；请先开通账号权限并完成服务器配置。',503);
  const old=tokens.get(key);if(!renew&&old&&old.until>now())return old.value;
  if(c.access&&!renew)return c.access;
  if(!c.refresh)throw new MarketError('IFIND_AUTH','access_token已失效，且未配置refresh_token；请在服务器更新凭证。',401);
  const result=await call('get_access_token',{refresh_token:c.refresh});const value=result.data?.access_token;
  if(typeof value!=='string'||value.length<5)throw new MarketError('IFIND_TOKEN_SCHEMA','iFinD未返回有效访问令牌，不能继续请求行情。');
  const expiry=Number(result.data?.expires_in);const ttl=Number.isFinite(expiry)&&expiry>0?Math.min(600000,Math.max(0,(expiry-30)*1000)):600000;
  if(tokens.size>8)tokens.clear();tokens.set(key,{value,until:now()+ttl});return value;
 }
 async function quotes(codes,env={}){
  if(!Array.isArray(codes)||codes.length<1||codes.length>5||new Set(codes).size!==codes.length||codes.some(x=>typeof x!=='string'||!/^\d{6}\.(SH|SZ)$/.test(x)))throw new MarketError('INVALID_CODES','本轮最多查询5个不重复的A股样本代码。',400);
  if(!status(env).configured)throw new MarketError('IFIND_NOT_CONFIGURED','iFinD接口已准备，尚未配置数据凭证。没有向提供方发送请求。',503);
  const credentialKey=keyFor(env),key=credentialKey+':'+[...codes].sort().join(',');const old=cache.get(key);
  if(old&&old.expires>now())return {...old.value,quotes:codes.map(code=>old.value.quotes.find(q=>q.code===code)),cached:true};
  if(busy.has(credentialKey))throw new MarketError('IFIND_BUSY','行情请求正在进行，请等待本次完成。',429);
  const recent=(rates.get(credentialKey)||[]).filter(t=>now()-t<60000);if(recent.length>=10)throw new MarketError('IFIND_LOCAL_RATE_LIMIT','每分钟最多触发10次行情查询，请稍后重试。',429);recent.push(now());rates.set(credentialKey,recent);busy.add(credentialKey);
  try{
   let token=await accessToken(env);let data;
   try{data=await call('real_time_quotation',{access_token:token},{codes:codes.join(','),indicators:'latest'});}catch(e){if(e.code!=='IFIND_AUTH'||!credentials(env).refresh)throw e;token=await accessToken(env,true);data=await call('real_time_quotation',{access_token:token},{codes:codes.join(','),indicators:'latest'});}
   const queriedAt=new Date(now()).toISOString();const rows=normalizeQuotes(data,codes,queriedAt);const count=rows.filter(x=>x.latest!==null).length;
   if(!count)throw new MarketError('IFIND_NO_QUOTES','iFinD未返回可用价格。可能无权限、无数据或行情范围不符；不以0补齐。');
   const value={provider:'iFinD HTTP',endpoint:'real_time_quotation',documentation:IFIND_DOCS,requestedIndicators:['latest'],queriedAt,quotes:rows,partial:count!==codes.length,cached:false,rankingAvailable:false,notice:'本次仅展示样本最新价，不据价格高低生成热门排名；提供方时间缺失时不标成实时。'};
   if(cache.size>30)cache.clear();cache.set(key,{expires:now()+15000,value});lastSuccess={key:credentialKey,at:queriedAt};return value;
  }catch(e){
   if(['IFIND_AUTH','IFIND_PROVIDER_ERROR'].includes(e.code)){
    tokens.delete(credentialKey);
    for(const k of cache.keys())if(k.startsWith(credentialKey+':'))cache.delete(k);
    if(lastSuccess?.key===credentialKey)lastSuccess=null;
   }
   throw e;
  }finally{busy.delete(credentialKey);}
 }
 return {status,quotes};
}
