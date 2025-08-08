// 抽屜控制
const searchToggle = document.getElementById('searchToggle');
const listToggle = document.getElementById('listToggle');
const statsToggle = document.getElementById('statsToggle');
const llmToggle = document.getElementById('llmToggle');
const searchDrawer = document.getElementById('searchDrawer');
const listDrawer = document.getElementById('listDrawer');
const statsDrawer = document.getElementById('statsDrawer');
const llmDrawer = document.getElementById('llmDrawer');
const mapContainer = document.getElementById('mapContainer');

let activeDrawer = 'list'; // 預設顯示列表

// 重置所有選擇
function resetAllSelections() {
    // 重置城市選擇
    document.querySelectorAll('.city-checkbox').forEach(cb => cb.checked = false);
    document.getElementById('city_all').checked = false;
    
    // 重置行政區選擇
    const districtContainer = document.querySelector('#districtCheckboxes .checkbox-groups');
    districtContainer.innerHTML = '<div class="text-muted">請先選擇城市</div>';
    document.getElementById('district_all').checked = false;
    document.getElementById('district_all').disabled = true;
    
    // 重置街道選擇
    const roadContainer = document.querySelector('#roadCheckboxes .checkbox-groups');
    roadContainer.innerHTML = '<div class="text-muted">請先選擇城市和行政區</div>';
    document.getElementById('road_all').checked = false;
    document.getElementById('road_all').disabled = true;
    
    // 重置瑕疵類型為全選
    document.getElementById('defect_type_all').checked = true;
    document.querySelectorAll('.defect-type-checkbox').forEach(cb => cb.checked = true);
    
    // 重置嚴重程度為全選
    document.getElementById('severity_all').checked = true;
    document.querySelectorAll('.severity-checkbox').forEach(cb => cb.checked = true);
    
    // 重置時間範圍
    document.getElementById('start_time').value = '';
    document.getElementById('end_time').value = '';
}

// 初始化表單和事件監聽器
function initializeSearchForm() {
    const searchForm = document.getElementById('searchForm');
    const resetButton = document.getElementById('resetButton');
    
    if (!searchForm || !resetButton) {
        return;
    }
    
    // 綁定重置按鈕事件
    resetButton.addEventListener('click', resetAllSelections);
    
    // 添加表單提交事件監聽器
    searchForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        // 構建查詢參數
        const searchParams = new URLSearchParams();
        
        // 處理城市勾選框
        const cityAll = document.getElementById('city_all');
        if (cityAll && cityAll.checked) {
            // 當選擇"全部"時,傳遞特殊值 "all"
            searchParams.append('city', 'all');
        } else {
            const selectedCities = Array.from(document.querySelectorAll('.city-checkbox:checked')).map(cb => cb.value);
            if (selectedCities.length > 0) {
                // 一次性添加所有選中的城市
                selectedCities.forEach(city => searchParams.append('city', city));
            }
        }

        // 處理行政區勾選框
        const districtAll = document.getElementById('district_all');
        if (districtAll && districtAll.checked) {
            searchParams.append('district', 'all');
        } else {
            const selectedDistricts = Array.from(document.querySelectorAll('.district-checkbox:checked')).map(cb => cb.value);
            if (selectedDistricts.length > 0) {
                selectedDistricts.forEach(district => searchParams.append('district', district));
            }
        }

        // 處理街道勾選框
        const roadAll = document.getElementById('road_all');
        if (roadAll && roadAll.checked) {
            searchParams.append('road_section', 'all');
        } else {
            const selectedRoads = Array.from(document.querySelectorAll('.road-checkbox:checked')).map(cb => cb.value);
            if (selectedRoads.length > 0) {
                selectedRoads.forEach(road => searchParams.append('road_section', road));
            }
        }

        // 處理瑕疵類型
        const defectTypeAll = document.getElementById('defect_type_all');
        if (defectTypeAll && defectTypeAll.checked) {
            searchParams.append('defect_type', 'all');
        } else {
            const selectedDefectTypes = Array.from(document.querySelectorAll('.defect-type-checkbox:checked')).map(cb => cb.value);
            if (selectedDefectTypes.length > 0) {
                selectedDefectTypes.forEach(type => searchParams.append('defect_type', type));
            }
        }

        // 處理嚴重程度
        const severityAll = document.getElementById('severity_all');
        if (severityAll && severityAll.checked) {
            searchParams.append('severity', 'all');
        } else {
            const selectedSeverities = Array.from(document.querySelectorAll('.severity-checkbox:checked')).map(cb => cb.value);
            if (selectedSeverities.length > 0) {
                selectedSeverities.forEach(severity => searchParams.append('severity', severity));
            }
        }

        // 處理時間範圍
        const startTime = document.getElementById('start_time').value;
        const endTime = document.getElementById('end_time').value;
        
        if (startTime && endTime) {
            if (new Date(startTime) > new Date(endTime)) {
                alert('開始時間不能大於結束時間');
                return;
            }
            
            const startDate = new Date(startTime);
            const endDate = new Date(endTime);
            searchParams.append('start_time', startDate.toISOString().replace('.000Z', '+00:00'));
            searchParams.append('end_time', endDate.toISOString().replace('.000Z', '+00:00'));
        }
        
        // 顯示載入指示器
        const loadingElement = document.querySelector('.loading');
        if (loadingElement) {
            loadingElement.style.display = 'flex';
        }
        
        // 重定向到搜尋結果頁面
        window.location.href = `${window.location.pathname}?${searchParams.toString()}`;
    });
}

// 初始化全選功能
function initializeCheckboxGroups() {
    // 瑕疵類型全選功能
    const defectTypeAll = document.getElementById('defect_type_all');
    const defectTypeCheckboxes = document.querySelectorAll('.defect-type-checkbox');
    
    if (defectTypeAll && defectTypeCheckboxes.length > 0) {
        defectTypeAll.addEventListener('change', function() {
            defectTypeCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });

        defectTypeCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const allChecked = Array.from(defectTypeCheckboxes).every(cb => cb.checked);
                const noneChecked = Array.from(defectTypeCheckboxes).every(cb => !cb.checked);
                defectTypeAll.checked = allChecked;
                defectTypeAll.indeterminate = !allChecked && !noneChecked;
            });
        });
    }

    // 嚴重程度全選功能
    const severityAll = document.getElementById('severity_all');
    const severityCheckboxes = document.querySelectorAll('.severity-checkbox');
    
    if (severityAll && severityCheckboxes.length > 0) {
        severityAll.addEventListener('change', function() {
            severityCheckboxes.forEach(checkbox => {
                checkbox.checked = this.checked;
            });
        });

        severityCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                const allChecked = Array.from(severityCheckboxes).every(cb => cb.checked);
                const noneChecked = Array.from(severityCheckboxes).every(cb => !cb.checked);
                severityAll.checked = allChecked;
                severityAll.indeterminate = !allChecked && !noneChecked;
            });
        });
    }
}

// 抽屜切換函數
function toggleDrawer(type) {
    const drawers = {
        search: searchDrawer,
        list: listDrawer,
        stats: statsDrawer,
        llm: llmDrawer
    };
    const toggles = {
        search: searchToggle,
        list: listToggle,
        stats: statsToggle,
        llm: llmToggle
    };

    if (activeDrawer !== type) {
        // 隱藏所有抽屜
        Object.values(drawers).forEach(drawer => drawer.classList.remove('active'));
        Object.values(toggles).forEach(toggle => toggle.classList.remove('active'));
        
        // 顯示當前抽屜
        drawers[type].classList.add('active');
        toggles[type].classList.add('active');
        activeDrawer = type;

        // 只在非統計分析抽屜時重新計算地圖大小
        if (type !== 'stats' && typeof map !== 'undefined') {
            setTimeout(() => map.invalidateSize(), 300);
        }
    }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
    // 初始化表單
    initializeSearchForm();
    
    // 初始化全選功能
    initializeCheckboxGroups();
    
    // 初始化抽屜
    listDrawer.classList.add('active');
    listToggle.classList.add('active');
});

// 抽屜切換事件
searchToggle.addEventListener('click', () => toggleDrawer('search'));
listToggle.addEventListener('click', () => toggleDrawer('list')); 
statsToggle.addEventListener('click', () => toggleDrawer('stats'));
llmToggle.addEventListener('click', () => toggleDrawer('llm'));