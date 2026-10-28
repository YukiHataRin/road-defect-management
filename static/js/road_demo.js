/* Road geometry is real; condition data and photo placement are illustrative. */
window.RoadDemo=(()=>{
 'use strict';
 const $=id=>document.getElementById(id),config=JSON.parse($('portal-config').textContent);
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const samples=[{id:'D01',n:1,segment:'A02',type:'坑洞',severity:'嚴重',image:'pothole.jpg'},
  {id:'D02',n:2,segment:'A04',type:'龜裂',severity:'嚴重',image:'alligator.jpg'},
  {id:'D03',n:3,segment:'B04',type:'縱向裂縫',severity:'輕微',image:'crack.jpg'}];
 let map,group,bounds,snapshot,results=[],generation=0,controller;
 const palette={A:'#2365b6',B:'#b64e31'};
 function addEndpoints(next,layer){
  if(!next.road_demo?.endpoints)return;
  for(const [key,label] of [['start','起點'],['end','終點']]){
   const endpoint=next.road_demo.endpoints[key],p=endpoint.coordinates;
   L.marker([p[1],p[0]],{title:`${label}：${endpoint.name}`,keyboard:true,icon:L.divIcon({className:`demo-endpoint-label ${key}`,html:`<span>${label}</span>`,iconSize:[66,44],iconAnchor:[33,22]})}).bindPopup(`<b>${label}</b><br>${esc(endpoint.name)}`).addTo(layer);
  }
 }
 function addEvidence(target,next,layer,containerId){
  const container=$(containerId);container.replaceChildren();container.classList.add('demo-evidence');
  for(const sample of samples){
   const segment=next.segments.find(s=>s.id===sample.segment);
   if(!segment||segment.condition_score===null)continue;
   const coords=segment.geometry.coordinates,p=coords[Math.floor(coords.length/2)];
   const image=`${config.base}/static/img/road-demo/${sample.image}`;
   const caption=`${sample.n} · ${sample.type}／${sample.severity}`;
   const marker=L.marker([p[1],p[0]],{title:caption+'（展示位置）',keyboard:true,icon:L.divIcon({className:'demo-defect-pin',html:`<span>${sample.n}</span>`,iconSize:[44,44],iconAnchor:[22,22]})}).addTo(layer);
   marker.bindPopup(`<strong>${esc(caption)}</strong><p>${esc(segment.id)} · 區段 ${segment.condition_score} 分</p><img class="demo-popup-photo" src="${image}" alt="${esc(sample.type)}展示配圖"><small>展示配圖，非此位置實拍。<br>標記為照片樣本，不等於全段瑕疵總數。</small>`,{maxWidth:260});
   const button=document.createElement('button');button.type='button';button.className='demo-photo-card';button.dataset.evidence=sample.id;
   button.innerHTML=`<img src="${image}" alt="${esc(sample.type)}展示配圖" loading="lazy"><span><b>${esc(caption)}</b><small>${esc(segment.id)} · ${segment.condition_score} 分</small></span>`;
   button.addEventListener('click',()=>{marker.openPopup();target.getContainer().scrollIntoView({block:'center',behavior:'instant'});});
   container.append(button);
  }
  if(!container.childElementCount)container.textContent='這個查詢日期尚無展示觀測與照片。';
 }
 function init(){
  if(map)return;
  const reduced=matchMedia('(prefers-reduced-motion:reduce)').matches;
  map=L.map('route-street-map',{scrollWheelZoom:false,zoomAnimation:!reduced,fadeAnimation:!reduced});
  L.control.scale({imperial:false}).addTo(map);group=L.featureGroup().addTo(map);
  let failed=false;
  const tiles=L.tileLayer(config.map.tileUrl,{attribution:config.map.attribution,maxZoom:19,keepBuffer:0,updateWhenIdle:true});
  tiles.on('loading',()=>{failed=false;$('route-map-network').textContent='底圖載入中…';});
  tiles.on('tileerror',()=>{failed=true;$('route-map-network').textContent='部分底圖無法載入；路線、評分與照片仍可操作。';});
  tiles.on('load',()=>{if(!failed)$('route-map-network').textContent='OpenStreetMap';});tiles.addTo(map);
  const params=new URLSearchParams(location.search);
  for(const [id,key,allowed] of [['route-cap','rcap',['0.2','0.3','0.5']],['route-preference','rpref',['0','20','40']]]){
   if(allowed.includes(params.get(key)))$(id).value=params.get(key);
   $(id).addEventListener('change',()=>{const url=new URL(location.href);url.searchParams.set(key,$(id).value);history.replaceState(null,'',url);rank();});
  }
  $('route-map-fit').addEventListener('click',fit);
  new ResizeObserver(()=>{if(map&&$('route-street-map').clientWidth){map.invalidateSize({pan:false});fit();}}).observe($('route-street-map'));
 }
 function fit(){if(map&&bounds?.isValid()&&$('route-street-map').clientWidth){map.closePopup();map.invalidateSize({pan:false});map.fitBounds(bounds,{padding:[38,38],maxZoom:16,animate:false});}}
 function rank(){
  if(!results.length){$('route-recommendation').textContent='尚無可用路線評分';return;}
  const cap=Number($('route-cap').value),weight=Number($('route-preference').value),base=Math.min(...results.map(r=>r.length_m));
  const ranked=results.map((r,i)=>({...r,id:snapshot.road_demo.routes[i].id,within:r.length_m<=base*(1+cap),cost:r.score===null?null:r.length_m+weight*(100-r.score)}));
  const eligible=ranked.filter(r=>r.within&&r.score!==null&&r.coverage_pct===100).sort((a,b)=>a.cost-b.cost);
  const winner=eligible[0];
  const longest=ranked.reduce((a,b)=>a.length_m>=b.length_m?a:b);
  $('route-recommendation').textContent=winner?`目前偏好：${winner.id} · ${longest.id} 多走 ${Math.round(longest.length_m-base)} 公尺（${((longest.length_m/base-1)*100).toFixed(1)}%）`:'資料不足，暫不推薦路線';
  $('road-route-scores').innerHTML=ranked.map(r=>`<article style="--route-color:${palette[r.id]}"><div><h3>${r.id} · ${esc(r.name)}</h3><p>${(r.length_m/1000).toFixed(2)} km · ${r.within?'符合繞行上限':'超過繞行上限'}</p><small>已觀測 ${r.coverage_pct}% · 低分區段 ${r.high_risk_segments.length} · 超過 7 天 ${r.stale_pct}%</small></div><div class="demo-route-score"><b>${r.score??'—'}</b><span>展示評分 / 100</span></div></article>`).join('');
 }
 async function renderRoutes(next){
  if(!next.road_demo){clear();return;}
  $('road-route-demo').hidden=false;init();
  if(snapshot===next){map.invalidateSize({pan:false});return;}
  snapshot=next;const current=++generation;controller?.abort();controller=new AbortController();
  group.clearLayers();results=[];bounds=L.latLngBounds([]);$('road-route-scores').replaceChildren();rank();
  const shared=new Set(next.road_demo.routes[0].segment_ids.filter(id=>next.road_demo.routes[1].segment_ids.includes(id)));
  for(const route of next.road_demo.routes){
   for(const id of route.segment_ids){
    if(route.id==='B'&&shared.has(id))continue;
    const s=next.segments.find(s=>s.id===id),points=s.geometry.coordinates.map(([x,y])=>[y,x]);bounds.extend(points);
    L.polyline(points,{color:'#fff',weight:10,interactive:false}).addTo(group);
    const line=L.polyline(points,{color:shared.has(id)?'#526a75':palette[route.id],weight:6}).addTo(group);
    line.bindTooltip(`${esc(s.name)} · ${s.condition_score??'未知'} 分`);
   }
   const exclusive=next.segments.find(s=>s.id===(route.label_segment||route.id+'03')),p=exclusive.geometry.coordinates[0];
   L.tooltip({permanent:true,direction:'right',className:'demo-route-label'}).setLatLng([p[1],p[0]]).setContent(`<b style="color:${palette[route.id]}">${route.id}</b>`).addTo(group);
  }
  addEndpoints(next,group);
  addEvidence(map,next,group,'route-demo-evidence');fit();
  const requestController=controller;
  const timeout=setTimeout(()=>requestController.abort(),20000);
  try{
   const query=new URLSearchParams({dataset:next.dataset.id,as_of:next.as_of});
   const response=await fetch(`${config.base}/api/data/v1/routes/analyze?${query}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({routes:next.road_demo.routes}),signal:controller.signal});
   if(!response.ok)throw new Error('路線評分載入失敗，請更新資料重試。');
   const result=await response.json();if(current!==generation)return;
   results=result.routes;rank();
  }catch(e){if(current===generation){snapshot=null;$('route-recommendation').textContent=e.name==='AbortError'?'請求逾時，請更新資料重試。':e.message;}}
  finally{clearTimeout(timeout);}
 }
 function clear(){generation++;controller?.abort();snapshot=null;results=[];group?.clearLayers();$('road-route-demo').hidden=true;$('road-route-scores').replaceChildren();$('route-demo-evidence').replaceChildren();}
 return {addEvidence,addEndpoints,renderRoutes,clear};
})();
