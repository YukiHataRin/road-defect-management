// 存儲完整的地理位置數據
let locationData = {};

// 本地存儲鍵名
const STORAGE_KEY = 'defectSearchHistory';

// 保存選擇到本地存儲
function saveSelectionToHistory() {
    const history = {
        cities: getSelectedValues('city-checkbox'),
        districts: getSelectedValues('district-checkbox'),
        roads: getSelectedValues('road-checkbox'),
        timestamp: new Date().toISOString()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
}

// 從本地存儲加載選擇
function loadSelectionFromHistory() {
    try {
        const historyStr = localStorage.getItem(STORAGE_KEY);
        if (!historyStr) return null;
        return JSON.parse(historyStr);
    } catch (error) {
        return null;
    }
}

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
    
    // 清除本地存儲
    localStorage.removeItem(STORAGE_KEY);
}

// 初始化選擇器
document.addEventListener('DOMContentLoaded', async () => {
    const cityCheckboxes = document.getElementById('cityCheckboxes');
    const districtCheckboxes = document.getElementById('districtCheckboxes');
    const roadCheckboxes = document.getElementById('roadCheckboxes');
    const cityAll = document.getElementById('city_all');
    const districtAll = document.getElementById('district_all');
    const roadAll = document.getElementById('road_all');
    const resetButton = document.getElementById('resetButton');

    if (!cityCheckboxes || !districtCheckboxes || !roadCheckboxes || 
        !cityAll || !districtAll || !roadAll || !resetButton) {
        return;
    }

    // 綁定重置按鈕事件
    resetButton.addEventListener('click', resetAllSelections);

    // 保存當前的URL參數
    const urlParams = new URLSearchParams(window.location.search);
    const currentCities = urlParams.getAll('city');
    const currentDistricts = urlParams.getAll('district');
    const currentRoads = urlParams.getAll('road_section');
    
    // 嘗試從歷史記錄加載
    const history = loadSelectionFromHistory();
    
    // 使用URL參數或歷史記錄中的值
    const initialCities = currentCities.length > 0 ? currentCities : (history ? history.cities : []);
    const initialDistricts = currentDistricts.length > 0 ? currentDistricts : (history ? history.districts : []);
    const initialRoads = currentRoads.length > 0 ? currentRoads : (history ? history.roads : []);

    try {
        const response = await fetch('/api/locations/list');
        if (!response.ok) {
            throw new Error(`獲取地理位置數據失敗: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.status === 'success' && data.data) {
            locationData = data.data;
            
            // 初始化城市勾選框
            const cityGrid = cityCheckboxes.querySelector('.checkbox-grid');
            Object.keys(locationData).sort().forEach(city => {
                const div = document.createElement('div');
                div.className = 'form-check';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'form-check-input city-checkbox';
                input.id = `city_${city}`;
                input.value = city;
                input.checked = initialCities.includes(city);
                
                const label = document.createElement('label');
                label.className = 'form-check-label';
                label.htmlFor = `city_${city}`;
                label.textContent = city;
                
                div.appendChild(input);
                div.appendChild(label);
                cityGrid.appendChild(div);
            });

            // 更新全選狀態
            updateAllCheckbox('city');

            // 如果有預選的城市，更新行政區
            if (initialCities.length > 0) {
                updateDistrictCheckboxes(initialCities, initialDistricts);
                
                // 如果有預選的行政區，更新道路
                if (initialDistricts.length > 0) {
                    updateRoadCheckboxes(initialCities, initialDistricts, initialRoads);
                }
            }
        } else {
            throw new Error('無效的API響應格式');
        }
    } catch (error) {
        showError(cityCheckboxes, '載入失敗');
        showError(districtCheckboxes, '載入失敗');
        showError(roadCheckboxes, '載入失敗');
    }

    // 全選勾選框事件
    cityAll.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.city-checkbox');
        checkboxes.forEach(cb => cb.checked = cityAll.checked);
        handleCitySelection();
        saveSelectionToHistory();
    });

    districtAll.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.district-checkbox');
        checkboxes.forEach(cb => cb.checked = districtAll.checked);
        handleDistrictSelection();
        saveSelectionToHistory();
    });

    roadAll.addEventListener('change', () => {
        const checkboxes = document.querySelectorAll('.road-checkbox');
        checkboxes.forEach(cb => cb.checked = roadAll.checked);
        saveSelectionToHistory();
    });

    // 城市勾選框變更事件委派
    cityCheckboxes.addEventListener('change', (e) => {
        if (e.target.classList.contains('city-checkbox')) {
            updateAllCheckbox('city');
            handleCitySelection();
            saveSelectionToHistory();
        }
    });

    // 行政區勾選框變更事件委派
    districtCheckboxes.addEventListener('change', (e) => {
        if (e.target.classList.contains('district-checkbox')) {
            updateAllCheckbox('district');
            handleDistrictSelection();
            saveSelectionToHistory();
        }
    });

    // 街道勾選框變更事件委派
    roadCheckboxes.addEventListener('change', (e) => {
        if (e.target.classList.contains('road-checkbox')) {
            updateAllCheckbox('road');
            saveSelectionToHistory();
        }
    });
});

// 顯示錯誤信息
function showError(container, message) {
    container.innerHTML = `<div class="text-danger">${message}</div>`;
}

// 更新全選勾選框狀態
function updateAllCheckbox(type) {
    const allCheckbox = document.getElementById(`${type}_all`);
    const checkboxes = document.querySelectorAll(`.${type}-checkbox`);
    const checkedCount = document.querySelectorAll(`.${type}-checkbox:checked`).length;
    
    allCheckbox.checked = checkedCount === checkboxes.length;
    allCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
}

// 獲取選中的值
function getSelectedValues(className) {
    return Array.from(document.querySelectorAll(`.${className}:checked`)).map(cb => cb.value);
}

// 處理城市選擇變更
function handleCitySelection() {
    const selectedCities = getSelectedValues('city-checkbox');
    updateDistrictCheckboxes(selectedCities);
}

// 處理行政區選擇變更
function handleDistrictSelection() {
    const selectedCities = getSelectedValues('city-checkbox');
    const selectedDistricts = getSelectedValues('district-checkbox');
    updateRoadCheckboxes(selectedCities, selectedDistricts);
}

// 更新行政區勾選框
function updateDistrictCheckboxes(cities, selectedDistricts = []) {
    const container = document.querySelector('#districtCheckboxes .checkbox-groups');
    container.innerHTML = '';
    
    if (cities.length === 0) {
        container.innerHTML = '<div class="text-muted">請先選擇城市</div>';
        document.getElementById('district_all').disabled = true;
        return;
    }
    
    // 獲取所有選中城市的行政區
    const districts = new Set();
    cities.forEach(city => {
        if (locationData[city]) {
            Object.keys(locationData[city]).forEach(district => districts.add(district));
        }
    });
    
    if (districts.size === 0) {
        container.innerHTML = '<div class="text-muted">沒有可用的行政區</div>';
        document.getElementById('district_all').disabled = true;
        return;
    }
    
    // 創建行政區勾選框
    const districtGrid = document.createElement('div');
    districtGrid.className = 'checkbox-grid';
    
    Array.from(districts).sort().forEach(district => {
        const div = document.createElement('div');
        div.className = 'form-check';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'form-check-input district-checkbox';
        input.id = `district_${district}`;
        input.value = district;
        input.checked = selectedDistricts.includes(district);
        
        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = `district_${district}`;
        label.textContent = district;
        
        div.appendChild(input);
        div.appendChild(label);
        districtGrid.appendChild(div);
    });
    
    container.appendChild(districtGrid);
    document.getElementById('district_all').disabled = false;
    updateAllCheckbox('district');
}

// 更新街道勾選框
function updateRoadCheckboxes(cities, districts, selectedRoads = []) {
    const container = document.querySelector('#roadCheckboxes .checkbox-groups');
    container.innerHTML = '';
    
    if (cities.length === 0 || districts.length === 0) {
        container.innerHTML = '<div class="text-muted">請先選擇城市和行政區</div>';
        document.getElementById('road_all').disabled = true;
        return;
    }
    
    // 獲取所有選中城市和行政區的街道
    const roads = new Set();
    cities.forEach(city => {
        if (locationData[city]) {
            districts.forEach(district => {
                if (locationData[city][district]) {
                    locationData[city][district].forEach(road => roads.add(road));
                }
            });
        }
    });
    
    if (roads.size === 0) {
        container.innerHTML = '<div class="text-muted">沒有可用的街道</div>';
        document.getElementById('road_all').disabled = true;
        return;
    }
    
    // 創建街道勾選框
    const roadGrid = document.createElement('div');
    roadGrid.className = 'checkbox-grid';
    
    Array.from(roads).sort().forEach(road => {
        const div = document.createElement('div');
        div.className = 'form-check';
        
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'form-check-input road-checkbox';
        input.id = `road_${road}`;
        input.value = road;
        input.checked = selectedRoads.includes(road);
        
        const label = document.createElement('label');
        label.className = 'form-check-label';
        label.htmlFor = `road_${road}`;
        label.textContent = road;
        
        div.appendChild(input);
        div.appendChild(label);
        roadGrid.appendChild(div);
    });
    
    container.appendChild(roadGrid);
    document.getElementById('road_all').disabled = false;
    updateAllCheckbox('road');
}

// 獲取所有唯一的城市
async function fetchCities() {
    try {
        const response = await fetch('/api/locations/cities');
        if (!response.ok) throw new Error('獲取城市列表失敗');
        
        const data = await response.json();
        if (data.status === 'success') {
            const cityCheckboxes = document.getElementById('cityCheckboxes');
            data.data.forEach(city => {
                const div = document.createElement('div');
                div.className = 'form-check';
                
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'form-check-input city-checkbox';
                input.id = `city_${city}`;
                input.value = city;
                cityCheckboxes.appendChild(div);
            });
        }
    } catch (error) {
        console.error('獲取城市列表時發生錯誤:', error);
    }
}

// 根據選擇的城市獲取行政區
async function fetchDistricts(city) {
    try {
        const response = await fetch(`/api/locations/districts?city=${encodeURIComponent(city)}`);
        if (!response.ok) throw new Error('獲取行政區列表失敗');
        
        const data = await response.json();
        if (data.status === 'success') {
            const districtSelect = document.getElementById('district');
            data.data.forEach(district => {
                const option = document.createElement('option');
                option.value = district;
                option.textContent = district;
                districtSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('獲取行政區列表時發生錯誤:', error);
    }
}

// 根據選擇的城市和行政區獲取街道
async function fetchRoads(city, district) {
    try {
        const response = await fetch(`/api/locations/roads?city=${encodeURIComponent(city)}&district=${encodeURIComponent(district)}`);
        if (!response.ok) throw new Error('獲取街道列表失敗');
        
        const data = await response.json();
        if (data.status === 'success') {
            const roadSelect = document.getElementById('road_section');
            data.data.forEach(road => {
                const option = document.createElement('option');
                option.value = road;
                option.textContent = road;
                roadSelect.appendChild(option);
            });
        }
    } catch (error) {
        console.error('獲取街道列表時發生錯誤:', error);
    }
} 