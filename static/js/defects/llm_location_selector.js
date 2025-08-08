// llm_location_selector.js
// 讓 llm drawer 的城市、行政區、街道篩選互動與搜尋表單一致

let llmLocationData = {};

document.addEventListener('DOMContentLoaded', async () => {
    const cityBox = document.getElementById('llmCityCheckboxes');
    const districtBox = document.getElementById('llmDistrictCheckboxes');
    const roadBox = document.getElementById('llmRoadCheckboxes');
    const cityAll = document.getElementById('llm_city_all');
    const districtAll = document.getElementById('llm_district_all');
    const roadAll = document.getElementById('llm_road_all');

    if (!cityBox || !districtBox || !roadBox || !cityAll || !districtAll || !roadAll) return;

    // 初始化城市
    try {
        const response = await fetch('/api/locations/list');
        const data = await response.json();
        if (data.status === 'success' && data.data) {
            llmLocationData = data.data;
            const cityGrid = cityBox.querySelector('.checkbox-grid');
            cityGrid.innerHTML = '';
            Object.keys(llmLocationData).sort().forEach(city => {
                const div = document.createElement('div');
                div.className = 'form-check';
                const input = document.createElement('input');
                input.type = 'checkbox';
                input.className = 'form-check-input llm-city-checkbox';
                input.id = `llm_city_${city}`;
                input.value = city;
                const label = document.createElement('label');
                label.className = 'form-check-label';
                label.htmlFor = `llm_city_${city}`;
                label.textContent = city;
                div.appendChild(input);
                div.appendChild(label);
                cityGrid.appendChild(div);
            });
        }
    } catch (e) {
        cityBox.querySelector('.checkbox-grid').innerHTML = '<div class="text-danger">載入失敗</div>';
    }

    // 全選城市
    cityAll.addEventListener('change', () => {
        cityBox.querySelectorAll('.llm-city-checkbox').forEach(cb => cb.checked = cityAll.checked);
        handleCityChange();
    });
    // 城市變更
    cityBox.addEventListener('change', (e) => {
        if (e.target.classList.contains('llm-city-checkbox')) {
            updateAllCheckbox('llm-city-checkbox', cityAll);
            handleCityChange();
        }
    });

    // 全選行政區
    districtAll.addEventListener('change', () => {
        districtBox.querySelectorAll('.llm-district-checkbox').forEach(cb => cb.checked = districtAll.checked);
        handleDistrictChange();
    });
    // 行政區變更
    districtBox.addEventListener('change', (e) => {
        if (e.target.classList.contains('llm-district-checkbox')) {
            updateAllCheckbox('llm-district-checkbox', districtAll);
            handleDistrictChange();
        }
    });

    // 全選街道
    roadAll.addEventListener('change', () => {
        roadBox.querySelectorAll('.llm-road-checkbox').forEach(cb => cb.checked = roadAll.checked);
    });
    roadBox.addEventListener('change', (e) => {
        if (e.target.classList.contains('llm-road-checkbox')) {
            updateAllCheckbox('llm-road-checkbox', roadAll);
        }
    });

    // 初始化行政區
    function handleCityChange() {
        const selectedCities = Array.from(cityBox.querySelectorAll('.llm-city-checkbox:checked')).map(cb => cb.value);
        const districtGroups = districtBox.querySelector('.checkbox-groups');
        districtGroups.innerHTML = '';
        if (selectedCities.length === 0) {
            districtGroups.innerHTML = '<div class="text-muted">請先選擇城市</div>';
            districtAll.disabled = true;
            return;
        }
        const districts = new Set();
        selectedCities.forEach(city => {
            if (llmLocationData[city]) {
                Object.keys(llmLocationData[city]).forEach(d => districts.add(d));
            }
        });
        if (districts.size === 0) {
            districtGroups.innerHTML = '<div class="text-muted">沒有可用的行政區</div>';
            districtAll.disabled = true;
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'checkbox-grid';
        Array.from(districts).sort().forEach(district => {
            const div = document.createElement('div');
            div.className = 'form-check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-check-input llm-district-checkbox';
            input.id = `llm_district_${district}`;
            input.value = district;
            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = `llm_district_${district}`;
            label.textContent = district;
            div.appendChild(input);
            div.appendChild(label);
            grid.appendChild(div);
        });
        districtGroups.appendChild(grid);
        districtAll.disabled = false;
        updateAllCheckbox('llm-district-checkbox', districtAll);
        handleDistrictChange();
    }
    // 初始化街道
    function handleDistrictChange() {
        const selectedCities = Array.from(cityBox.querySelectorAll('.llm-city-checkbox:checked')).map(cb => cb.value);
        const selectedDistricts = Array.from(districtBox.querySelectorAll('.llm-district-checkbox:checked')).map(cb => cb.value);
        const roadGroups = roadBox.querySelector('.checkbox-groups');
        roadGroups.innerHTML = '';
        if (selectedCities.length === 0 || selectedDistricts.length === 0) {
            roadGroups.innerHTML = '<div class="text-muted">請先選擇城市和行政區</div>';
            roadAll.disabled = true;
            return;
        }
        const roads = new Set();
        selectedCities.forEach(city => {
            if (llmLocationData[city]) {
                selectedDistricts.forEach(district => {
                    if (llmLocationData[city][district]) {
                        llmLocationData[city][district].forEach(road => roads.add(road));
                    }
                });
            }
        });
        if (roads.size === 0) {
            roadGroups.innerHTML = '<div class="text-muted">沒有可用的街道</div>';
            roadAll.disabled = true;
            return;
        }
        const grid = document.createElement('div');
        grid.className = 'checkbox-grid';
        Array.from(roads).sort().forEach(road => {
            const div = document.createElement('div');
            div.className = 'form-check';
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.className = 'form-check-input llm-road-checkbox';
            input.id = `llm_road_${road}`;
            input.value = road;
            const label = document.createElement('label');
            label.className = 'form-check-label';
            label.htmlFor = `llm_road_${road}`;
            label.textContent = road;
            div.appendChild(input);
            div.appendChild(label);
            grid.appendChild(div);
        });
        roadGroups.appendChild(grid);
        roadAll.disabled = false;
        updateAllCheckbox('llm-road-checkbox', roadAll);
    }
    // 全選狀態同步
    function updateAllCheckbox(className, allCheckbox) {
        const checkboxes = document.querySelectorAll('.' + className);
        const checkedCount = document.querySelectorAll('.' + className + ':checked').length;
        allCheckbox.checked = checkedCount === checkboxes.length && checkboxes.length > 0;
        allCheckbox.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
    }

    // 預設全選嚴重程度
    document.getElementById('llm_severity_all').checked = true;
    document.querySelectorAll('.llm-severity-checkbox').forEach(cb => cb.checked = true);
    document.getElementById('llm_defect_type_all').checked = true;
    document.querySelectorAll('.llm-defect-type-checkbox').forEach(cb => cb.checked = true);
});
