import http from 'node:http';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {handle} from './research.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const staticFiles=new Set(['index.html','app.js','styles.css','data.js','research-data.json','README.md','核查记录.md','AI使用与验证记录.md','测试说明.md','test-results-v2.json']);
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8'};
const server=http.createServer(async(req,res)=>{
 try{
  const protocol=req.headers['x-forwarded-proto']==='https'?'https':'http';
  const url=new URL(req.url,protocol+'://'+req.headers.host);
  if(url.pathname.startsWith('/api/')){
   const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>4096){res.writeHead(413);res.end('Request too large');return;}chunks.push(chunk);}
   const request=new Request(url,{method:req.method,headers:req.headers,...(['GET','HEAD'].includes(req.method)?{}:{body:Buffer.concat(chunks)})});
   const result=await handle(request,process.env);res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return;
  }
  const name=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
  if(!staticFiles.has(name)){res.writeHead(404);res.end('Not found');return;}
  const body=await readFile(path.join(root,name));res.writeHead(200,{'Content-Type':types[path.extname(name)]||'application/octet-stream','X-Content-Type-Options':'nosniff'});res.end(body);
 }catch{res.writeHead(500);res.end('Request failed');}
});
server.listen(Number(process.env.PORT||8765),process.env.HOST||'127.0.0.1',()=>console.log('Research preview ready on port '+(process.env.PORT||8765)));
