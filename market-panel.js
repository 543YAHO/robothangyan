(() => {
 function create({esc,api,companies}){
  const state={providers:null,quotes:null,busy:false,error:'',checked:false,host:null};
  const phase={not_configured:'接入口已准备，待配置账号凭证',configured_unverified:'凭证已配置，尚未联调验证',verified:'此前调用已验证成功'};
  const defaults=companies.filter(c=>c.market==='A股').map(c=>c.id);
  function active(){return state.host?.isConnected&&state.host.querySelector('#market-panel');}
  function render(){if(!active())return;const target=state.host.querySelector('#market-panel');const p=state.providers?.ifind;const configured=p?.configured===true&&p?.displayAuthorized===true;
   target.innerHTML=`<div class="empty"><strong>市场行情与数据接入</strong><p>本轮不使用虚构涨跌幅，也不把样本顺序当作热度排名。仅有最新价不足以生成“热门榜”。</p><p><strong>iFinD HTTP：</strong>${esc(p?(phase[p.state]||'状态待核'):state.checked?'连接状态暂不可用':'点击检查接入状态')}</p><p class="meta">本页不收集密码或token，凭证仅配置在服务端。HTTP行情接入不等于iFinD MCP。</p><div class="peer-links"><button class="linkbutton" id="check-providers" ${state.busy?'disabled':''}>${state.busy?'处理中…':'检查接入状态'}</button><button class="run" id="refresh-quotes" ${!configured||state.busy?'disabled':''}>获取A股样本最新价</button></div>${p?.configured&&!p.displayAuthorized?'<p>凭证已配置，等待确认本次Web展示的数据使用权限。</p>':''}${state.error?'<p class="error" role="alert">'+esc(state.error)+'</p>':''}<p><strong>扶摇：</strong>等待出题方提供服务地址、协议和账号。<br><strong>iFinD MCP：</strong>等待单独的MCP服务地址与鉴权信息。</p><p><a href="API接入说明.md" target="_blank" rel="noopener">查看账号申请与服务器配置说明 ↗</a> · <a href="https://quantapi.51ifind.com/" target="_blank" rel="noopener">iFinD官方入口 ↗</a></p></div>${state.quotes?table(state.quotes):''}`;
   target.querySelector('#check-providers').onclick=check;
   target.querySelector('#refresh-quotes').onclick=refresh;
  }
  function table(r){return `<div class="block"><h3 class="label">A股研究样本最新价 · 非热度排名</h3>${state.error?'<p class="error">以下是此前成功获取的记录，本次刷新失败，不能当成当前行情。</p>':''}<p class="meta">来源：${esc(r.provider)} · 请求字段：latest · 查询时间：${esc(r.queriedAt)}${r.cached?' · 15秒内缓存':''}</p><div class="table-scroll"><table><thead><tr><th>公司与代码</th><th>提供方最新价</th><th>提供方行情时间</th><th>数据说明</th></tr></thead><tbody>${r.quotes.map(q=>`<tr><th>${esc(q.name)}<br><span class="meta">${esc(q.code)}</span></th><td>${q.latest===null?'未返回':esc(q.latest)+' '+esc(q.unit)}</td><td>${esc(q.sourceTime||'未提供，不能标成实时')}</td><td>${esc(q.note)}</td></tr>`).join('')}</tbody></table></div><p class="foot">行情与业务证据互不替代，不改变公司的人形机器人业务分级。${esc(r.notice)}</p></div>`;}
  function validQuotes(r){return r&&r.provider==='iFinD HTTP'&&typeof r.queriedAt==='string'&&Array.isArray(r.quotes)&&r.quotes.length===defaults.length&&new Set(r.quotes.map(x=>x.companyId)).size===defaults.length&&r.quotes.every(q=>defaults.includes(q.companyId)&&companies.find(c=>c.id===q.companyId)?.code===q.code&&(q.latest===null||(typeof q.latest==='number'&&Number.isFinite(q.latest)&&q.latest>0))&&q.currency==='CNY');}
  async function check(){state.busy=true;state.error='';render();try{const p=await api('providers');if(!p?.ifind||typeof p.ifind.configured!=='boolean'||typeof p.ifind.displayAuthorized!=='boolean'||!phase[p.ifind.state])throw Error('数据接入状态返回格式异常。');state.providers=p;if(!p.ifind.configured||!p.ifind.displayAuthorized)state.quotes=null;}catch(e){state.error=e.message;}finally{state.checked=true;state.busy=false;render();}}
  async function refresh(){if(!state.providers?.ifind.configured||!state.providers?.ifind.displayAuthorized||state.busy)return;state.busy=true;state.error='';render();try{const r=await api('quotes',{companyIds:defaults});if(!validQuotes(r))throw Error('行情返回公司、代码或价格字段不完整，未替换已有行情。');state.quotes=r;}catch(e){state.error=e.message;if(['IFIND_AUTH','IFIND_PROVIDER_ERROR','IFIND_NOT_CONFIGURED','IFIND_DISPLAY_NOT_AUTHORIZED'].includes(e.code)){state.quotes=null;state.providers=null;}}finally{state.busy=false;render();}}
  function mount(host){state.host=host;host.innerHTML='<div id="market-panel"></div>';render();}
  return {mount};
 }
 (typeof window==='undefined'?globalThis:window).MarketPanel={create};
})();
