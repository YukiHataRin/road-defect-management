/* Single Leaflet instance; source GPS markers are separate from grid centroids. */
window.RoadMap = (() => {
  'use strict';
  const $=id=>document.getElementById(id);
  const config=JSON.parse($('portal-config').textContent);
  const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const severityNames=['輕微','中等','嚴重'], typeNames=['橫向裂紋','縱向裂紋','龜裂','坑洞'];
  const bandColors={good:'#397563',fair:'#b18b3e',poor:'#bc5b42',unknown:'#7c8b8a'};
  let map, tiles, markers, lines, snapshot, allPoints=[], recordMarkers=new Map();
  let generation=0, tilesFailed=false, tileTimer, dataMessage='', tileMessage='', bounds, pendingFit=false, activeId=null;

  function status(){
    $('map-network').textContent=[tileMessage,dataMessage].filter(Boolean).join(' ｜ ');
    $('map-network').classList.toggle('warning',tilesFailed || !!dataMessage);
  }
  function init(){
    if(map) return true;
    if(!window.L || !L.markerClusterGroup){
      dataMessage='地圖元件載入失敗，請重新整理；道路清單仍可查閱。'; status(); return false;
    }
    const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
    map=L.map('street-map',{scrollWheelZoom:false,zoomControl:false,zoomAnimation:!reduced,fadeAnimation:!reduced,markerZoomAnimation:!reduced,maxZoom:config.map.maxZoom,minZoom:6});
    L.control.zoom({zoomInTitle:'放大地圖',zoomOutTitle:'縮小地圖'}).addTo(map);
    L.control.scale({imperial:false,position:'bottomleft'}).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com" target="_blank" rel="noopener">Leaflet</a>');
    markers=L.markerClusterGroup({animate:!reduced,showCoverageOnHover:false,maxClusterRadius:45,spiderfyOnMaxZoom:true});
    lines=L.featureGroup().addTo(map); markers.addTo(map);
    tiles=L.tileLayer(config.map.tileUrl,{maxZoom:config.map.maxZoom,attribution:config.map.attribution,referrerPolicy:'strict-origin-when-cross-origin',updateWhenIdle:true,keepBuffer:1});
    tiles.on('loading',()=>{
      tilesFailed=false; tileMessage='底圖載入中…'; status(); clearTimeout(tileTimer);
      tileTimer=setTimeout(()=>{tilesFailed=true;tileMessage='底圖連線較慢，點位仍可查閱；請稍後重試。';status();},15000);
    });
    tiles.on('tileerror',()=>{tilesFailed=true;tileMessage='部分或全部底圖無法載入，請重試；評分與照片仍可查閱。';status();});
    tiles.on('load',()=>{clearTimeout(tileTimer);if(!tilesFailed) tileMessage='底圖已載入 · OpenStreetMap';status();});
    tiles.addTo(map);
    map.on('moveend',()=>{
      if(!snapshot || $('street-map').hidden) return;
      const url=new URL(location.href), center=map.getCenter();
      url.searchParams.set('mlat',center.lat.toFixed(6));url.searchParams.set('mlon',center.lng.toFixed(6));url.searchParams.set('mz',map.getZoom());
      if(snapshot.road_demo)url.searchParams.set('area',snapshot.road_demo.version);
      history.replaceState(null,'',url);
    });
    return true;
  }
  function showFit(){
    if(!map || !$('street-map').clientWidth) {pendingFit=true;return;}
    map.invalidateSize({pan:false});
    if(bounds?.isValid()) map.fitBounds(bounds,{padding:[32,32],maxZoom:17,animate:false});
    else map.setView([23.8,120.95],7,{animate:false});
    pendingFit=false;
  }
  function restoreOrFit(){
    const params=new URLSearchParams(location.search),lat=Number(params.get('mlat')),lon=Number(params.get('mlon')),z=Number(params.get('mz'));
    if(snapshot.road_demo && params.get('area')!==snapshot.road_demo.version){showFit();return;}
    if(params.has('mlat')&&lat>=21&&lat<=26&&lon>=118&&lon<=123&&z>=6&&z<=19&&$('street-map').clientWidth){
      map.setView([lat,lon],z,{animate:false});pendingFit=false;
    }else showFit();
  }
  function decorations(){
    const synthetic=snapshot.dataset.source_kind==='synthetic';
    $('map-source-note').textContent=synthetic
      ? '東大路・玉門路｜道路線形：OSM／OSRM。分數與瑕疵位置為展示資料，照片非此位置實拍。'
      : '顯示來源紀錄原始 GPS，不使用網格中心；定位與道路歸屬尚未現地核實。底圖服務只取得瀏覽範圍，不取得照片。';
    $('map-legend').innerHTML=synthetic
      ? '<span>━ 道路區段</span><span class="good">良好 ≥80</span><span class="fair">注意 60–79</span><span class="poor">優先檢視 &lt;60</span><span class="unknown">未知</span><span>①②③ 展示瑕疵照片</span>'
      : '<span class="good">① 輕微</span><span class="fair">② 中等</span><span class="poor">③ 嚴重</span><span>數字群聚＝觀測筆數；不是道路評分</span>';
  }
  async function loadPoints(){
    const current=++generation;
    dataMessage='正在讀取原始 GPS 觀測…';status();
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000);
    try{
      const query=new URLSearchParams({dataset:snapshot.dataset.id,as_of:snapshot.as_of,limit:2000});
      const response=await fetch(`${config.base}/api/data/v1/observations?${query}`,{credentials:'same-origin',signal:controller.signal});
      if(!response.ok) throw new Error('無法載入觀測資料，請確認登入狀態後重試。');
      const body=await response.json();
      if(current!==generation)return;
      allPoints=body.points;
      dataMessage=body.needs_sync?'此資料集尚未同步原始座標，請按「同步既有巡檢資料」。'
        :body.next_offset!==null?`僅顯示最近 ${body.points.length} / ${body.total} 筆，並非全部覆蓋範圍。`
        :!body.total?'查詢日期以前沒有原始觀測點。':'';
      $('map-record-controls').hidden=false;
      filterPoints(); restoreOrFit();status();
    }catch(error){
      if(current!==generation)return;
      dataMessage=error.name==='AbortError'?'觀測資料請求逾時，請重試。':error.message;
      $('map-count').textContent='原始觀測尚未載入；未使用網格中心替代。';status();showFit();
    }finally{clearTimeout(timeout);}
  }
  function filterPoints(){
    if(!map)return;
    markers.clearLayers();recordMarkers.clear();
    const query=$('map-search').value.trim().toLowerCase();
    const filtered=allPoints.filter(p=>`${p.id} ${p.road_name}`.toLowerCase().includes(query));
    for(const point of filtered){
      const marker=L.marker([point.latitude,point.longitude],{
        icon:L.divIcon({className:`observation-marker severity-${point.severity}`,html:`<span>${Number(point.severity)+1}</span>`,iconSize:[32,32],iconAnchor:[16,16]}),
        title:`觀測 ${point.id} · ${point.road_name} · ${severityNames[point.severity]}`,keyboard:true,
      });
      marker.on('click',()=>selectPoint(point.id));
      recordMarkers.set(point.id,marker);markers.addLayer(marker);
    }
    bounds=filtered.length?L.latLngBounds(filtered.map(p=>[p.latitude,p.longitude])):null;
    $('map-record').innerHTML='<option value="">選擇紀錄，查看座標與照片</option>'+filtered.map(p=>`<option value="${esc(p.id)}">#${esc(p.id)} · ${esc(p.road_name)} · ${esc(p.captured_at.slice(0,10))}</option>`).join('');
    $('map-count').textContent=`目前顯示 ${filtered.length} / ${allPoints.length} 筆已載入 GPS 觀測 · ${snapshot.as_of}`;
    if(!filtered.some(p=>p.id===activeId)){$('map-inspector').hidden=true;activeId=null;}
    else $('map-record').value=activeId;
  }
  function selectPoint(id){
    const point=allPoints.find(p=>p.id===id);if(!point)return;
    activeId=id; $('map-record').value=id;
    const image=(url,label)=>url?`<figure><figcaption>${label}</figcaption><img src="${esc(url)}" alt="觀測 ${esc(point.id)} ${label}" loading="lazy"><p class="photo-missing" hidden>照片缺失或無法讀取；紀錄仍可查閱。</p><a href="${esc(url)}" target="_blank" rel="noopener">另開原尺寸照片 ↗</a></figure>`:`<figure><figcaption>${label}</figcaption><p class="photo-missing">此筆紀錄沒有提供${label}。</p></figure>`;
    $('map-inspector').innerHTML=`<div class="card-heading"><h3>觀測 #${esc(point.id)}</h3><button id="map-close-detail">收起紀錄</button></div><p><b>${esc(point.road_name)}</b></p><dl class="observation-facts"><div><dt>原始座標（緯度、經度）</dt><dd>${Number(point.latitude).toFixed(7)}, ${Number(point.longitude).toFixed(7)}</dd></div><div><dt>來源拍攝時間</dt><dd>${esc(point.captured_at)}</dd></div><div><dt>瑕疵／嚴重度</dt><dd>${esc(typeNames[point.defect_type]||'未分類')} ／ ${esc(severityNames[point.severity]||'未知')}</dd></div><div><dt>彙整網格</dt><dd>${esc(point.segment_id)}</dd></div></dl><div class="evidence-photos">${image(point.original_image_url,'原始照片')}${image(point.image_url,'瑕疵裁切照片')}</div><p class="note">照片與座標來自既有紀錄，尚未驗證其現地一致性；點位不是道路線形或導航結果。</p><button data-segment="${esc(point.segment_id)}">查看所屬網格的評分與歷史 →</button>`;
    $('map-inspector').hidden=false;
    $('map-close-detail').onclick=()=>{$('map-inspector').hidden=true;activeId=null;$('map-record').focus();};
    $('map-inspector').querySelectorAll('img').forEach(img=>img.addEventListener('error',()=>{img.hidden=true;img.nextElementSibling.hidden=false;img.parentElement.querySelector('a').hidden=true;},{once:true}));
    const marker=recordMarkers.get(id);
    if(marker){
      map.setView(marker.getLatLng(),Math.max(map.getZoom(),17),{animate:false});
      markers.zoomToShowLayer(marker,()=>{marker.getElement()?.focus({preventScroll:true});});
    }
  }
  function render(next){
    if(!next||!init())return;
    decorationsFor(next);
    if(snapshot===next){map.invalidateSize({pan:false});if(pendingFit)restoreOrFit();return;}
    const first=!snapshot;snapshot=next;generation++;
    allPoints=[];activeId=null;markers.clearLayers();lines.clearLayers();recordMarkers.clear();bounds=null;
    $('map-inspector').hidden=true;$('map-record-controls').hidden=true;$('map-search').value='';dataMessage='';
    $('overview-demo-evidence').replaceChildren();
    if(next.dataset.source_kind==='synthetic'){
      for(const segment of next.segments){
        const layer=L.geoJSON(segment.geometry,{style:{color:bandColors[segment.condition_band],weight:6,dashArray:segment.condition_score===null?'7 7':null}});
        layer.bindTooltip(`${esc(segment.id)} · ${esc(segment.name)} · ${segment.condition_score??'未知'} 分`,{sticky:true});
        layer.on('click',()=>{document.dispatchEvent(new CustomEvent('road-segment-select',{detail:segment.id}));});
        lines.addLayer(layer);
      }
      bounds=lines.getBounds();$('map-count').textContent=`${next.segments.length} 個道路區段 · 分數截至 ${next.as_of}`;
      RoadDemo.addEvidence(map,next,lines,'overview-demo-evidence');
      RoadDemo.addEndpoints(next,lines);
      first?restoreOrFit():showFit();status();
    }else loadPoints();
  }
  function decorationsFor(next){const previous=snapshot;snapshot=next;decorations();snapshot=previous;}
  function clear(){
    generation++;snapshot=null;allPoints=[];activeId=null;bounds=null;dataMessage='';
    markers?.clearLayers();lines?.clearLayers();recordMarkers.clear();
    $('map-inspector').hidden=true;$('map-record-controls').hidden=true;
    $('overview-demo-evidence').replaceChildren();
    $('map-count').textContent='沒有可用資料快照';
  }
  function hide(){ clear();$('map-network').textContent='離線示意模式不載入底圖。'; }
  $('map-fit').addEventListener('click',showFit);
  $('map-retry').addEventListener('click',()=>{
    if(!snapshot)return;
    if(!map){if(snapshot)render(snapshot);return;}
    tilesFailed=false;tiles.redraw();if(snapshot?.dataset.source_kind!=='synthetic')loadPoints();
  });
  let searchTimer;
  $('map-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{filterPoints();showFit();},150);});
  $('map-record').addEventListener('change',()=>selectPoint($('map-record').value));
  new ResizeObserver(()=>{if(map&&$('street-map').clientWidth){map.invalidateSize({pan:false});if(pendingFit)restoreOrFit();}}).observe($('street-map'));
  return {render,clear,hide};
})();
