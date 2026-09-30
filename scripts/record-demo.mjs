import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const url=process.env.DEMO_URL||'http://127.0.0.1:8765';
const out=path.resolve(process.env.DEMO_OUTPUT||'demo-artifacts');await fs.mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000},locale:'zh-CN',timezoneId:'Asia/Shanghai',recordVideo:{dir:out,size:{width:1440,height:1000}}});
const page=await context.newPage();const video=page.video();const started=Date.now();const errors=[];page.on('pageerror',e=>errors.push(e.message));
async function caption(text){await page.evaluate(t=>{let e=document.getElementById('recording-caption');if(!e){e=document.createElement('div');e.id='recording-caption';Object.assign(e.style,{position:'fixed',left:'8%',right:'8%',bottom:'20px',zIndex:'9999',padding:'14px 20px',background:'rgba(13,42,49,.94)',color:'white',borderRadius:'10px',fontFamily:'sans-serif',fontSize:'22px',lineHeight:'1.5',pointerEvents:'none',textAlign:'center'});document.body.appendChild(e);}e.textContent=t;},text);}
async function pause(ms=8000){await page.waitForTimeout(ms);}
async function screenshot(name){await page.locator('#recording-caption').evaluate(e=>e.style.visibility='hidden');await page.screenshot({path:path.join(out,name),fullPage:true});await page.locator('#recording-caption').evaluate(e=>e.style.visibility='visible');}
let result={};
try{
 await page.goto(url,{waitUntil:'networkidle',timeout:40000});await page.locator('#list .company').first().waitFor();
 await caption('朔风：从一家公司的概念标签，查到可追溯的业务证据。');await pause();await screenshot('home.png');
 await page.locator('#search').fill('拓普');await caption('输入公司名，先看业务阶段、用途边界，以及哪些事实仍不能确认。');await pause();
 await screenshot('company.png');
 await page.locator('.source').first().scrollIntoViewIfNeeded();await caption('每条判断保留原文、日期与页码。供货能力、实际交付、确认收入分别判断。');await pause();
 await page.locator('[data-view=industry]').click();await page.evaluate(()=>scrollTo(0,0));await caption('按功能层和产品节点组织产业链，公司归属落实到具体产品和证据。');await pause();await screenshot('industry.png');await caption('从整机和零部件找到公司，再回到报告查看业务进展；项目说明和数据使用详情见README。');await pause(8000);
 await page.locator('[data-company-open=green]').first().click();await page.locator('#tab-compare').click();await caption('中外比较解释“为什么可比”，同时保留用途、币种、期间和业务组合的限制。');await pause();await screenshot('comparison.png');
 await page.locator('#tab-impact').click();await caption('海外、政策和供需变化落实到公司产品，以及收入、毛利、存货和现金流。缺少供应关系时不判断确定受益。');await pause();await page.locator('#event-select').selectOption('demand-stress');await pause(6000);await screenshot('transmission.png');
 await page.locator('[data-company=top]').click();await page.locator('#tab-update').click();await caption('手动更新：查询公开报告，提取证据候选，再由使用者复核。');await page.locator('#load-sources').click();await page.locator('#report-select').waitFor({timeout:30000});await page.locator('#analyze-report').click();
 await caption('查询与提取有明确状态；命中缓存会注明复用。异常时保留旧结论，不制造新进展。');
 await page.locator('.candidate').first().waitFor({timeout:50000});await screenshot('update.png');
 const precise=page.locator('.candidate').filter({hasText:'小批量交付'});const candidate=await precise.count()?precise.first():page.locator('.candidate').first();await candidate.locator('input').check();await page.locator('#review-confirm').check();await page.locator('#apply-update').click();
 await page.locator('[data-view=history]').click();await caption('确认后保存个人研究版本。新旧来源和判断可复核、导出，也能恢复基线。');await pause(10000);await screenshot('history.png');
 await caption('事实、假设和未知项分别呈现。研究辅助，不把概念热度当成收入，也不输出买卖建议。');
 const remaining=110000-(Date.now()-started);if(remaining>0)await pause(remaining);
 const seconds=(Date.now()-started)/1000;
 if(seconds>180||seconds<60||errors.length)throw Error('演示时长或页面错误检查未通过。');
 result={status:'completed',seconds,pageErrors:errors,source:'Recorded actual browser interactions against the supplied URL',timeZone:'Asia/Shanghai',application:'朔风',sourceRevision:process.env.GITHUB_SHA||null};
}catch(e){result={status:'failed',error:e.message,seconds:(Date.now()-started)/1000,pageErrors:errors};try{await caption('本次录制遇到真实错误，当前研究结果未被自动改写。');await page.screenshot({path:path.join(out,'error.png'),fullPage:true});}catch{}process.exitCode=1;}
finally{await context.close();await video.saveAs(path.join(out,'robot-evidence-demo.webm'));await browser.close();await fs.writeFile(path.join(out,'recording-result.json'),JSON.stringify(result,null,2));}
