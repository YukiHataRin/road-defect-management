// 圖表實例
let severityChart = null;
let defectTypeChart = null;

// 初始化圖表
function initCharts() {
    const severityCtx = document.getElementById('severityChart').getContext('2d');
    const defectTypeCtx = document.getElementById('defectTypeChart').getContext('2d');

    // 嚴重程度圖表
    severityChart = new Chart(severityCtx, {
        type: 'pie',
        data: {
            labels: ['輕微', '中等', '嚴重'],
            datasets: [{
                data: [0, 0, 0],
                backgroundColor: [
                    'rgba(76, 175, 80, 0.8)',
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(244, 67, 54, 0.8)'
                ],
                borderColor: [
                    'rgba(76, 175, 80, 0.8)',
                    'rgba(255, 193, 7, 0.8)',
                    'rgba(244, 67, 54, 0.8)'
                ],
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            height: 300,
            plugins: {
                title: {
                    display: true,
                    text: '瑕疵嚴重程度分布',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    position: 'bottom'
                }
            }
        }
    });

    // 瑕疵類型圖表
    defectTypeChart = new Chart(defectTypeCtx, {
        type: 'bar',
        data: {
            labels: ['橫向裂紋', '縱向裂紋', '龜裂', '坑洞'],
            datasets: [{
                label: '數量',
                data: [0, 0, 0, 0],
                backgroundColor: 'rgba(54, 162, 235, 0.8)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            plugins: {
                title: {
                    display: true,
                    text: '瑕疵類型分布',
                    font: {
                        size: 16
                    }
                },
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1
                    }
                }
            }
        }
    });
}

// 更新圖表數據
function updateCharts(data) {
    // 統計數據
    const severityCounts = [0, 0, 0]; // 輕微、中等、嚴重
    const defectTypeCounts = [0, 0, 0, 0]; // 橫向裂紋、縱向裂紋、龜裂、坑洞

    // 計算統計數據
    data.forEach(defect => {
        severityCounts[defect.severity]++;
        defectTypeCounts[defect.defect_type]++;
    });

    // 更新嚴重程度圖表
    severityChart.data.datasets[0].data = severityCounts;
    severityChart.update();

    // 更新瑕疵類型圖表
    defectTypeChart.data.datasets[0].data = defectTypeCounts;
    defectTypeChart.update();
}

// 獲取統計數據
async function fetchStatsData(params = {}) {
    try {
        const searchParams = new URLSearchParams();
        
        // 獲取選中的城市
        const selectedCities = Array.from(document.querySelectorAll('.stats-city-checkbox:checked'))
            .map(cb => cb.value);
        if (selectedCities.length > 0 && !document.getElementById('stats_city_all').checked) {
            selectedCities.forEach(city => searchParams.append('city[]', city));
        }

        // 獲取選中的區域
        const selectedDistricts = Array.from(document.querySelectorAll('.stats-district-checkbox:checked'))
            .map(cb => cb.value);
        if (selectedDistricts.length > 0 && !document.getElementById('stats_district_all').checked) {
            selectedDistricts.forEach(district => searchParams.append('district[]', district));
        }

        // 獲取選中的道路
        const selectedRoads = Array.from(document.querySelectorAll('.stats-road-checkbox:checked'))
            .map(cb => cb.value);
        if (selectedRoads.length > 0 && !document.getElementById('stats_road_all').checked) {
            selectedRoads.forEach(road => searchParams.append('road_section[]', road));
        }

        // 獲取選中的瑕疵類型
        const selectedDefectTypes = Array.from(document.querySelectorAll('.stats-defect-type-checkbox:checked'))
            .map(cb => cb.value);
        if (selectedDefectTypes.length > 0 && !document.getElementById('stats_defect_type_all').checked) {
            selectedDefectTypes.forEach(type => searchParams.append('defect_type[]', type));
        }

        // 獲取選中的嚴重程度
        const selectedSeverities = Array.from(document.querySelectorAll('.stats-severity-checkbox:checked'))
            .map(cb => cb.value);
        if (selectedSeverities.length > 0 && !document.getElementById('stats_severity_all').checked) {
            selectedSeverities.forEach(severity => searchParams.append('severity[]', severity));
        }

        // 處理時間範圍
        const startTime = document.getElementById('stats_start_time').value;
        const endTime = document.getElementById('stats_end_time').value;
        
        if (startTime) {
            const startDate = new Date(startTime);
            searchParams.append('start_time', startDate.toISOString().replace('.000Z', '+00:00'));
        }
        if (endTime) {
            const endDate = new Date(endTime);
            searchParams.append('end_time', endDate.toISOString().replace('.000Z', '+00:00'));
        }

        // 顯示載入指示器
        document.querySelector('.loading').style.display = 'flex';

        // 發送統計數據請求
        const statsUrl = `/api/road-defects/stats?${searchParams.toString()}`;
        console.log('發送統計請求到:', statsUrl);

        // 發送瑕疵列表請求
        const listUrl = `/api/road-defects/list?${searchParams.toString()}`;
        console.log('發送列表請求到:', listUrl);

        try {
            // 同時發送兩個請求
            const [statsResponse, listResponse] = await Promise.all([
                fetch(statsUrl),
                fetch(listUrl)
            ]);

            if (!statsResponse.ok || !listResponse.ok) {
                throw new Error(`HTTP error! stats: ${statsResponse.status}, list: ${listResponse.status}`);
            }

            const [statsResult, listResult] = await Promise.all([
                statsResponse.json(),
                listResponse.json()
            ]);

            console.log('收到的統計數據:', statsResult);
            console.log('收到的列表數據:', listResult);
            
            if (statsResult.data && statsResult.data.status === 'success') {
                const stats = statsResult.data.data;
                
                // 更新圖表
                if (stats.severity_stats && Array.isArray(stats.severity_stats.by_severity)) {
                    console.log('嚴重程度數據:', stats.severity_stats.by_severity);
                    severityChart.data.datasets[0].data = stats.severity_stats.by_severity;
                    severityChart.update();
                }
                
                if (stats.defect_type_stats && Array.isArray(stats.defect_type_stats.by_type)) {
                    console.log('瑕疵類型數據:', stats.defect_type_stats.by_type);
                    defectTypeChart.data.datasets[0].data = stats.defect_type_stats.by_type;
                    defectTypeChart.update();
                }

                // 更新數據列表
                const defectList = document.getElementById('statsDefectList');
                if (defectList && listResult.data && Array.isArray(listResult.data.defects)) {
                    // 清空現有內容
                    defectList.innerHTML = '';
                    
                    // 添加統計摘要
                    const summaryHtml = `
                        <div class="stats-summary mb-4">
                            <div class="row" id="row_table">
                                <div class="col-md-4">
                                    <div class="stats-card">
                                        <h6>總瑕疵數量</h6>
                                        <div class="stats-number">${stats.severity_stats.total}</div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="stats-card">
                                        <h6>時間範圍</h6>
                                        <div class="stats-date">
                                            ${new Date(stats.time_range.earliest).toLocaleDateString()} - 
                                            ${new Date(stats.time_range.latest).toLocaleDateString()}
                                        </div>
                                    </div>
                                </div>
                                <div class="col-md-4">
                                    <div class="stats-card">
                                        <h6>平均嚴重程度</h6>
                                        <div class="stats-severity">
                                            ${calculateAverageSeverity(stats.severity_stats.by_severity)}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="table-container mb-4" style="max-height: 300px; margin-bottom: 10px;">
                            <div class="table-responsive" style="height: auto; max-height: 300px; overflow-y: auto;">

                            <div class="table-responsive" style="height: auto; max-height: 300px; overflow-y: auto;">
                                <table class="table table-hover">
                                    <thead>
                                        <tr>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">ID</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">瑕疵類型</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">嚴重程度</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">緯度</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">經度</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">拍攝時間</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">裝置ID</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">城市</th>
                                            <th style="position: sticky; top: 0; background: white; z-index: 1;">行政區</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${listResult.data.defects.map(defect => `
                                            <tr>
                                                <td>${defect.id}</td>
                                                <td>${getDefectTypeName(defect.defect_type.value)}</td>
                                                <td>${getSeverityName(defect.severity.value)}</td>
                                                <td>${defect.latitude.toFixed(4)}</td>
                                                <td>${defect.longitude.toFixed(4)}</td>
                                                <td>${new Date(defect.capture_time).toLocaleString()}</td>
                                                <td>${defect.device_id}</td>
                                                <td>${defect.city}</td>
                                                <td>${defect.district}</td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    `;
                    defectList.innerHTML = summaryHtml;
                }
            } else {
                console.error('數據格式無效:', statsResult);
                throw new Error('無效的數據格式');
            }
        } catch (error) {
            console.error('數據獲取失敗:', error);
            const errorMessage = error.message === 'Failed to fetch' 
                ? '無法連接到伺服器，請檢查網路連接'
                : error.message;
            alert('數據獲取失敗: ' + errorMessage);
        } finally {
            // 隱藏載入指示器
            document.querySelector('.loading').style.display = 'none';
        }
    } catch (error) {
        console.error('參數處理失敗:', error);
        alert('參數處理失敗: ' + error.message);
    }
}

// 當文檔載入完成時
document.addEventListener('DOMContentLoaded', async () => {
    // 初始化圖表
    initCharts();

    // 統計分析抽屜切換
    const statsToggle = document.getElementById('statsToggle');
    const statsDrawer = document.getElementById('statsDrawer');
    
    statsToggle.addEventListener('click', () => {
        toggleDrawer('stats');
        // 如果是第一次打開，加載初始數據
        if (!hasLoadedInitialData) {
            fetchStatsData({});
            hasLoadedInitialData = true;
        }
    });

    // 表單提交處理
    const statsForm = document.getElementById('statsForm');
    statsForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(statsForm);
        const params = {};
        
        // 處理時間格式
        if (formData.get('start_time')) {
            const startDate = new Date(formData.get('start_time'));
            params.start_time = startDate.toISOString().replace('.000Z', '+00:00');
        }
        if (formData.get('end_time')) {
            const endDate = new Date(formData.get('end_time'));
            params.end_time = endDate.toISOString().replace('.000Z', '+00:00');
        }
        
        // 添加其他參數
        if (formData.get('city')) {
            params.city = formData.get('city');
        }

        // 獲取並更新統計數據
        await fetchStatsData(params);
    });

    // 加載初始數據
    let hasLoadedInitialData = false;
    if (window.location.hash === '#stats') {
        toggleDrawer('stats');
        fetchStatsData({});
        hasLoadedInitialData = true;
    }
});

// 計算平均嚴重程度
function calculateAverageSeverity(severityData) {
    if (!Array.isArray(severityData) || severityData.length !== 3) {
        return '無法計算';
    }
    
    const total = severityData.reduce((sum, count) => sum + count, 0);
    if (total === 0) {
        return '無數據';
    }
    
    const weightedSum = severityData[0] * 1 + severityData[1] * 2 + severityData[2] * 3;
    const average = weightedSum / total;
    
    // 返回帶有一位小數的平均值
    return average.toFixed(1);
}

// 添加輔助函數用於轉換瑕疵類型和嚴重程度
function getDefectTypeName(type) {
    const types = {
        0: '橫向裂紋',
        1: '縱向裂紋',
        2: '龜裂',
        3: '坑洞'
    };
    return types[type] || '未知';
}

function getSeverityName(severity) {
    const severities = {
        0: '輕微',
        1: '中等',
        2: '嚴重'
    };
    return severities[severity] || '未知';
} 