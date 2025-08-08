// 統計分析位置選擇器邏輯
document.addEventListener('DOMContentLoaded', () => {
    // 初始化位置選擇器
    initStatsLocationSelector();
    
    // 綁定重置按鈕事件
    document.getElementById('statsResetButton').addEventListener('click', resetStatsSelections);

    // 綁定瑕疵類型全選事件
    bindStatsAllCheckbox('stats_defect_type_all', '.stats-defect-type-checkbox');
    
    // 綁定嚴重程度全選事件
    bindStatsAllCheckbox('stats_severity_all', '.stats-severity-checkbox');

    // 添加更新統計按鈕事件
    document.getElementById('updateStatsButton').addEventListener('click', updateAllStats);
    
    // 添加所有選擇器的變更事件
    const selectors = [
        '.stats-city-checkbox',
        '.stats-district-checkbox',
        '.stats-road-checkbox',
        '.stats-defect-type-checkbox',
        '.stats-severity-checkbox',
        '#stats_start_time',
        '#stats_end_time'
    ];
    
    selectors.forEach(selector => {
        document.addEventListener('change', (event) => {
            if (event.target.matches(selector)) {
                // 當任何選擇發生變化時自動更新統計資料
                updateAllStats();
            }
        });
    });
});

// 初始化位置選擇器
async function initStatsLocationSelector() {
    try {
        // 顯示載入指示器
        document.querySelector('.loading').style.display = 'flex';
        
        const response = await fetch('/api/locations/list');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        
        if (result.status === 'success' && result.data) {
            const locationData = result.data;
            console.log('Location data loaded:', locationData);
            
            // 初始化城市選擇器
            initStatsCitySelector(locationData);
            
            // 初始化區域和道路選項
            updateStatsDistrictOptions(locationData);
            updateStatsRoadOptions(locationData);
            
            // 綁定城市選擇事件
            document.querySelector('#statsCityCheckboxes').addEventListener('change', (event) => {
                if (event.target.classList.contains('stats-city-checkbox')) {
                    updateStatsDistrictOptions(locationData);
                }
            });
            
            // 綁定區域選擇事件
            document.querySelector('#statsDistrictCheckboxes').addEventListener('change', (event) => {
                if (event.target.classList.contains('stats-district-checkbox')) {
                    updateStatsRoadOptions(locationData);
                }
            });
            
            // 綁定全選事件
            bindStatsAllCheckbox('stats_city_all', '.stats-city-checkbox');
            bindStatsAllCheckbox('stats_district_all', '.stats-district-checkbox');
            bindStatsAllCheckbox('stats_road_all', '.stats-road-checkbox');
        } else {
            console.error('位置資料格式錯誤:', result);
        }
    } catch (error) {
        console.error('載入位置資料失敗:', error);
    } finally {
        // 隱藏載入指示器
        document.querySelector('.loading').style.display = 'none';
    }
}

// 初始化城市選擇器
function initStatsCitySelector(locationData) {
    const cityContainer = document.querySelector('#statsCityCheckboxes .checkbox-grid');
    cityContainer.innerHTML = ''; // 清空現有內容
    
    // 獲取所有城市
    const cities = Object.keys(locationData);
    
    // 創建城市複選框
    cities.forEach(city => {
        const checkbox = createStatsCheckbox(city, 'city', false); // 預設不選中
        cityContainer.appendChild(checkbox);
    });
}

// 更新區域選項
function updateStatsDistrictOptions(locationData) {
    const districtContainer = document.querySelector('#statsDistrictCheckboxes .checkbox-groups');
    districtContainer.innerHTML = ''; // 清空現有內容
    
    // 獲取選中的城市
    const selectedCities = Array.from(document.querySelectorAll('.stats-city-checkbox:checked'))
        .map(cb => cb.value);
    
    if (selectedCities.length === 0) {
        districtContainer.innerHTML = '<div class="text-muted">請先選擇城市</div>';
        return;
    }
    
    // 為每個選中的城市創建區域組
    selectedCities.forEach(city => {
        if (locationData[city]) {
            const districts = Object.keys(locationData[city]);
            if (districts.length > 0) {
                const group = createStatsDistrictGroup(city, districts);
                districtContainer.appendChild(group);
            }
        }
    });
}

// 更新道路選項
function updateStatsRoadOptions(locationData) {
    const roadContainer = document.querySelector('#statsRoadCheckboxes .checkbox-groups');
    roadContainer.innerHTML = ''; // 清空現有內容
    
    // 獲取選中的城市和區域
    const selectedCities = Array.from(document.querySelectorAll('.stats-city-checkbox:checked'))
        .map(cb => cb.value);
    const selectedDistricts = Array.from(document.querySelectorAll('.stats-district-checkbox:checked'))
        .map(cb => cb.value);
    
    if (selectedCities.length === 0 || selectedDistricts.length === 0) {
        roadContainer.innerHTML = '<div class="text-muted">請先選擇城市和行政區</div>';
        return;
    }
    
    // 為每個選中的區域創建道路組
    selectedCities.forEach(city => {
        if (locationData[city]) {
            Object.entries(locationData[city]).forEach(([district, roads]) => {
                if (selectedDistricts.includes(district) && roads.length > 0) {
                    const group = createStatsRoadGroup(district, roads);
                    roadContainer.appendChild(group);
                }
            });
        }
    });
}

// 創建統計分析用的複選框
function createStatsCheckbox(value, type, checked = false) {
    const div = document.createElement('div');
    div.className = 'form-check';
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = `form-check-input stats-${type}-checkbox`;
    input.id = `stats_${type}_${value}`;
    input.value = value;
    input.checked = checked;
    
    const label = document.createElement('label');
    label.className = 'form-check-label';
    label.htmlFor = input.id;
    label.textContent = value;
    
    div.appendChild(input);
    div.appendChild(label);
    
    return div;
}

// 創建統計分析用的區域組
function createStatsDistrictGroup(city, districts) {
    const group = document.createElement('div');
    group.className = 'checkbox-group';
    
    const title = document.createElement('div');
    title.className = 'checkbox-group-title';
    title.textContent = city;
    
    const content = document.createElement('div');
    content.className = 'checkbox-group-content';
    
    districts.forEach(district => {
        const checkbox = createStatsCheckbox(district, 'district');
        content.appendChild(checkbox);
    });
    
    group.appendChild(title);
    group.appendChild(content);
    
    return group;
}

// 創建統計分析用的道路組
function createStatsRoadGroup(district, roads) {
    const group = document.createElement('div');
    group.className = 'checkbox-group';
    
    const title = document.createElement('div');
    title.className = 'checkbox-group-title';
    title.textContent = district;
    
    const content = document.createElement('div');
    content.className = 'checkbox-group-content';
    
    roads.forEach(road => {
        const checkbox = createStatsCheckbox(road, 'road');
        content.appendChild(checkbox);
    });
    
    group.appendChild(title);
    group.appendChild(content);
    
    return group;
}

// 綁定統計分析用的全選複選框
function bindStatsAllCheckbox(allCheckboxId, itemCheckboxClass) {
    const allCheckbox = document.getElementById(allCheckboxId);
    if (!allCheckbox) return;

    // 全選框點擊事件
    allCheckbox.addEventListener('change', () => {
        document.querySelectorAll(itemCheckboxClass).forEach(checkbox => {
            checkbox.checked = allCheckbox.checked;
        });
    });
    
    // 監聽項目複選框的變化
    document.addEventListener('change', (event) => {
        if (event.target.matches(itemCheckboxClass)) {
            const allChecked = Array.from(document.querySelectorAll(itemCheckboxClass))
                .every(cb => cb.checked);
            allCheckbox.checked = allChecked;
        }
    });
}

// 重置統計分析的所有選擇
function resetStatsSelections() {
    // 重置城市選擇
    document.getElementById('stats_city_all').checked = false;
    document.querySelectorAll('.stats-city-checkbox').forEach(cb => cb.checked = false);
    
    // 重置區域選擇
    document.getElementById('stats_district_all').checked = false;
    const districtContainer = document.querySelector('#statsDistrictCheckboxes .checkbox-groups');
    districtContainer.innerHTML = '<div class="text-muted">請先選擇城市</div>';
    
    // 重置道路選擇
    document.getElementById('stats_road_all').checked = false;
    const roadContainer = document.querySelector('#statsRoadCheckboxes .checkbox-groups');
    roadContainer.innerHTML = '<div class="text-muted">請先選擇城市和行政區</div>';
    
    // 重置瑕疵類型
    document.getElementById('stats_defect_type_all').checked = false;
    document.querySelectorAll('.stats-defect-type-checkbox').forEach(cb => cb.checked = false);
    
    // 重置嚴重程度
    document.getElementById('stats_severity_all').checked = false;
    document.querySelectorAll('.stats-severity-checkbox').forEach(cb => cb.checked = false);
    
    // 重置時間範圍
    document.getElementById('stats_start_time').value = '';
    document.getElementById('stats_end_time').value = '';
}

// 收集所有選擇的參數
function getSelectedParameters() {
    const params = new URLSearchParams();
    
    // 收集城市選擇
    const selectedCities = Array.from(document.querySelectorAll('.stats-city-checkbox:checked'))
        .map(cb => cb.value);
    selectedCities.forEach(city => params.append('city[]', city));
    
    // 收集行政區選擇
    const selectedDistricts = Array.from(document.querySelectorAll('.stats-district-checkbox:checked'))
        .map(cb => cb.value);
    selectedDistricts.forEach(district => params.append('district[]', district));
    
    // 收集道路選擇
    const selectedRoads = Array.from(document.querySelectorAll('.stats-road-checkbox:checked'))
        .map(cb => cb.value);
    selectedRoads.forEach(road => params.append('road_section[]', road));
    
    // 收集瑕疵類型選擇
    const selectedDefectTypes = Array.from(document.querySelectorAll('.stats-defect-type-checkbox:checked'))
        .map(cb => cb.value);
    selectedDefectTypes.forEach(type => params.append('defect_type[]', type));
    
    // 收集嚴重程度選擇
    const selectedSeverities = Array.from(document.querySelectorAll('.stats-severity-checkbox:checked'))
        .map(cb => cb.value);
    selectedSeverities.forEach(severity => params.append('severity[]', severity));
    
    // 收集時間範圍
    const startTime = document.getElementById('stats_start_time').value;
    const endTime = document.getElementById('stats_end_time').value;
    if (startTime) params.append('start_time', startTime);
    if (endTime) params.append('end_time', endTime);
    
    return params;
}

// 獲取基本統計資料
async function fetchBasicStats() {
    try {
        const params = getSelectedParameters();
        const response = await fetch(`/api/statistics/stats?${params}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        updateBasicStatsDisplay(data);
    } catch (error) {
        console.error('獲取基本統計資料失敗:', error);
        showError(document.querySelector('#basicStats'), '獲取統計資料失敗');
    }
}

// 獲取趨勢分析資料
async function fetchTrendStats() {
    try {
        const params = getSelectedParameters();
        const response = await fetch(`/api/statistics/trends?${params}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        updateTrendDisplay(data);
    } catch (error) {
        console.error('獲取趨勢分析資料失敗:', error);
        showError(document.querySelector('#trendStats'), '獲取趨勢資料失敗');
    }
}

// 獲取地理分布資料
async function fetchDistributionStats() {
    try {
        const params = getSelectedParameters();
        const response = await fetch(`/api/statistics/distribution?${params}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        updateDistributionDisplay(data);
    } catch (error) {
        console.error('獲取地理分布資料失敗:', error);
        showError(document.querySelector('#distributionStats'), '獲取分布資料失敗');
    }
}

// 獲取道路分析資料
async function fetchRoadAnalysis() {
    try {
        const params = getSelectedParameters();
        const response = await fetch(`/api/statistics/road-analysis?${params}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        updateRoadAnalysisDisplay(data);
    } catch (error) {
        console.error('獲取道路分析資料失敗:', error);
        showError(document.querySelector('#roadAnalysis'), '獲取道路分析資料失敗');
    }
}

// 更新所有統計資料
async function updateAllStats() {
    // 顯示載入指示器
    document.querySelector('.loading').style.display = 'flex';
    
    try {
        await Promise.all([
            fetchBasicStats(),
            fetchTrendStats(),
            fetchDistributionStats(),
            fetchRoadAnalysis()
        ]);
    } finally {
        // 隱藏載入指示器
        document.querySelector('.loading').style.display = 'none';
    }
}

// 顯示錯誤訊息
function showError(container, message) {
    container.innerHTML = `<div class="alert alert-danger">${message}</div>`;
}

// 更新基本統計資料顯示
function updateBasicStatsDisplay(data) {
    const container = document.querySelector('#basicStats');
    if (!data || !data.success) {
        showError(container, '無法載入基本統計資料');
        return;
    }
    
    const stats = data.data;
    container.innerHTML = `
        <div class="stats-card">
            <h3>基本統計資訊</h3>
            <div class="stats-content">
                <div class="stats-item">
                    <h4>總瑕疵數量</h4>
                    <p class="stats-number">${stats.total_defects}</p>
                </div>
                <div class="stats-item">
                    <h4>時間範圍</h4>
                    <p>${new Date(stats.time_range.start).toLocaleDateString()} - ${new Date(stats.time_range.end).toLocaleDateString()}</p>
                </div>
                <div class="stats-item">
                    <h4>嚴重程度分布</h4>
                    <div class="severity-distribution">
                        ${Object.entries(stats.severity_distribution).map(([severity, count]) => `
                            <div class="severity-item severity-${severity}">
                                <span class="severity-label">${getSeverityLabel(severity)}</span>
                                <span class="severity-count">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="stats-item">
                    <h4>瑕疵類型分布</h4>
                    <div class="defect-distribution">
                        ${Object.entries(stats.defect_type_distribution).map(([type, count]) => `
                            <div class="defect-item">
                                <span class="defect-label">${getDefectTypeLabel(type)}</span>
                                <span class="defect-count">${count}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 更新趨勢分析顯示
function updateTrendDisplay(data) {
    const container = document.querySelector('#trendStats');
    if (!data || !data.success) {
        showError(container, '無法載入趨勢分析資料');
        return;
    }
    
    const trends = data.data;
    // 使用 Chart.js 繪製趨勢圖表
    const ctx = document.getElementById('trendChart').getContext('2d');
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: trends.map(t => t.month),
            datasets: [
                {
                    label: '總瑕疵數量',
                    data: trends.map(t => t.total_defects),
                    borderColor: 'rgb(75, 192, 192)',
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '瑕疵數量月度趨勢'
                }
            }
        }
    });
}

// 更新地理分布顯示
function updateDistributionDisplay(data) {
    const container = document.querySelector('#distributionStats');
    if (!data || !data.success) {
        showError(container, '無法載入地理分布資料');
        return;
    }
    
    const distribution = data.data;
    container.innerHTML = `
        <div class="stats-card">
            <h3>地理分布統計</h3>
            <div class="distribution-content">
                ${Object.entries(distribution).map(([city, cityData]) => `
                    <div class="city-distribution">
                        <h4>${city}</h4>
                        <div class="district-list">
                            ${Object.entries(cityData).map(([district, stats]) => `
                                <div class="district-item">
                                    <h5>${district}</h5>
                                    <p>總數：${stats.total_defects}</p>
                                    <div class="severity-distribution">
                                        ${Object.entries(stats.severity_distribution).map(([severity, count]) => `
                                            <div class="severity-item severity-${severity}">
                                                <span class="severity-label">${getSeverityLabel(severity)}</span>
                                                <span class="severity-count">${count}</span>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// 更新道路分析顯示
function updateRoadAnalysisDisplay(data) {
    const container = document.querySelector('#roadAnalysis');
    if (!data || !data.success) {
        showError(container, '無法載入道路分析資料');
        return;
    }
    
    const analysis = data.data;
    container.innerHTML = `
        <div class="stats-card">
            <h3>道路分析</h3>
            <div class="road-analysis-content">
                <div class="top-roads">
                    <h4>瑕疵最多的道路</h4>
                    <div class="road-list">
                        ${analysis.top_roads.map(road => `
                            <div class="road-item">
                                <h5>${road.road_name}</h5>
                                <p>瑕疵數量：${road.defect_count}</p>
                                <div class="severity-distribution">
                                    ${Object.entries(road.severity_distribution).map(([severity, count]) => `
                                        <div class="severity-item severity-${severity}">
                                            <span class="severity-label">${getSeverityLabel(severity)}</span>
                                            <span class="severity-count">${count}</span>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
                <div class="hotspots">
                    <h4>嚴重程度熱點</h4>
                    <div class="hotspot-list">
                        ${analysis.hotspots.map(hotspot => `
                            <div class="hotspot-item">
                                <h5>${hotspot.location}</h5>
                                <p>嚴重程度指數：${hotspot.severity_index.toFixed(2)}</p>
                                <p>瑕疵數量：${hotspot.defect_count}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 獲取嚴重程度標籤
function getSeverityLabel(severity) {
    const labels = {
        '0': '輕微',
        '1': '中等',
        '2': '嚴重'
    };
    return labels[severity] || '未知';
}

// 獲取瑕疵類型標籤
function getDefectTypeLabel(type) {
    const labels = {
        '0': '裂縫',
        '1': '坑洞',
        '2': '車轍',
        '3': '其他'
    };
    return labels[type] || '未知';
} 