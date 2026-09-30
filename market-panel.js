(() => {
 function create({esc,api,companies}){
  const state={providers:null,quotes:null,busy:false,error:'',checked:false,host:null};
  const phase={not_configured:'等待开通数据权限',configured_unverified:'账号已配置，正在等待连接验证',verified:'已成功获取过行情'};
  const defaults=companies.filter(c=>c.market==='A股').map(c=>c.id);
  function active(){return state.host?.isConnected&&state.host.querySelector('#market-panel');}
  function render(){if(!active())return;const target=state.host.querySelector('#market-panel');const p=state.providers?.ifind;const configured=p?.configured===true&&p?.displayAuthorized===true;
   target.innerHTML=`<div class="empty"><strong>看看公司的股价动态</strong><p>行情开通后，可以查看已收录A股公司的最新价格。公司列表不按热度或涨跌幅排名。</p><p><strong>iFinD 行情：</strong>${esc(p?(phase[p.state]||'状态待核'):state.checked?'连接状态暂不可用':'点击下方按钮查看是否已开通')}</p><p class="meta">无需在页面填写账号或密钥。接入方式和权限说明见 README。</p><div class="peer-links"><button class="linkbutton" id="check-providers" ${state.busy?'disabled':''}>${state.busy?'处理中…':'查看开通状态'}</button><button class="run" id="refresh-quotes" ${!configured||state.busy?'disabled':''}>刷新A股公司价格</button></div>${p?.configured&&!p.displayAuthorized?'<p>账号已经配置，尚待确认页面展示权限。</p>':''}${state.error?'<p class="error" role="alert">'+esc(state.error)+'</p>':''}<p><a href="API接入说明.md" target="_blank" rel="noopener">了解数据开通方式 ↗</a> · <a href="https://quantapi.51ifind.com/" target="_blank" rel="noopener">iFinD官方入口 ↗</a></p></div>${state.quotes?table(state.quotes):''}`;
   target.querySelector('#check-providers').onclick=check;
   target.querySelector('#refresh-quotes').onclick=refresh;
  }
  function table(r){return `<div class="block"><h3 class="label">已收录A股公司的最新价格</h3>${state.error?'<p class="error">刷新暂时失败，以下保留的是上次价格，请留意时间。</p>':''}<p class="meta">来源：${esc(r.provider)} · 读取时间：${esc(r.queriedAt)}${r.cached?' · 沿用15秒内的结果':''}</p><div class="table-scroll"><table><thead><tr><th>公司与代码</th><th>最新价格</th><th>行情时间</th><th>数据说明</th></tr></thead><tbody>${r.quotes.map(q=>`<tr><th>${esc(q.name)}<br><span class="meta">${esc(q.code)}</span></th><td>${q.latest===null?'未返回':esc(q.latest)+' '+esc(q.unit)}</td><td>${esc(q.sourceTime||'未提供时间')}</td><td>${esc(q.note)}</td></tr>`).join('')}</tbody></table></div><p class="foot">股价变化不代表业务已有新进展，仍需查看公司披露。${esc(r.notice)}</p></div>`;}
  function validQuotes(r){return r&&r.provider==='iFinD HTTP'&&typeof r.queriedAt==='string'&&Array.isArray(r.quotes)&&r.quotes.length===defaults.length&&new Set(r.quotes.map(x=>x.companyId)).size===defaults.length&&r.quotes.every(q=>defaults.includes(q.companyId)&&companies.find(c=>c.id===q.companyId)?.code===q.code&&(q.latest===null||(typeof q.latest==='number'&&Number.isFinite(q.latest)&&q.latest>0))&&q.currency==='CNY');}
  async function check(){state.busy=true;state.error='';render();try{const p=await api('providers');if(!p?.ifind||typeof p.ifind.configured!=='boolean'||typeof p.ifind.displayAuthorized!=='boolean'||!phase[p.ifind.state])throw Error('数据接入状态返回格式异常。');state.providers=p;if(!p.ifind.configured||!p.ifind.displayAuthorized)state.quotes=null;}catch(e){state.error=e.message;}finally{state.checked=true;state.busy=false;render();}}
  async function refresh(){if(!state.providers?.ifind.configured||!state.providers?.ifind.displayAuthorized||state.busy)return;state.busy=true;state.error='';render();try{const r=await api('quotes',{companyIds:defaults});if(!validQuotes(r))throw Error('行情返回公司、代码或价格字段不完整，未替换已有行情。');state.quotes=r;}catch(e){state.error=e.message;if(['IFIND_AUTH','IFIND_PROVIDER_ERROR','IFIND_NOT_CONFIGURED','IFIND_DISPLAY_NOT_AUTHORIZED'].includes(e.code)){state.quotes=null;state.providers=null;}}finally{state.busy=false;render();}}
  function mount(host){state.host=host;host.innerHTML='<div id="market-panel"></div>';render();}
  return {mount};
 }
 (typeof window==='undefined'?globalThis:window).MarketPanel={create};
})();
