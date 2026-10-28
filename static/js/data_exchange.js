/* Local scripts; online map tiles are optional and have a schematic fallback. */
'use strict';
const config = JSON.parse(document.getElementById('portal-config').textContent);
const $ = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num = (value, digits=0) => value == null ? '—' : Number(value).toLocaleString('zh-TW', {maximumFractionDigits:digits});
const bandNames = {good:'良好', fair:'注意', poor:'優先檢視', unknown:'未觀測'};
const freshNames = {fresh:'7 天內', aging:'8–30 天', stale:'超過 30 天', unknown:'未知'};
const colors = {good:'#397563', fair:'#b18b3e', poor:'#bc5b42', unknown:'#7c8b8a'};
const titles = {
  overview:['道路資料總覽','東大路・玉門路｜區段評分、觀測紀錄與道路資料品質。'],
  explorer:['每一段道路，都有資料履歷。','查閱觀測證據、比較歷史變化，確認資料是否適合你的用途。'],
  routes:['路線品質比較','臺灣大道東側起點 → 東大路北側終點；比較玉門路 A 與東大路 B。'],
  developers:['道路情報，直接串接你的系統。','呼叫真實 API，取得有來源、日期與版本的結構化道路資料。'],
  delivery:['從資料快照，到持續訂閱。','交付可追溯的資料產品，明確定義使用範圍與更新方式。']
};
let state = null;
let requestGeneration = 0;
let activeSegment = null;
let tourStep = -1;
const today = new Date();
const todayString = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
$('as-of').max = todayString;
$('as-of').value = new URLSearchParams(location.search).get('as_of') || todayString;

function notice(message, isError=false) {
  $('status').hidden = false;
  $('status').textContent = message;
  $('status').classList.toggle('error', isError);
}
function apiPath(endpoint, dataset=$('dataset-select').value) {
  const params = new URLSearchParams({dataset, as_of:$('as-of').value});
  return `${config.base}/api/data/v1/${endpoint}?${params}`;
}
async function getJSON(url, options={}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const response = await fetch(url, {...options, credentials:'same-origin', signal:controller.signal});
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { throw new Error('伺服器未回傳 JSON；請確認登入狀態與服務。'); }
    if (!response.ok) throw new Error(body.error || `請求失敗 (${response.status})`);
    return body;
  } catch(e) { if(e.name === 'AbortError') throw new Error('請求超時，請稍後重試。'); throw e; }
  finally { clearTimeout(timeout); }
}
async function busy(button, fn) {
  button.disabled = true;
  try { await fn(); } catch(e) { notice(e.message, true); }
  finally { button.disabled = false; }
}
function changeTab(name) {
  if (!titles[name]) name = 'overview';
  document.querySelectorAll('[data-panel]').forEach(el => el.hidden = el.dataset.panel !== name);
  document.querySelectorAll('.nav-item').forEach(el => {
    const active = el.dataset.tab === name;
    el.classList.toggle('active', active);
    if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
  });
  $('page-title').textContent = titles[name][0];
  $('page-description').textContent = titles[name][1];
  history.replaceState(null, '', `${location.pathname}${location.search}#${name}`);
  if(name === 'overview' && state) drawMap();
  if(name === 'routes' && state) RoadDemo.renderRoutes(state);
}
document.addEventListener('click', e => {
  const tab = e.target.closest('[data-tab]');
  if(tab) changeTab(tab.dataset.tab);
  const detail = e.target.closest('[data-segment]');
  if(detail && state) openDetail(detail.dataset.segment);
});
document.addEventListener('road-segment-select',e=>{if(state)openDetail(e.detail);});
window.addEventListener('hashchange', () => changeTab(location.hash.slice(1)));

async function loadCatalog(preferred) {
  const body = await getJSON(`${config.base}/api/data/v1/catalog`);
  $('dataset-select').innerHTML = body.datasets.map(ds => `<option value="${esc(ds.id)}">${esc(ds.title)} · ${ds.source_kind==='synthetic'?'合成資料':'既有巡檢'}</option>`).join('');
  if(body.datasets.some(ds => ds.id === preferred)) $('dataset-select').value = preferred;
}
async function refresh() {
  const generation = ++requestGeneration;
  $('loading').hidden = false;
  $('status').hidden = true;
  $('refresh').disabled = true;
  try {
    const result = await getJSON(apiPath('segments'));
    if(generation !== requestGeneration) return;
    state = result;
    const params = new URLSearchParams({dataset:state.dataset.id, as_of:state.as_of, map:'streets'});
    const oldParams=new URLSearchParams(location.search);
    if(oldParams.get('dataset')===state.dataset.id && oldParams.get('as_of')===state.as_of) {
      ['mlat','mlon','mz','area','rcap','rpref'].forEach(k=>{if(oldParams.has(k))params.set(k,oldParams.get(k));});
    }
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
    render();
    $('route-results').innerHTML = '<p class="empty">資料日期已更新，請重新分析路線。</p>';
    $('api-response').textContent = '等待請求…';
    $('api-status').textContent = '查詢真正的後端 API，不使用預填回應。';
    if(state.dataset.id !== 'demo') {
      $('route-a').value = ''; $('route-b').value = '';
    }
    if(activeSegment) $('segment-dialog').close();
    updateCurl();
  } catch(e) {
    if(generation !== requestGeneration) return;
    state = null;
    RoadMap.clear();
    $('metrics').innerHTML = '';
    $('segment-table').innerHTML = '';
    RoadDemo.clear();
    $('readiness').innerHTML = '';
    $('alerts').innerHTML = '';
    $('table-count').textContent = '';
    $('delivery-details').innerHTML = '';
    $('license').textContent = '請先成功載入資料集。';
    $('route-results').innerHTML = '<p class="empty">請重新載入資料後分析。</p>';
    $('api-response').textContent = '尚無可用快照。';
    $('api-status').textContent = '請重新載入資料。';
    document.querySelectorAll('[data-export], #manifest-link, #print-report').forEach(a => a.removeAttribute('href'));
    if(activeSegment) $('segment-dialog').close();
    $('provenance').textContent = '尚無可用快照，請確認日期與資料集後重新載入。';
    notice(e.message, true);
  } finally {
    if(generation === requestGeneration) { $('loading').hidden = true; $('refresh').disabled = false; }
  }
}
function render() {
  const q = state.quality, ds = state.dataset;
  $('provenance').textContent = `${ds.source_kind==='synthetic'?'合成示範資料':'既有巡檢資料（內部評估）'} ｜ ${ds.provenance}`;
  const metrics = [
    ['COVERAGE','登錄區段範圍',num(q.registered_km,2),'km',ds.id==='demo'?`${q.observed_segments} / ${q.segment_count} 區段已有觀測`:'50m 網格名目長度，非實測道路長'],
    ['FRESHNESS','7 天內更新',num(q.fresh_7d_pct,1),'%',`以全部 ${q.segment_count} 個登錄區段為分母`],
    ['HISTORY','歷史觀測期數',num(q.history_periods),'期',`累計 ${num(q.observations)} 次區段／日期紀錄`],
    ['CONDITION','已觀測平均評分',num(q.average_score,1),'/ 100',`${q.unknown_segments} 個未知區段不計分`]
  ];
  $('metrics').innerHTML = metrics.map((m,i)=>`<article class="metric"><span class="metric-index">0${i+1}</span><div class="metric-label">${m[1]}</div><div class="metric-value">${m[2]}<small>${m[3]}</small></div><div class="metric-foot">${esc(m[4])}</div></article>`).join('');
  $('readiness').innerHTML = [
    ['登錄區段有觀測比例',q.coverage_pct],['7 天內更新比例',q.fresh_7d_pct],
    ['至少兩期可比較',q.segment_count?state.segments.filter(s=>s.observation_count>=2).length/q.segment_count*100:0]
  ].map(([label,pct])=>`<div class="quality-row"><div><span>${label}</span><b>${num(pct,1)}%</b></div><div class="bar"><i style="width:${pct}%"></i></div></div>`).join('') + '<div class="data-pair"><span>校準可信度</span><b>尚未提供</b></div>';
  drawMap(); renderTable(); renderAlerts();
  document.querySelectorAll('[data-export]').forEach(a => a.href = apiPath(`export/${a.dataset.export}`));
  $('manifest-link').href = apiPath('export/manifest');
  $('print-report').href = `${config.base}/data-exchange/report?${new URLSearchParams({dataset:ds.id,as_of:state.as_of})}`;
  $('license').textContent = ds.license;
  $('delivery-details').innerHTML = [
    ['資料集',ds.title],['資料來源',ds.source_kind==='synthetic'?'合成巡檢':'既有瑕疵紀錄'],
    ['區段數',q.segment_count],['查詢日期',state.as_of],['評分版本',state.score_version],
    ['座標系統','WGS84 / 經度、緯度'],['商業授權',ds.id==='demo'?'僅展示／測試':'內部評估，禁止第三方再授權']
  ].map(([k,v])=>`<div class="data-pair"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
  $('route-preset').disabled = ds.id !== 'demo';
  $('road-route-demo').hidden=ds.id!=='demo';
  if(ds.id==='demo'){
    $('route-a').value=state.road_demo.routes[0].segment_ids.join(',');
    $('route-b').value=state.road_demo.routes[1].segment_ids.join(',');
    if(location.hash==='#routes') RoadDemo.renderRoutes(state);
  } else RoadDemo.clear();
}
function drawMap() {
  $('street-map').hidden=false;
  if(state) RoadMap.render(state);
}
document.addEventListener('keydown', e=>{
  if((e.key==='Enter'||e.key===' ') && e.target.matches('.map-segment')) { e.preventDefault(); openDetail(e.target.dataset.segment); }
});
function renderTable() {
  if(!state) return;
  const query=$('search').value.trim().toLowerCase(), filter=$('band-filter').value;
  const rows=state.segments.filter(s=>(filter==='all'||s.condition_band===filter)&&`${s.id} ${s.name}`.toLowerCase().includes(query));
  rows.sort((a,b)=>$('sort').value==='id'?a.id.localeCompare(b.id):$('sort').value==='age'?(b.age_days??1e6)-(a.age_days??1e6):(a.condition_score??101)-(b.condition_score??101));
  $('table-count').textContent=`顯示 ${rows.length} / ${state.segments.length} 個區段 · 日期 ${state.as_of}`;
  $('segment-table').innerHTML=rows.map(s=>`<tr><td><b>${esc(s.id)}</b><small>${esc(s.name)}</small></td><td><span class="score ${s.condition_band}">${num(s.condition_score,1)}</span> <span class="badge ${s.condition_band}">${bandNames[s.condition_band]}</span></td><td>${s.score_delta==null?'—':(s.score_delta>0?'+':'')+num(s.score_delta,1)}</td><td>${s.observation_count}</td><td>${esc(s.last_observed?.slice(0,10)||'未觀測')}</td><td><span class="badge ${s.age_days>30?'poor':''}">${freshNames[s.freshness]}</span></td><td><button data-segment="${esc(s.id)}">查看 →</button></td></tr>`).join('') || '<tr><td colspan="7" class="empty">沒有符合條件的區段，請調整篩選。</td></tr>';
}
function renderAlerts() {
  const alerts=state.segments.filter(s=>s.condition_score===null||s.age_days>7||s.change_alert||s.condition_band==='poor').sort((a,b)=>(a.condition_score??101)-(b.condition_score??101));
  $('alerts').innerHTML=alerts.slice(0,4).map(s=>{
    const reason=s.condition_score===null?'尚無觀測，需補充資料':s.change_alert?`較前期下降 ${Math.abs(s.score_delta)} 分`:s.age_days>7?`${s.age_days} 天未更新，資料可能過時`:`目前 ${s.condition_score} 分，建議檢視觀測證據`;
    return `<div class="alert-row"><span class="alert-icon">!</span><div class="alert-info"><b>${esc(s.id)} · ${esc(s.name)}</b><small>${esc(reason)}</small></div><button data-segment="${esc(s.id)}" class="text-button">檢視 →</button></div>`;
  }).join('')||'<p class="empty">目前沒有低分、資料缺口或變化提醒。</p>';
}
function openDetail(id) {
  const s=state.segments.find(s=>s.id===id); if(!s) return;
  activeSegment=s;
  $('detail-name').textContent=`${s.id} · ${s.name}`;
  const chartWidth=Math.max(270, Math.min(720, window.innerWidth-90));
  const times=s.history.map(o=>Date.parse(o.observed_at)), span=times.length ? times[times.length-1]-times[0] : 0;
  const points=s.history.map((o,i)=>`${35+(span?(times[i]-times[0])/span:0)*(chartWidth-60)},${130-o.score}`);
  const chart=s.history.length?`<svg class="history-chart" viewBox="0 0 ${chartWidth} 160" role="img" aria-label="影像評分歷史，橫軸為觀測日期、縱軸為零至百分，詳細數值列於下方表格"><g font-size="11" fill="#596d78">${[0,50,100].map(v=>`<path d="M35 ${130-v}H${chartWidth-25}" stroke="#dce3dc" stroke-width=".75"/><text x="28" y="${134-v}" text-anchor="end">${v}</text>`).join('')}<text x="35" y="152">${s.history[0].observed_at.slice(5,10)}</text><text x="${chartWidth-25}" y="152" text-anchor="end">${s.history[s.history.length-1].observed_at.slice(5,10)}</text></g><polyline points="${points.join(' ')}" fill="none" stroke="#26765b" stroke-width="2"/>${points.map((p,i)=>`<circle cx="${p.split(',')[0]}" cy="${p.split(',')[1]}" r="3" fill="#26765b"/>${s.history.length<=8||i===s.history.length-1?`<text x="${p.split(',')[0]}" y="${Number(p.split(',')[1])-9}" text-anchor="middle" font-size="12">${s.history[i].score}</text>`:''}`).join('')}</svg>`:'<p class="empty">尚無歷史，不能判定為良好道路。</p>';
  const options=s.history.map((o,i)=>`<option value="${i}">${o.observed_at.slice(0,10)} · ${o.score} 分</option>`).join('');
  $('detail-content').innerHTML=`<p class="note">${esc(state.dataset.source_kind==='synthetic'?'合成時序，僅展示比較機制；A05 最後一期模擬改善。':'既有瑕疵紀錄按日彙整；採集頻率不同可能影響評分，不代表已驗證劣化。')}</p><div class="detail-summary"><div><b>${num(s.condition_score,1)}</b><span>影像規則評分</span></div><div><b>${s.observation_count}</b><span>歷史觀測期數</span></div><div><b>${s.age_days==null?'—':s.age_days}</b><span>距最後觀測／天</span></div></div><h3>道路時序</h3>${chart}${s.history.length?`<div class="comparison"><label>比較起點<select id="compare-before">${options}</select></label><label>比較終點<select id="compare-after">${options}</select></label></div><div id="compare-result" class="compare-result" aria-live="polite"></div>`:''}<div class="table-scroll"><table><thead><tr><th>觀測日期</th><th>分數</th><th>輕微 / 中等 / 嚴重</th><th>來源</th></tr></thead><tbody>${s.history.map(o=>`<tr><td>${esc(o.observed_at.slice(0,10))}</td><td>${o.score}</td><td>${o.minor} / ${o.moderate} / ${o.severe}</td><td>${o.source==='synthetic_survey'?'合成巡檢':`既有紀錄 ${o.evidence_ids.length} 筆`}</td></tr>`).join('')}</tbody></table></div><p class="note">${esc(state.methodology.score)}<br>不等同 PCI、IRI 或實際維修驗收；照片前後比對與工程校準尚待加入。</p>`;
  if(s.history.length) {
    $('compare-before').value=String(Math.max(0,s.history.length-2));
    $('compare-after').value=String(s.history.length-1);
    $('compare-before').addEventListener('change', compare);
    $('compare-after').addEventListener('change', compare);
    compare();
  }
  if(!$('segment-dialog').open) $('segment-dialog').showModal();
}
function compare() {
  const a=activeSegment.history[Number($('compare-before').value)], b=activeSegment.history[Number($('compare-after').value)];
  if(a.observed_at>b.observed_at) { $('compare-result').textContent='比較終點不能早於起點，請調整日期。'; return; }
  const delta=Math.round((b.score-a.score)*10)/10;
  $('compare-result').textContent=`${a.score} → ${b.score} 分，${delta>0?'上升':delta<0?'下降':'變化'} ${Math.abs(delta)} 分。${delta>0?'影像評分改善，仍需檢視採集與現地證據。':delta<0?'需留意變化與採集條件，建議人工複核。':'兩期評分相同。'}`;
}
$('detail-close').addEventListener('click',()=>$('segment-dialog').close());
$('segment-dialog').addEventListener('close',()=>activeSegment=null);
['search','band-filter','sort'].forEach(id=>$(id).addEventListener(id==='search'?'input':'change',renderTable));
$('refresh').addEventListener('click',refresh);
$('dataset-select').addEventListener('change',refresh);
$('as-of').addEventListener('change',refresh);
$('route-preset').addEventListener('click',()=>{
  if(state?.road_demo){$('route-a').value=state.road_demo.routes[0].segment_ids.join(',');$('route-b').value=state.road_demo.routes[1].segment_ids.join(',');}
});
$('route-form').addEventListener('submit',e=>{
  e.preventDefault();
  busy(e.submitter, async()=>{
    if(!state) throw new Error('請先載入資料集');
    const generation = requestGeneration;
    $('route-results').innerHTML = '<p class="empty">正在分析…</p>';
    const response=await getJSON(apiPath('routes/analyze'),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routes:[
      {name:'路線 A',segment_ids:$('route-a').value.split(',').map(v=>v.trim()).filter(Boolean)},
      {name:'路線 B',segment_ids:$('route-b').value.split(',').map(v=>v.trim()).filter(Boolean)}]})}).catch(error=>{
        if(generation === requestGeneration) $('route-results').innerHTML = '<p class="empty">分析失敗，請確認區段 ID 後重試。</p>';
        throw error;
      });
    if(generation !== requestGeneration) return;
    $('route-results').innerHTML=response.routes.map(r=>`<article class="card route-result"><p class="eyebrow">${esc(r.name)} / ${response.as_of}</p><h2>已觀測路段品質</h2><div class="route-score ${r.score==null?'unknown':r.score<60?'poor':'good'}">${num(r.score,1)}<small style="font-size:15px;letter-spacing:0"> / 100</small></div><div class="route-stats"><div><b>${num(r.length_m)} m</b><span>所選區段總長</span></div><div><b>${num(r.coverage_pct,1)}%</b><span>已觀測長度比例</span></div><div><b>${r.high_risk_segments.length}</b><span>低分區段</span></div><div><b>${num(r.stale_pct,1)}%</b><span>超過 7 天未更新</span></div></div><div class="exposure">${Object.entries(r.exposure_pct).map(([k,v])=>`<i style="width:${v}%;background:${colors[k]}" title="${bandNames[k]} ${v}%"></i>`).join('')}</div><div class="exposure-labels">${Object.entries(r.exposure_pct).map(([k,v])=>`<span class="${k}">${bandNames[k]} ${num(v,1)}%</span>`).join('')}</div><p class="note">${esc(r.note)}</p><p class="note">區段：${esc(r.segment_ids.join(' → '))}</p></article>`).join('');
    notice('路線分析完成。所有比例以所選區段長度計算，未知里程獨立列出。');
  });
});
function playgroundUrl() {
  const type=$('api-endpoint').value;
  return apiPath(type==='history'?`segments/${encodeURIComponent($('api-segment').value.trim())}/history`:type);
}
function updateCurl() {
  $('api-segment-label').hidden=$('api-endpoint').value!=='history';
  const url=new URL(playgroundUrl(),location.origin).href;
  $('curl-example').textContent=`curl '${url}'${$('dataset-select').value==='demo'?'':" \\\n  -H 'Authorization: Bearer YOUR_API_KEY'"}`;
}
$('api-endpoint').addEventListener('change',updateCurl);
$('api-segment').addEventListener('input',updateCurl);
$('api-run').addEventListener('click',e=>busy(e.currentTarget,async()=>{
  const start=performance.now();
  const generation=requestGeneration;
  try {
    const response=await getJSON(playgroundUrl());
    if(generation !== requestGeneration) return;
    const text=JSON.stringify(response,null,2);
    $('api-response').textContent=text.length>18000?text.slice(0,18000)+'\n…（畫面截斷，請使用匯出取得完整資料）':text;
    $('api-status').textContent=`HTTP 200 · ${Math.round(performance.now()-start)} ms · ${new TextEncoder().encode(text).length.toLocaleString()} bytes`;
  } catch(err) { if(generation !== requestGeneration) return; $('api-response').textContent=err.message; $('api-status').textContent='請求失敗'; throw err; }
}));
$('copy-curl').addEventListener('click',e=>busy(e.currentTarget,async()=>{
  if(navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText($('curl-example').textContent); notice('已複製 cURL'); }
  else { const sel=window.getSelection(),range=document.createRange(); range.selectNodeContents($('curl-example')); sel.removeAllRanges(); sel.addRange(range); notice('已選取指令；請按 Ctrl+C 複製（目前為 HTTP 環境）。'); }
}));
if($('sync')) $('sync').addEventListener('click',e=>busy(e.currentTarget,async()=>{
  const result=await getJSON(`${config.base}/data-exchange/sync`,{method:'POST',headers:{'X-CSRF-Token':config.csrf}});
  await loadCatalog(result.dataset_id); await refresh();
  notice(`已同步 ${result.records} 筆既有紀錄至 ${result.segments} 個網格；略過 ${result.skipped} 筆無效資料。來源資料庫未修改。`);
}));
async function loadKeys() {
  if(!$('key-list')) return;
  const result=await getJSON(`${config.base}/data-exchange/keys`);
  $('key-list').innerHTML=result.keys.map(k=>`<div class="key-row"><span><b>${esc(k.name)}</b><br>${esc(k.prefix)}… · ${esc(k.dataset_id)}</span><span>${num(k.requests)} 次成功請求<br>${k.last_used?esc(k.last_used.slice(0,16)):'尚未使用'}</span>${k.revoked?'<span>已撤銷</span>':`<button data-revoke="${esc(k.id)}">撤銷金鑰</button>`}</div>`).join('')||'<p class="empty">尚未建立金鑰。</p>';
}
if($('key-form')) $('key-form').addEventListener('submit',e=>{
  e.preventDefault(); busy(e.submitter,async()=>{
    const result=await getJSON(`${config.base}/data-exchange/keys`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':config.csrf},body:JSON.stringify({name:$('key-name').value,dataset:$('dataset-select').value})});
    $('new-key').hidden=false; $('key-secret').textContent=result.token; $('key-name').value='';
    await loadKeys(); notice('已建立唯讀金鑰，完整金鑰只顯示這一次。');
  });
});
if($('key-list')) $('key-list').addEventListener('click',e=>{
  const button=e.target.closest('[data-revoke]'); if(!button) return;
  if(!confirm('撤銷後，使用這把金鑰的客戶端將無法繼續存取。確定撤銷？')) return;
  busy(button,async()=>{await getJSON(`${config.base}/data-exchange/keys/${button.dataset.revoke}/revoke`,{method:'POST',headers:{'X-CSRF-Token':config.csrf}}); await loadKeys(); $('new-key').hidden=true; $('key-secret').textContent=''; notice('API Key 已撤銷。');});
});
const tourSteps=[
  ['overview','1 / 5 · 先看資料商品：覆蓋範圍、新鮮度、歷史與品質限制。所有數值由觀測紀錄計算。'],
  ['explorer','2 / 5 · 點選 A04 查看下降趨勢，再看 A05 的合成改善案例；可切換比較日期。'],
  ['routes','3 / 5 · 比較東大路與玉門路，切換繞行上限並點選沿途瑕疵照片。'],
  ['developers','4 / 5 · 執行 API 請求，展示客戶 TMS / GIS 如何直接取得結構化道路情報。'],
  ['delivery','5 / 5 · 下載 GeoJSON 與資料規格檔，展示資料交付、訂閱與使用權的商品形態。']
];
function tour() {
  $('tour').hidden=false; const [tab,text]=tourSteps[tourStep]; changeTab(tab); $('tour-text').textContent=text;
  $('tour-next').textContent=tourStep===4?'完成導覽':'下一步 →';
}
$('tour-button').addEventListener('click',e=>busy(e.currentTarget,async()=>{
  $('dataset-select').value='demo';
  $('as-of').value='2026-09-19';
  await refresh();
  if(!state) return;
  $('route-preset').click();
  tourStep=0;tour();
  notice('展示導覽使用 2026-09-19 合成資料快照；不會修改既有巡檢資料。');
}));
$('tour-next').addEventListener('click',()=>{if(++tourStep>=tourSteps.length){$('tour').hidden=true;tourStep=-1;}else tour();});
$('tour-close').addEventListener('click',()=>{$('tour').hidden=true;tourStep=-1;});
changeTab(location.hash.slice(1));
(async()=>{try {await loadCatalog(new URLSearchParams(location.search).get('dataset'));await refresh();await loadKeys();}catch(e){$('loading').hidden=true;notice(e.message,true);}})();
