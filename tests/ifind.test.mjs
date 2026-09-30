import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {parseHTML} from 'linkedom';
import {createIfindClient,normalizeQuotes} from '../server/ifind.mjs';
import {handleMarket,dataProviderStatus} from '../server/market.mjs';
import {seed} from '../server/seed.mjs';

// All prices, tokens and payloads below are synthetic test fixtures, never live market data.
const codes=['601689.SH','002050.SZ'];
const env={IFIND_ACCESS_TOKEN:'SYNTHETIC_TEST_ACCESS'};
const refreshEnv={IFIND_REFRESH_TOKEN:'SYNTHETIC_TEST_REFRESH'};
const at='2026-09-30T09:00:00.000Z';
const entry=(code=codes[0],latest=12.34,time)=>({thscode:code,table:{latest:[latest]},...(time?{time:[time]}:{})});
const payload=(rows=[entry()])=>({errorcode:0,tables:rows});
const json=x=>new Response(JSON.stringify(x),{headers:{'Content-Type':'application/json'}});
const reject=(promise,code)=>assert.rejects(promise,e=>e.code===code&&!e.message.includes('SYNTHETIC_TEST'));
const request=(body,headers={})=>new Request('https://example.test/api/quotes',{method:'POST',headers,body:typeof body==='string'?body:JSON.stringify(body)});

test('iFinD无凭证不发请求，也不声称已接通',async()=>{
 let calls=0;const c=createIfindClient({fetchFn:async()=>{calls++;return json(payload());}});
 assert.equal(c.status({}).state,'not_configured');
 await reject(c.quotes([codes[0]],{}),'IFIND_NOT_CONFIGURED');assert.equal(calls,0);
 assert.equal(c.status(env).state,'configured_unverified');
});
test('官方固定端点与headers换取令牌，令牌及15秒快照缓存有效',async()=>{
 let t=Date.parse(at);const calls=[];
 const c=createIfindClient({now:()=>t,fetchFn:async(url,options)=>{
  calls.push({url,options});assert.equal(options.redirect,'error');
  return url.endsWith('get_access_token')?json({data:{access_token:'SYNTHETIC_TEST_RETURNED'}}):json(payload(codes.map(code=>entry(code))));
 }});
 const first=await c.quotes(codes,refreshEnv);
 assert.equal(calls[0].url,'https://quantapi.51ifind.com/api/v1/get_access_token');
 assert.equal(calls[0].options.headers.refresh_token,refreshEnv.IFIND_REFRESH_TOKEN);
 assert.equal(calls[1].url,'https://quantapi.51ifind.com/api/v1/real_time_quotation');
 assert.equal(calls[1].options.headers.access_token,'SYNTHETIC_TEST_RETURNED');
 assert.deepEqual(JSON.parse(calls[1].options.body),{codes:codes.join(','),indicators:'latest'});
 const cached=await c.quotes([...codes].reverse(),refreshEnv);
 assert.equal(cached.cached,true);assert.deepEqual(cached.quotes.map(q=>q.code),[...codes].reverse());assert.equal(calls.length,2);
 t+=16000;await c.quotes(codes,refreshEnv);assert.equal(calls.length,3);
 assert.equal(c.status(refreshEnv).state,'verified');assert.equal(first.rankingAvailable,false);
 assert.ok(!JSON.stringify(first).includes('SYNTHETIC_TEST'));assert.ok(!JSON.stringify(c.status(refreshEnv)).includes('SYNTHETIC_TEST'));
});
test('401只换取一次令牌，后续优先使用已刷新的令牌',async()=>{
 let t=Date.parse(at),renewals=0;const seen=[];
 const both={...env,...refreshEnv};
 const c=createIfindClient({now:()=>t,fetchFn:async(url,o)=>{
  if(url.endsWith('get_access_token')){renewals++;return json({data:{access_token:'SYNTHETIC_TEST_NEW'}});}
  seen.push(o.headers.access_token);return o.headers.access_token===env.IFIND_ACCESS_TOKEN?new Response('',{status:401}):json(payload());
 }});
 await c.quotes([codes[0]],both);t+=16000;await c.quotes([codes[0]],both);
 assert.equal(renewals,1);assert.deepEqual(seen,[env.IFIND_ACCESS_TOKEN,'SYNTHETIC_TEST_NEW','SYNTHETIC_TEST_NEW']);
});
test('持续401不循环重试，业务错误码不猜成可自动刷新',async()=>{
 let calls=0;const c=createIfindClient({fetchFn:async(url)=>{calls++;return url.endsWith('get_access_token')?json({data:{access_token:'SYNTHETIC_TEST_NEW'}}):new Response('',{status:401});}});
 await reject(c.quotes([codes[0]],{...env,...refreshEnv}),'IFIND_AUTH');assert.equal(calls,3);
 let errors=0;const d=createIfindClient({fetchFn:async()=>{errors++;return json({errorcode:-999,errmsg:'SYNTHETIC_TEST_SECRET'});}});
 await reject(d.quotes([codes[0]],{...env,...refreshEnv}),'IFIND_PROVIDER_ERROR');assert.equal(errors,1);
});
test('429、5xx、坏JSON、无效令牌响应与网络错误脱敏',async()=>{
 for(const [response,code]of [
  [()=>new Response('SYNTHETIC_TEST_SECRET',{status:429}),'IFIND_RATE_LIMIT'],
  [()=>new Response('SYNTHETIC_TEST_SECRET',{status:503}),'IFIND_HTTP'],
  [()=>new Response('SYNTHETIC_TEST_SECRET'),'IFIND_SCHEMA'],
  [()=>json([]),'IFIND_SCHEMA'],
  [()=>{throw Error('SYNTHETIC_TEST_SECRET');},'IFIND_NETWORK']
 ])await reject(createIfindClient({fetchFn:async()=>response()}).quotes([codes[0]],env),code);
 await reject(createIfindClient({fetchFn:async()=>json({data:{}})}).quotes([codes[0]],refreshEnv),'IFIND_TOKEN_SCHEMA');
});
test('超时中止、流中断及超大响应不产出半份行情',async()=>{
 const timeout=createIfindClient({timeoutMs:5,fetchFn:(_url,o)=>new Promise((resolve,reject)=>o.signal.addEventListener('abort',()=>reject(new DOMException('timeout','AbortError'))))});
 await reject(timeout.quotes([codes[0]],env),'IFIND_TIMEOUT');
 for(const response of [
  ()=>new Response('x',{headers:{'content-length':String(3*1024*1024)}}),
  ()=>new Response('x'.repeat(2*1024*1024+1))
 ])await reject(createIfindClient({fetchFn:async()=>response()}).quotes([codes[0]],env),'IFIND_RESPONSE_TOO_LARGE');
 const stream=new ReadableStream({start(c){c.error(Error('SYNTHETIC_TEST_SECRET'));}});
 await reject(createIfindClient({fetchFn:async()=>new Response(stream)}).quotes([codes[0]],env),'IFIND_NETWORK');
});
test('行情代码逐一对齐，错代码、重复、多期或缺字段拒绝',()=>{
 for(const [data,code]of [
  [payload([entry('999999.SH')]),'IFIND_CODE_MISMATCH'],
  [payload([entry(),entry()]),'IFIND_DUPLICATE'],
  [payload([{thscode:codes[0],table:{latest:[1,2]}}]),'IFIND_SCHEMA'],
  [payload([{thscode:codes[0],table:{}}]),'IFIND_SCHEMA'],
  [payload([null]),'IFIND_SCHEMA'],
  [{},'IFIND_SCHEMA']
 ])assert.throws(()=>normalizeQuotes(data,codes,at),e=>e.code===code);
});
test('空白或缺失值不填0，源站0标待核，异常数字拒绝',()=>{
 for(const value of [null,undefined,'','  ','--',0,'0']){
  const row=normalizeQuotes(payload([{thscode:codes[0],table:{latest:[value]}}]),codes,at)[0];
  assert.equal(row.latest,null);if(value===0||value==='0')assert.equal(row.priceStatus,'zero_unverified');
 }
 for(const value of [-1,'NaN','Infinity',true,{},'0xff','<script>']){
  assert.throws(()=>normalizeQuotes(payload([entry(codes[0],value)]),codes,at),e=>e.code==='IFIND_SCHEMA');
 }
 const rows=normalizeQuotes(payload(),codes,at);assert.equal(rows[1].latest,null);assert.equal(rows[1].priceStatus,'missing');
});
test('提供方时间与查询时间分开，未返回时间不伪称实时',()=>{
 const absent=normalizeQuotes(payload(),codes,at)[0];assert.equal(absent.sourceTime,null);assert.equal(absent.freshness,'unknown');
 const old='2020-01-02 15:00:00';const row=normalizeQuotes(payload([entry(codes[0],12.34,old)]),codes,at)[0];
 assert.equal(row.sourceTime,old);assert.equal(row.queriedAt,at);assert.notEqual(row.freshness,'realtime');
});
test('无有效报价不能验证成功，部分返回保留缺失行',async()=>{
 const empty=createIfindClient({fetchFn:async()=>json(payload([entry(codes[0],0)]))});
 await reject(empty.quotes([codes[0]],env),'IFIND_NO_QUOTES');assert.equal(empty.status(env).state,'configured_unverified');
 const c=createIfindClient({fetchFn:async()=>json(payload())});const r=await c.quotes(codes,env);
 assert.equal(r.partial,true);assert.equal(r.quotes[1].latest,null);
});
test('网络失败保留最后成功时间，权限撤销后清除验证状态',async()=>{
 let t=Date.parse(at),status=200;const c=createIfindClient({now:()=>t,fetchFn:async()=>status===200?json(payload()):new Response('',{status})});
 const first=await c.quotes([codes[0]],env);t+=16000;status=503;await reject(c.quotes([codes[0]],env),'IFIND_HTTP');
 assert.equal(c.status(env).lastSuccessfulAt,first.queriedAt);
 status=403;await reject(c.quotes([codes[0]],env),'IFIND_AUTH');assert.equal(c.status(env).lastSuccessfulAt,null);
 assert.equal(c.status({...env,IFIND_ACCESS_TOKEN:'DIFFERENT_TEST_TOKEN'}).state,'configured_unverified');
});
test('并发与本机限流限制请求，失败可重试且未缓存',async()=>{
 let release;const c=createIfindClient({fetchFn:()=>new Promise(resolve=>{release=resolve;})});
 const first=c.quotes([codes[0]],env);await Promise.resolve();
 await reject(c.quotes([codes[0]],env),'IFIND_BUSY');release(json(payload()));await first;
 let calls=0;const d=createIfindClient({fetchFn:async()=>{calls++;return new Response('',{status:503});}});
 for(let i=0;i<10;i++)await reject(d.quotes([codes[0]],env),'IFIND_HTTP');
 await reject(d.quotes([codes[0]],env),'IFIND_LOCAL_RATE_LIMIT');assert.equal(calls,10);
});
test('仅登记A股、请求上限与同源限制；配置和展示许可不能互相替代',async()=>{
 const old=globalThis.fetch;let calls=0;globalThis.fetch=async()=>{calls++;throw Error('unexpected network');};
 try{
  const checks=[
   [request({companyIds:['top']}),{},503,'IFIND_NOT_CONFIGURED'],
   [request({companyIds:['top']}),env,403,'IFIND_DISPLAY_NOT_AUTHORIZED'],
   [request({companyIds:['top']}),{...env,IFIND_DISPLAY_AUTHORIZED:'false'},403,'IFIND_DISPLAY_NOT_AUTHORIZED'],
   [request({companyIds:['top','top']}),{},400,'INVALID_COMPANIES'],
   [request({companyIds:['tesla']}),{},400,'UNSUPPORTED_MARKET'],
   [request({companyIds:['top']},{origin:'https://wrong.test'}),{},403,'ORIGIN_DENIED'],
   [request('bad json'),{},400,'INVALID_JSON'],
   [request('x'.repeat(2049)),{},413,'REQUEST_TOO_LARGE']
  ];
  for(const [req,config,status,code]of checks){const r=await handleMarket(req,config);assert.equal(r.status,status);assert.equal((await r.json()).error.code,code);}
  assert.equal(calls,0);assert.equal(dataProviderStatus(env).ifind.configured,true);assert.equal(dataProviderStatus(env).ifind.displayAuthorized,false);
  assert.ok(!JSON.stringify(dataProviderStatus(env)).includes(env.IFIND_ACCESS_TOKEN));
 }finally{globalThis.fetch=old;}
});
test('API映射回对应公司且不修改证据，合成响应不落入产品基线',async()=>{
 const old=globalThis.fetch;const before=JSON.stringify(seed);globalThis.fetch=async()=>json(payload());
 try{
  const r=await handleMarket(request({companyIds:['top']}),{...env,IFIND_DISPLAY_AUTHORIZED:'true'});assert.equal(r.status,200);
  const q=await r.json();assert.equal(q.quotes[0].companyId,'top');assert.equal(q.quotes[0].code,codes[0]);assert.equal(q.quotes[0].name,'拓普集团');
  assert.equal(JSON.stringify(seed),before);assert.ok(!JSON.stringify(q).includes(env.IFIND_ACCESS_TOKEN));
 }finally{globalThis.fetch=old;}
});

function panel(api){
 const {window}=parseHTML('<html><body><main id="host"></main></body></html>');
 vm.runInContext(fs.readFileSync(new URL('../market-panel.js',import.meta.url),'utf8'),vm.createContext(window));
 const esc=x=>String(x??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
 const host=window.document.getElementById('host');window.MarketPanel.create({esc,api,companies:seed.companies}).mount(host);
 return {host,button:id=>host.querySelector('#'+id)};
}
const ready={ifind:{configured:true,displayAuthorized:true,state:'configured_unverified'}};
const quoteFixture={provider:'iFinD HTTP',queriedAt:at,quotes:seed.companies.filter(c=>c.market==='A股').map(c=>({companyId:c.id,code:c.code,name:c.name,latest:12.34,currency:'CNY',unit:'元/股',sourceTime:null,note:'合成测试数据，非真实行情'}))};
test('行情DOM：无凭证和无展示许可时禁用取数',async()=>{
 for(const state of [{ifind:{configured:false,displayAuthorized:false,state:'not_configured'}},{ifind:{...ready.ifind,displayAuthorized:false}}]){
  const p=panel(async()=>state);await p.button('check-providers').onclick();assert.equal(p.button('refresh-quotes').disabled,true);assert.equal(p.host.querySelector('table'),null);
 }
});
test('行情DOM：刷新网络失败标旧，权限失效清除旧行情',async()=>{
 let mode='ok';const p=panel(async name=>{if(name==='providers')return ready;if(mode!=='ok')throw Object.assign(Error('测试错误'),{code:mode});return structuredClone(quoteFixture);});
 await p.button('check-providers').onclick();await p.button('refresh-quotes').onclick();assert.ok(p.host.querySelector('table'));
 mode='IFIND_TIMEOUT';await p.button('refresh-quotes').onclick();assert.match(p.host.textContent,/刷新暂时失败，以下保留的是上次价格/);
 mode='IFIND_AUTH';await p.button('refresh-quotes').onclick();assert.equal(p.host.querySelector('table'),null);assert.equal(p.button('refresh-quotes').disabled,true);
});
test('行情DOM：错公司或坏数字不替换旧快照，停用许可清除旧行情',async()=>{
 let current=structuredClone(quoteFixture),provider=ready;const p=panel(async name=>name==='providers'?provider:current);
 await p.button('check-providers').onclick();await p.button('refresh-quotes').onclick();
 current={...current,quotes:current.quotes.map((q,i)=>i? q:{...q,code:'999999.SH',latest:999999})};
 await p.button('refresh-quotes').onclick();assert.match(p.host.textContent,/未替换已有行情/);assert.ok(!p.host.textContent.includes('999999'));
 provider={ifind:{...ready.ifind,displayAuthorized:false}};await p.button('check-providers').onclick();assert.equal(p.host.querySelector('table'),null);
});
