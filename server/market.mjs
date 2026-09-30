import {seed} from './seed.mjs';
import {createIfindClient,MarketError} from './ifind.mjs';
const client=createIfindClient();
const supported=seed.companies.filter(c=>c.market==='A股');
export function dataProviderStatus(env={}){return {ifind:{...client.status(env),displayAuthorized:env.IFIND_DISPLAY_AUTHORIZED==='true'},fuyao:{id:'fuyao',name:'扶摇',configured:false,state:'documentation_required',scope:'出题方未提供服务地址、接口协议或凭证，尚无法识别并实现对应接口。'},ifindMcp:{id:'ifind-mcp',name:'iFinD MCP',configured:false,state:'endpoint_required',scope:'HTTP行情接入口不等于MCP；MCP需要另行提供服务端点、鉴权方式和工具说明。'},coveredCompanies:supported.map(c=>({id:c.id,name:c.name,code:c.code})),credentialsInBrowser:false};}
const reply=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export async function handleMarket(request,env={}){
 try{
  const u=new URL(request.url),route=u.pathname.replace(/\/$/,'');
  if(route==='/api/providers'&&request.method==='GET')return reply(dataProviderStatus(env));
  if(route==='/api/quotes'&&request.method==='POST'){
   const origin=request.headers.get('origin');if(origin&&origin!==(env.PUBLIC_ORIGIN||u.origin))throw new MarketError('ORIGIN_DENIED','请求来源不匹配。',403);
   if(Number(request.headers.get('content-length')||0)>2048)throw new MarketError('REQUEST_TOO_LARGE','请求过大。',413);
   const raw=await request.text();if(raw.length>2048)throw new MarketError('REQUEST_TOO_LARGE','请求过大。',413);
   let body;try{body=JSON.parse(raw);}catch{throw new MarketError('INVALID_JSON','请求格式错误。',400);}
   const ids=body?.companyIds;if(!Array.isArray(ids)||!ids.length||ids.length>5||new Set(ids).size!==ids.length)throw new MarketError('INVALID_COMPANIES','请选择1–5个不重复的A股样本。',400);
   const selected=ids.map(id=>supported.find(c=>c.id===id));if(selected.some(c=>!c))throw new MarketError('UNSUPPORTED_MARKET','当前行情接入口只覆盖已登记A股样本，海外代码不自动猜测映射。',400);
   if(client.status(env).configured&&env.IFIND_DISPLAY_AUTHORIZED!=='true')throw new MarketError('IFIND_DISPLAY_NOT_AUTHORIZED','已配置凭证，尚未确认本次Web展示的数据使用权限。',403);
   const result=await client.quotes(selected.map(c=>c.code),env);return reply({...result,quotes:result.quotes.map(q=>({...q,companyId:selected.find(c=>c.code===q.code).id,name:selected.find(c=>c.code===q.code).name}))});
  }
  return reply({error:{code:'NOT_FOUND',message:'数据接口不存在。'}},404);
 }catch(e){return reply({error:{code:e instanceof MarketError?e.code:'MARKET_ERROR',message:e instanceof MarketError?e.message:'行情处理失败，原研究未改变。'}},e instanceof MarketError?e.status:500);}
}
