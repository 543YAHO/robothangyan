import fs from 'node:fs';import vm from 'node:vm';import assert from 'node:assert/strict';import {pathToFileURL} from 'node:url';
const {parseHTML}=await import(process.env.LINKEDOM_PATH?pathToFileURL(process.env.LINKEDOM_PATH):'linkedom');
const root=new URL('../',import.meta.url);const read=n=>fs.readFileSync(new URL(n,root),'utf8');const tests=[];
function setup({store=new Map(),broken=false,apiFailure=false}={}){
 const {window}=parseHTML(read('index.html'));delete window.RESEARCH_DATA;
 window.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
 window.URL=URL;window.AbortController=AbortController;window.confirm=()=>true;
 for(const s of window.document.querySelectorAll('select'))Object.defineProperty(s,'value',{get(){return this.querySelector('option[selected]')?.value??this.querySelector('option')?.value??'';},set(v){for(const o of this.querySelectorAll('option'))o.toggleAttribute('selected',o.value===v);},configurable:true});
 const fixture={companyId:'top',source:{id:'fixture-report',title:'测试用报告（非新增公司事实）',published:'2026-09-30',url:'https://static.cninfo.com.cn/fixture.pdf',sha256:'a'.repeat(64)},checkedAt:'2026-09-30T05:00:00Z',facts:[{id:'f1',page:1,excerpt:'公司人形机器人产品处于客户送样验证阶段。',label:'送样／客户验证',stage:'validation',scope:'明确',reason:'只支持送样，不支持收入。'}],model:{used:false,message:'规则模式'},changed:null,isLatestInSearch:true,notice:'测试候选'};
 window.fetch=async path=>{if(apiFailure)throw Error('测试网络失败，当前结果未改变');let payload;if(path.endsWith('status'))payload={mode:'rules_only'};else if(path.includes('announcements'))payload={sources:[fixture.source],checkedAt:fixture.checkedAt,coverage:'测试来源列表'};else payload=fixture;return {ok:true,json:async()=>payload};};
 const ctx=vm.createContext(window);if(!broken)vm.runInContext(read('data.js'),ctx);vm.runInContext(read('app.js'),ctx);
 const $=id=>window.document.getElementById(id);const input=(id,v)=>{$(id).value=v;$(id).dispatchEvent(new window.Event(id==='search'?'input':'change'));};
 return {window,doc:window.document,$,input,store};
}
async function check(name,fn){await fn();tests.push({name,result:'PASS'});}
const t=setup();await Promise.resolve();
await check('八家公司和来源正确加载',()=>{assert.equal(t.doc.querySelectorAll('#list .company').length,8);assert.match(t.$('detail').textContent,/590,299千元/);});
await check('搜索与无匹配恢复',()=>{t.input('search','601689');assert.equal(t.doc.querySelectorAll('#list .company').length,1);t.input('search','不存在<script>');assert.match(t.$('detail').textContent,/不代表该公司没有相关业务/);t.$('clear').click();});
await check('严格用途筛选',()=>{t.input('scope','explicit');assert.equal(t.doc.querySelectorAll('#list .company').length,4);t.input('scope','all');});
await check('中日产品对照与不可比限制',()=>{t.doc.querySelector('[data-company=green]').click();t.$('tab-compare').click();assert.match(t.$('tabpanel').textContent,/中日精密传动/);assert.match(t.$('tabpanel').textContent,/币种、期间/);});
await check('产业链层级、热门数据缺失状态与公司导航',()=>{t.doc.querySelector('[data-view=industry]').click();assert.match(t.$('industry-view').textContent,/核心零部件/);t.$('hot-list').click();assert.match(t.$('discovery-content').textContent,/不使用虚构/);t.$('representatives').click();t.doc.querySelector('[data-company-open=top]').click();assert.match(t.$('detail').textContent,/拓普集团/);});
await check('真实事件与财务传导断点',()=>{t.$('tab-impact').click();assert.match(t.$('tabpanel').textContent,/2026-07-23/);assert.match(t.$('tabpanel').textContent,/本轮没有证明其为Optimus供应商/);assert.match(t.$('tabpanel').textContent,/经营现金流/);});
await check('情景空值、越界和公式',()=>{t.$('scenario').onsubmit({preventDefault(){}});assert.match(t.$('result').textContent,/请填写完整/);for(const [k,v]of Object.entries({units:'1000',value:'10000',share:'101',realization:'80'}))t.$(k).value=v;t.$('scenario').onsubmit({preventDefault(){}});assert.match(t.$('result').textContent,/0–100%/);t.$('share').value='20';t.$('scenario').onsubmit({preventDefault(){}});assert.match(t.$('result').textContent,/1,600,000 元/);});
await check('手动查询→提取→确认前禁止保存',async()=>{t.$('tab-update').click();await t.$('load-sources').onclick();assert.ok(t.$('report-select'));await t.$('analyze-report').onclick();assert.ok(t.doc.querySelector('input[name=candidate]'));assert.equal(t.$('apply-update').disabled,true);});
await check('补充弱证据不降级，保存来源与版本',()=>{const r=t.doc.querySelector('input[name=candidate]');r.checked=true;r.onchange();t.$('review-confirm').checked=true;t.$('review-confirm').onchange();t.$('apply-update').click();assert.match(t.doc.querySelector('.badge.main').textContent,/小批量交付/);assert.equal(JSON.parse(t.store.get('robot-evidence-history-v2')).length,1);t.doc.querySelector('[data-view=history]').click();assert.match(t.$('history-view').textContent,/小批量交付/);assert.match(t.$('history-view').textContent,/规则提取\+用户复核/);});
await check('刷新恢复本机版本并可恢复公开基线',()=>{const x=setup({store:t.store});x.input('search','601689');assert.match(x.doc.querySelector('.badge.main').textContent,/小批量交付/);x.doc.querySelector('[data-view=history]').click();x.$('reset-history').click();assert.equal(t.store.size,0);});
await check('服务失败保留原结论并展示错误',async()=>{const x=setup({apiFailure:true});x.input('search','601689');const before=x.doc.querySelector('.badge.main').textContent;x.$('tab-update').click();await x.$('load-sources').onclick();assert.match(x.$('tabpanel').textContent,/测试网络失败/);assert.equal(x.doc.querySelector('.badge.main').textContent,before);});
await check('数据加载失败明确提示',()=>{const x=setup({broken:true});assert.equal(x.$('fatal').hidden,false);assert.equal(x.$('app').hidden,true);});
const report={checkedAt:new Date().toISOString(),kind:'DOM交互逻辑测试，非完整浏览器视觉测试',passed:tests.length,tests};fs.writeFileSync(new URL('test-results-v2.json',root),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
