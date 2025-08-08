let map;
// 初始化變數和快取
let markers = new Map();
let markerClusterGroup;
let isMapVisible = true;
let userLocationMarker = null;
let userLocationCircle = null;
// 確保與 table.js 共享圖片快取 
let imageCache;
if (typeof window.imageCache === 'undefined') {
    imageCache = new Map();
    window.imageCache = imageCache;
} else {
    imageCache = window.imageCache;
}

// 定義圖片載入函數（如果 table.js 中沒有定義）
if (typeof window.loadImage === 'undefined') {
    window.loadImage = async function loadImage(img) {
        if (!img || !img.dataset || !img.dataset.src) return;
        
        const src = img.dataset.src;
        try {
            const response = await fetch(src);
            if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
            
            const blob = await response.blob();
            const objectUrl = URL.createObjectURL(blob);
            
            img.src = objectUrl;
            img.classList.add('loaded');
            
            // 保存到快取
            imageCache.set(src, objectUrl);
            return objectUrl;
        } catch (error) {
            console.error('圖片載入失敗:', error, src);
            img.src = '/static/images/image-not-found.png';
            return null;
        }
    };
}
// 確保外部函數可用
if (typeof window.viewDetails === 'undefined') {
    window.viewDetails = function(id) {
        if (id) {
            window.location.href = `${window.BASE_PATH || ''}/defects/detail/${id}`;
        }
    };0
1}

if (typeof window.showImagePreview === 'undefined') {
    window.showImagePreview = async function(src) {
        if (!src) return;
        
        const modal = document.getElementById('imagePreviewModal') || 
            createImagePreviewModal();
            
        const modalImg = modal.querySelector('.modal-image');
        if (!modalImg) return;
        
        modalImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
        
        if (imageCache.has(src)) {
            modalImg.src = imageCache.get(src);
        } else {
            try {
                const response = await fetch(src);
                if (!response.ok) throw new Error(`HTTP 錯誤: ${response.status}`);
                
                const blob = await response.blob();
                const objectUrl = URL.createObjectURL(blob);
                
                modalImg.src = objectUrl;
                imageCache.set(src, objectUrl);
            } catch (error) {
                console.error('圖片載入失敗:', error, src);
                modalImg.src = '/static/images/image-not-found.png';
            }
        }
        
        // 顯示模態視窗
        const bsModal = new bootstrap.Modal(modal);
        bsModal.show();
    };
    
    // 創建圖片預覽模態視窗
    function createImagePreviewModal() {
        const modal = document.createElement('div');
        modal.className = 'modal fade';
        modal.id = 'imagePreviewModal';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', 'imagePreviewModalLabel');
        modal.setAttribute('aria-hidden', 'true');
        
        modal.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="imagePreviewModalLabel">瑕疵圖片預覽</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="關閉"></button>
                    </div>
                    <div class="modal-body text-center">
                        <img src="" class="modal-image img-fluid" alt="瑕疵圖片">
                    </div>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        return modal;
    }
}

// 瑕疵類型名稱映射
const defectTypeNames = {
    0: '橫向裂紋',
    1: '縱向裂紋',
    2: '龜裂',
    3: '坑洞'
};

// 瑕疵類型圖示映射
const defectTypeIcons = {
    0: 'fas fa-grip-lines',          // 橫向裂紋
    1: 'fas fa-grip-lines-vertical', // 縱向裂紋
    2: 'fas fa-border-all',          // 龜裂
    3: 'far fa-circle'               // 坑洞
};


// 嚴重程度名稱映射
const severityNames = {
    0: '輕微',
    1: '中等',
    2: '嚴重'
};

// 嚴重程度顏色映射
const severityColors = {
    0: '#4CAF50',  // 輕微 - 綠色
    1: '#FFC107',  // 中等 - 黃色
    2: '#F44336'   // 嚴重 - 紅色
};

// 顯示載入指示器
function showLoading(message = '載入中...') {
    // 檢查是否已有載入指示器
    let loadingElement = document.getElementById('map-loading');
    
    if (!loadingElement) {
        // 創建載入指示器
        loadingElement = document.createElement('div');
        loadingElement.id = 'map-loading';
        loadingElement.className = 'map-loading';
        
        const spinnerHTML = `
            <div class="loading-overlay">
                <div class="loading-content">
                    <div class="spinner"></div>
                    <div class="loading-message">${message}</div>
                    <div class="loading-progress-container">
                        <div class="loading-progress-bar" id="map-loading-progress"></div>
                    </div>
                </div>
            </div>
        `;
        
        loadingElement.innerHTML = spinnerHTML;
        document.body.appendChild(loadingElement);
    } else {
        // 更新現有載入指示器的消息
        const messageElement = loadingElement.querySelector('.loading-message');
        if (messageElement) {
            messageElement.textContent = message;
        }
        loadingElement.style.display = 'flex';
    }
}

// 隱藏載入指示器
function hideLoading() {
    const loadingElement = document.getElementById('map-loading');
    if (loadingElement) {
        loadingElement.style.display = 'none';
    }
}

// 更新載入進度
function updateLoadingProgress(percent) {
    const progressBar = document.getElementById('map-loading-progress');
    if (progressBar) {
        progressBar.style.width = `${percent}%`;
    }
}

// 初始化地圖
async function initMap() {
    try {
        // 顯示載入指示器
        showLoading('正在載入地圖...');
        updateLoadingProgress(10);
        
        // 定義預設位置（台中市中心）
        const defaultCenter = [24.1477, 120.6736];
        let center = defaultCenter;
        let zoom = 13;
        
        // 確保地圖容器存在
        const mapContainer = document.getElementById('map');
        if (!mapContainer) {
            console.error('找不到地圖容器元素 #map');
            hideLoading();
            return;
        }
        
        updateLoadingProgress(20);
        
        // 嘗試獲取使用者位置
        try {
            const position = await getUserLocation();
            center = [position.latitude, position.longitude];
            zoom = 16;
        } catch (error) {
            console.warn('無法獲取使用者位置，使用預設位置:', error);
        }
        
        updateLoadingProgress(30);
        
        // 初始化地圖
        map = L.map('map', {
            center: center,
            zoom: zoom,
            zoomControl: false,
            maxZoom: 20
        });
        
        updateLoadingProgress(40);
        
        // 確保API密鑰存在
        if (!window.MAPTILER_API_KEY || !window.MAPTILER_STYLE_URL) {
            console.error('缺少地圖API密鑰或樣式URL，請確保已定義 window.MAPTILER_API_KEY 和 window.MAPTILER_STYLE_URL');
        }

        // 添加縮放控制到右上角
        L.control.zoom({
            position: 'topright'
        }).addTo(map);

        updateLoadingProgress(50);

        // 添加定位按鈕
        const locateControl = L.control({
            position: 'topright'
        });

        locateControl.onAdd = function(map) {
            const div = L.DomUtil.create('div', 'leaflet-control-locate leaflet-bar leaflet-control');
            div.innerHTML = `
                <a class="leaflet-bar-part leaflet-bar-part-single" title="定位到我的位置">
                    <i class="fas fa-map-marker-alt"></i>
                </a>
            `;
            div.onclick = () => {
                if (userLocationMarker) {
                    map.flyTo(userLocationMarker.getLatLng(), 16, {
                        duration: 0.5,
                        easeLinearity: 0.5
                    });
                } else {
                    // 如果沒有位置標記，嘗試獲取用戶位置
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            const { latitude, longitude } = position.coords;
                            const userLatLng = [latitude, longitude];
                            
                            // 創建位置標記
                            userLocationMarker = L.marker(userLatLng, {
                                icon: L.divIcon({
                                    className: 'user-location-marker',
                                    html: '<div class="pulse"></div>',
                                    iconSize: [20, 20]
                                })
                            }).addTo(map);
                            
                            // 創建精確度圓圈
                            if (position.coords.accuracy) {
                                userLocationCircle = L.circle(userLatLng, {
                                    radius: position.coords.accuracy,
                                    color: '#4A90E2',
                                    fillColor: '#4A90E2',
                                    fillOpacity: 0.1,
                                    weight: 1
                                }).addTo(map);
                            }
                            
                            // 飛到用戶位置
                            map.flyTo(userLatLng, 16, {
                                duration: 0.5,
                                easeLinearity: 0.5
                            });
                        },
                        (error) => {
                            console.error('無法獲取位置:', error);
                            
                            let errorMessage = '無法獲取您的位置。';
                            
                            // 針對不同錯誤提供更具體的指導
                            if (error.code === 1) { // PERMISSION_DENIED
                                errorMessage = '無法獲取位置：權限被拒絕。\n\n請檢查：\n1. Chrome位置權限設定 (chrome://settings/content/location)\n2. 網站是否在允許列表中\n3. Windows系統位置服務是否開啟 (設定→隱私權→位置)';
                            } else if (error.code === 2) { // POSITION_UNAVAILABLE
                                errorMessage = '位置信息不可用。請確保您的設備支持地理定位且正常工作。';
                            } else if (error.code === 3) { // TIMEOUT
                                errorMessage = '獲取位置超時。請確保您的網絡連接正常並再次嘗試。';
                            }
                            
                            alert(errorMessage);
                        },
                        {
                            enableHighAccuracy: true,
                            timeout: 10000,
                            maximumAge: 0
                        }
                    );
                }
            };
            return div;
        };

        locateControl.addTo(map);

        updateLoadingProgress(60);

        // 添加 MapTiler 向量圖層
        const mtLayer = L.maptiler.maptilerLayer({
            apiKey: window.MAPTILER_API_KEY || '',
            style: window.MAPTILER_STYLE_URL || ''
        }).addTo(map);

        updateLoadingProgress(70);

        // 初始化聚合群組
        markerClusterGroup = L.markerClusterGroup({
            maxClusterRadius: 50,
            spiderfyOnMaxZoom: true,
            showCoverageOnHover: false,
            zoomToBoundsOnClick: true,
            disableClusteringAtZoom: 18,
            iconCreateFunction: createClusterIcon
        });

        map.addLayer(markerClusterGroup);
        
        // 初始化地圖控制
        initMapControls();

        // 添加圖例
        addLegend();

        updateLoadingProgress(80);

        // 載入初始資料
        const mapDataElement = document.getElementById('map-data');
        if (mapDataElement && mapDataElement.textContent) {
            try {
                updateLoadingProgress(85);
                const mapData = JSON.parse(mapDataElement.textContent);
                updateLoadingProgress(90);
                await updateMapMarkers(mapData);
                updateLoadingProgress(95);
            } catch (error) {
                console.error('解析地圖資料時出錯:', error);
            }
        } else {
            console.warn('找不到地圖資料元素或元素為空');
        }

        // 隱藏載入指示器
        setTimeout(() => {
            updateLoadingProgress(100);
            hideLoading();
        }, 500);

        // 開始持續追蹤使用者位置
        startLocationTracking();

    } catch (error) {
        console.error('初始化地圖時發生錯誤:', error);
        hideLoading();
    }
}

// 獲取使用者位置
async function getUserLocation() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('瀏覽器不支援地理位置功能'));
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                resolve({ latitude, longitude, accuracy });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            }
        );
    });
}

// 創建聚合圖標
function createClusterIcon(cluster) {
    // 計算群集中各嚴重程度的數量
    const severityCounts = {0: 0, 1: 0, 2: 0};
    let maxSeverity = 0;
    
    cluster.getAllChildMarkers().forEach(marker => {
        const severity = marker.severity || 1;
        severityCounts[severity]++;
        if (severity > maxSeverity) {
            maxSeverity = severity;
        }
    });

    // 使用最高嚴重程度的顏色
    const color = severityColors[maxSeverity];
    const count = cluster.getChildCount();
    let size = 'small';
    
    if (count > 50) size = 'large';
    else if (count > 20) size = 'medium';

    return L.divIcon({
        html: `<div style="background-color: ${color};">
                 <span>${count}</span>
               </div>`,
        className: `marker-cluster marker-cluster-${size}`,
        iconSize: L.point(40, 40)
    });
}

// 添加圖例
function addLegend() {
    const legend = L.control({ position: 'bottomright' });

    legend.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = `
            <div class="legend-title">瑕疵類型</div>
            ${Object.entries(defectTypeNames).map(([type, name]) => `
                <div class="legend-item">
                    <div class="legend-icon">
                        <i class="${defectTypeIcons[type]}"></i>
                    </div>
                    <div class="legend-text">${name}</div>
                </div>
            `).join('')}
            <div class="legend-title mt-3">嚴重程度</div>
            ${Object.entries(severityNames).map(([value, name]) => `
                <div class="legend-item">
                    <div class="legend-icon" style="background-color: ${severityColors[value]};">
                    </div>
                    <div class="legend-text">${name}</div>
                </div>
            `).join('')}
        `;
        return div;
    };

    legend.addTo(map);
}

// 初始化地圖控制
function initMapControls() {
    const mapContainer = document.getElementById('mapContainer');
    const mapToggle = document.getElementById('mapToggle');
    const content = document.querySelector('.content-with-map');

    // 添加全螢幕控制按鈕
    const fullscreenControl = L.control({
        position: 'topright'
    });

    fullscreenControl.onAdd = function(map) {
        const div = L.DomUtil.create('div', 'leaflet-control-fullscreen leaflet-bar leaflet-control');
        div.innerHTML = `
            <a class="leaflet-bar-part leaflet-bar-part-single" title="切換全螢幕">
                <i class="fas fa-expand"></i>
            </a>
        `;
        div.onclick = toggleFullscreen;
        return div;
    };

    fullscreenControl.addTo(map);

    if (mapToggle) {
        mapToggle.addEventListener('click', () => {
            isMapVisible = !isMapVisible;
            mapContainer.classList.toggle('map-hidden');
            content.classList.toggle('content-full');
            
            // 更新按鈕圖標和位置
            if (!isMapVisible) {
                mapToggle.style.top = '59px';
            } else {
                mapToggle.style.top = '66px';
            }
            
            mapToggle.querySelector('i').className = isMapVisible ? 
                'fas fa-chevron-up' : 
                'fas fa-chevron-down';
                
            // 觸發地圖重新計算大小
            setTimeout(() => {
                map.invalidateSize();
            }, 300);
        });
    }
}

// 切換全螢幕功能
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        // 進入全螢幕
        if (document.documentElement.requestFullscreen) {
            document.documentElement.requestFullscreen();
        } else if (document.documentElement.webkitRequestFullscreen) { // Safari
            document.documentElement.webkitRequestFullscreen();
        } else if (document.documentElement.msRequestFullscreen) { // IE11
            document.documentElement.msRequestFullscreen();
        }
    } else {
        // 退出全螢幕
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) { // Safari
            document.webkitExitFullscreen();
        } else if (document.msExitFullscreen) { // IE11
            document.msExitFullscreen();
        }
    }
}

// 監聽全螢幕變化事件
document.addEventListener('fullscreenchange', updateFullscreenButton);
document.addEventListener('webkitfullscreenchange', updateFullscreenButton);
document.addEventListener('msfullscreenchange', updateFullscreenButton);

// 更新全螢幕按鈕圖標
function updateFullscreenButton() {
    const fullscreenButton = document.querySelector('.leaflet-control-fullscreen .leaflet-bar-part');
    if (fullscreenButton) {
        const isFullscreen = document.fullscreenElement || 
                           document.webkitFullscreenElement || 
                           document.msFullscreenElement;
        fullscreenButton.innerHTML = `<i class="fas ${isFullscreen ? 'fa-compress' : 'fa-expand'}"></i>`;
    }
}

// 創建自定義圖標
function createCustomIcon(defectType, severity = 1) { // 預設為中等嚴重度
    // 確保 defectType 和 severity 都是數字
    const type = parseInt(defectType);
    const severityValue = parseInt(severity);
    const icon = defectTypeIcons[type] || 'fas fa-question-circle';
    const color = severityColors[severityValue] || severityColors[1]; // 如果沒有指定嚴重度，使用中等
    
    // console.log('Severity:', severityValue, 'Color:', color); // 添加調試日誌
    
    return L.divIcon({
        className: 'custom-div-icon',
        html: `
            <div class="marker-circle" style="background-color: ${color}; border: 2px solid ${color};">
                <i class="${icon}"></i>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15],
        popupAnchor: [0, -15]
    });
}

// 更新地圖上的瑕疵標記
async function updateMapMarkers(defects) {
    // 確保 defects 是一個有效的陣列
    if (!Array.isArray(defects)) {
        console.error('更新地圖標記時接收到無效的資料:', defects);
        return;
    }

    // 清除現有的標記
    markerClusterGroup.clearLayers();
    markers.clear();

    // 如果沒有資料，提前返回
    if (defects.length === 0) {
        return;
    }

    // 使用批次處理來防止瀏覽器卡頓
    const BATCH_SIZE = 100; // 每批次處理的標記數量
    const BATCH_DELAY = 0; // 批次間延遲（毫秒）

    for (let i = 0; i < defects.length; i += BATCH_SIZE) {
        const batch = defects.slice(i, i + BATCH_SIZE);
        updateLoadingProgress(85 + (i / defects.length) * 10);
        
        for (const defect of batch) {
            if (!defect || !defect.defect_type || !defect.latitude || !defect.longitude) {
                console.warn('跳過無效的瑕疵資料:', defect);
                continue;
            }

            try {
                const defectTypeId = defect.defect_type.value;
                const defectTypeName = defect.defect_type.name || '未知類型';
                const latlng = [
                    parseFloat(defect.latitude), 
                    parseFloat(defect.longitude)
                ];
                
                if (isNaN(latlng[0]) || isNaN(latlng[1]) || 
                    latlng[0] < -90 || latlng[0] > 90 || 
                    latlng[1] < -180 || latlng[1] > 180) {
                    console.warn(`瑕疵 ID ${defect.id} 的經緯度無效:`, latlng);
                    continue;
                }

                // 根據瑕疵的嚴重程度設置圖標
                const severity = defect.severity && typeof defect.severity.value !== 'undefined' ? 
                    parseInt(defect.severity.value) : 1;
                // console.log('Defect ID:', defect.id, 'Severity:', severity, 'Raw severity:', defect.severity); // 添加調試日誌
                
                const icon = createCustomIcon(defectTypeId, severity);
                
                const marker = L.marker(latlng, {
                    icon: icon,
                    title: `${defectTypeName} - ${defect.road_section || '未知位置'}`
                });

                marker.defectType = defectTypeId;
                marker.severity = severity;

                // 構建圖片URL
                const basePath = window.BASE_PATH || '';
                const imageUrl = `${basePath}/defects/image/${defect.id}`;

                // 添加彈出視窗 - 延遲綁定彈出窗口內容，僅在點擊時才創建
                marker.bindPopup(() => {
                    return `
                        <div class="marker-popup">
                            <h6>${defectTypeName}</h6>
                            <p><strong>位置：</strong>${defect.road_section || '未知'}</p>
                            <p><strong>行政區：</strong>${defect.district || '未知'}</p>
                            <p><strong>經緯度：</strong>${defect.latitude}, ${defect.longitude}</p>
                            <p><strong>報告時間：</strong>${defect.capture_time ? new Date(defect.capture_time).toLocaleString('zh-TW') : '未知'}</p>
                            ${defect.has_image ? `
                                <div class="popup-image-container">
                                    <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"
                                         data-src="/proxy-image/${defect.id}"
                                         alt="瑕疵圖片" 
                                         class="popup-image lazy"
                                         onclick="showImagePreview(this.dataset.src)">
                                </div>
                            ` : ''}
                            <div class="mt-2">
                                <button class="btn btn-sm btn-info" onclick="">
                                    查看詳情
                                </button>
                            </div>
                        </div>
                    `;
                });

                // 當彈出窗口打開時載入圖片
                marker.on('popupopen', function(e) {
                    const popup = e.popup;
                    if (!popup) return;
                    
                    const img = popup.getElement().querySelector('img.lazy');
                    if (!img || !img.dataset || !img.dataset.src) return;
                    
                    // 檢查是否已經有快取的圖片
                    if (typeof loadImage === 'function') {
                        if (imageCache && imageCache.has(img.dataset.src)) {
                            img.src = imageCache.get(img.dataset.src);
                            img.classList.add('loaded');
                        } else {
                            // 如果沒有快取，則載入圖片
                            loadImage(img).catch(error => {
                                console.error('圖片載入失敗:', error);
                            });
                        }
                    }
                });

                markerClusterGroup.addLayer(marker);
                markers.set(defect.id, marker);
            } catch (error) {
                console.error(`處理瑕疵 ID: ${defect.id || '未知'} 時發生錯誤:`, error);
            }
        }

        // 如果不是最後一批，且有設置批次延遲，則等待
        if (i + BATCH_SIZE < defects.length && BATCH_DELAY > 0) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }

    // 調整地圖視圖以顯示所有標記
    if (markers.size > 0) {
        try {
            const bounds = markerClusterGroup.getBounds();
            map.fitBounds(bounds, {
                padding: [50, 50],
                maxZoom: 16
            });
        } catch (error) {
            console.warn('無法調整地圖視圖:', error);
        }
    }
}

// 高亮顯示特定瑕疵的標記
function highlightMarker(defectId) {
    const marker = markers.get(defectId);
    if (marker) {
        map.setView(marker.getLatLng(), 18);
        marker.openPopup();
    }
}

// 開始追蹤使用者位置
function startLocationTracking() {
    if (!navigator.geolocation) {
        console.warn('瀏覽器不支援地理位置功能');
        return;
    }

    let watchId = null;
    let lastUpdateTime = 0;
    const MIN_UPDATE_INTERVAL = 2000; // 最小更新間隔（毫秒）
    let retryCount = 0;
    const MAX_RETRY = 3;

    // 更新使用者位置的函數
    function updateUserLocation(position) {
        try {
            retryCount = 0; // 重置重試計數
            
            const now = Date.now();
            // 檢查是否需要更新（避免過於頻繁的更新）
            if (now - lastUpdateTime < MIN_UPDATE_INTERVAL) {
                return;
            }
            lastUpdateTime = now;

            const { latitude, longitude, accuracy } = position.coords;
            // 確保位置資料有效
            if (isNaN(latitude) || isNaN(longitude) || 
                latitude < -90 || latitude > 90 || 
                longitude < -180 || longitude > 180) {
                console.warn('接收到無效的位置資料:', position.coords);
                return;
            }

            const userLatLng = [latitude, longitude];
            
            console.log('已更新用戶位置:', userLatLng);

            // 更新使用者位置標記
            if (userLocationMarker) {
                userLocationMarker.setLatLng(userLatLng);
            } else {
                userLocationMarker = L.marker(userLatLng, {
                    icon: L.divIcon({
                        className: 'user-location-marker',
                        html: '<div class="pulse"></div>',
                        iconSize: [20, 20]
                    })
                }).addTo(map);
            }

            // 更新精確度圓圈
            if (userLocationCircle) {
                userLocationCircle.setLatLng(userLatLng);
                if (accuracy) userLocationCircle.setRadius(accuracy);
            } else if (accuracy) {
                userLocationCircle = L.circle(userLatLng, {
                    radius: accuracy,
                    color: '#4A90E2',
                    fillColor: '#4A90E2',
                    fillOpacity: 0.1,
                    weight: 1
                }).addTo(map);
            }
        } catch (error) {
            console.error('更新使用者位置時發生錯誤:', error);
        }
    }

    // 處理位置錯誤
    function handleLocationError(error) {
        let errorMsg = '';
        switch(error.code) {
            case error.PERMISSION_DENIED:
                errorMsg = '使用者拒絕提供地理位置權限';
                // 權限被拒絕時設置一個標記，避免反复請求
                window.locationPermissionDenied = true;
                console.warn('位置權限被拒絕。如需啟用位置功能，請檢查：\n1. Chrome位置權限設定\n2. Windows系統位置服務');
                break;
            case error.POSITION_UNAVAILABLE:
                errorMsg = '位置資訊不可用';
                break;
            case error.TIMEOUT:
                errorMsg = '獲取使用者位置超時';
                break;
            case error.UNKNOWN_ERROR:
                errorMsg = '發生未知錯誤';
                break;
        }
        console.error('位置追蹤錯誤:', errorMsg);
        
        // 權限被拒絕時不進行重試
        if (error.code === error.PERMISSION_DENIED) {
            if (watchId !== null) {
                navigator.geolocation.clearWatch(watchId);
                watchId = null;
            }
            return;
        }
        
        retryCount++;
        
        // 重試連接（只在某些錯誤類型時嘗試，且不超過最大重試次數）
        if ((error.code === error.TIMEOUT || error.code === error.POSITION_UNAVAILABLE) && retryCount <= MAX_RETRY) {
            console.log(`重試獲取位置 (${retryCount}/${MAX_RETRY})...`);
            setTimeout(() => {
                if (watchId !== null) {
                    navigator.geolocation.clearWatch(watchId);
                    watchId = null;
                }
                startWatching();
            }, 5000 * retryCount); // 隨著重試次數增加等待時間
        }
    }

    // 設置位置追蹤選項
    const options = {
        enableHighAccuracy: true,
        timeout: 15000, // 增加超時時間
        maximumAge: 30000 // 允許使用較新的快取位置
    };

    // 開始持續追蹤
    function startWatching() {
        try {
            // 檢查是否已被拒絕位置權限
            if (window.locationPermissionDenied) {
                console.warn('位置權限已被拒絕，不再嘗試獲取位置。');
                return;
            }
            
            // 先獲取一次當前位置
            navigator.geolocation.getCurrentPosition(updateUserLocation, handleLocationError, options);
            
            // 然後開始持續追蹤
            watchId = navigator.geolocation.watchPosition(
                updateUserLocation,
                handleLocationError,
                options
            );
            
            console.log('開始位置追蹤，watchId:', watchId);
        } catch (error) {
            console.error('啟動位置追蹤時發生錯誤:', error);
        }
    }

    // 開始追蹤
    startWatching();

    // 頁面卸載時清理追蹤
    window.addEventListener('beforeunload', () => {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
            watchId = null;
        }
    });
}

// 更新搜尋結果
async function updateSearchResults(searchParams) {
    try {
        // 如果正在加載，則不重複請求
        if (window.isLoading) {
            return;
        }
        window.isLoading = true;
        
        showLoading('更新搜尋結果...');
        
        // 構建 API URL
        const basePath = window.BASE_PATH || '';
        const apiUrl = `${basePath}/api/v1/road-defects`;
        
        // 發送請求獲取數據
        const response = await fetch(`${apiUrl}?${searchParams.toString()}`);
        if (!response.ok) {
            throw new Error(`API 請求失敗: ${response.status}`);
        }
        
        const data = await response.json();
        
        // 更新地圖標記
        if (data.defects) {
            await updateMapMarkers(data.defects);
        }
        
        // 更新統計數據
        if (data.stats) {
            updateStats(data.stats);
        }
        
        // 更新列表視圖
        if (data.defects) {
            updateDefectList(data.defects);
        }
        
        hideLoading();
    } catch (error) {
        console.error('更新搜尋結果時發生錯誤:', error);
        hideLoading();
        alert('更新搜尋結果時發生錯誤，請稍後再試');
    } finally {
        window.isLoading = false;
    }
}

// 監聽 URL 參數變化
function watchUrlParams() {
    let lastParams = new URLSearchParams(window.location.search).toString();
    let updateTimeout = null;
    
    // 使用 MutationObserver 監聽 URL 變化
    const observer = new MutationObserver(() => {
        const currentParams = new URLSearchParams(window.location.search).toString();
        if (currentParams !== lastParams) {
            lastParams = currentParams;
            
            // 清除之前的延遲更新
            if (updateTimeout) {
                clearTimeout(updateTimeout);
            }
            
            // 設置新的延遲更新
            updateTimeout = setTimeout(() => {
                if (currentParams) {
                    updateSearchResults(new URLSearchParams(currentParams));
                }
            }, 500); // 500ms 延遲
        }
    });
    
    // 開始觀察 URL 變化
    observer.observe(document, { subtree: true, childList: true });
    
    // 頁面卸載時清理
    window.addEventListener('beforeunload', () => {
        observer.disconnect();
        if (updateTimeout) {
            clearTimeout(updateTimeout);
        }
    });
}

// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initMap();
    
    // 開始監聽 URL 參數變化
    watchUrlParams();
    
    // 為瑕疵列表中的圖片添加點擊事件處理程序
    document.addEventListener('click', function(event) {
        // 檢查是否點擊了瑕疵圖片容器或其子元素
        const target = event.target;
        let defectId = null;
        
        // 檢查點擊的元素或其父元素是否有 data-defect-id 屬性
        const defectElement = target.closest('[data-defect-id]');
        if (defectElement) {
            defectId = parseInt(defectElement.dataset.defectId);
        }
        
        // 如果沒有找到 data-defect-id，嘗試從 .defect-id 元素獲取
        if (!defectId) {
            const imageContainer = target.closest('.defect-image-container');
            if (imageContainer) {
                const defectItem = imageContainer.closest('.defect-item');
                if (defectItem) {
                    const idElement = defectItem.querySelector('.defect-id');
                    if (idElement) {
                        // 從 '#123' 格式中提取瑕疵ID
                        const idText = idElement.textContent;
                        defectId = parseInt(idText.replace('#', ''));
                    }
                }
            }
        }
        
        // 確認是點擊了圖片容器(防止點擊其他帶有data-defect-id的元素)
        if (defectId && !isNaN(defectId) && target.closest('.defect-image-container')) {
            // 阻止圖片預覽的默認行為（如果點擊的是圖片）
            if (target.tagName === 'IMG' && target.onclick) {
                event.preventDefault();
                event.stopPropagation();
            }
            
            // 確保地圖已初始化
            if (map) {
                // 關閉抽屜以便更好地查看地圖
                const listDrawer = document.getElementById('listDrawer');
                if (listDrawer && listDrawer.classList.contains('active')) {
                    const listToggle = document.getElementById('listToggle');
                    if (listToggle) listToggle.click();
                }
                
                // 高亮顯示標記並定位到該位置
                setTimeout(() => {
                    console.log('定位到瑕疵:', defectId);
                    highlightMarker(defectId);
                }, 300); // 等待抽屜關閉動畫完成
            }
        }
    });
}); 