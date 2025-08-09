// 綁定全選複選框事件
function bindLLMAllCheckbox(allCheckboxId, itemCheckboxClass) {
    const allCheckbox = document.getElementById(allCheckboxId);
    if (!allCheckbox) return;

    allCheckbox.addEventListener('change', () => {
        document.querySelectorAll(itemCheckboxClass).forEach(checkbox => {
            checkbox.checked = allCheckbox.checked;
        });
    });

    document.addEventListener('change', (event) => {
        if (event.target.matches(itemCheckboxClass)) {
            const allChecked = Array.from(document.querySelectorAll(itemCheckboxClass))
                .every(cb => cb.checked);
            allCheckbox.checked = allChecked;
        }
    });
}

// 獲取選中的值
function getSelectedLLMValues(className) {
    return Array.from(document.querySelectorAll(`.${className}:checked`)).map(cb => cb.value);
}

// 根據 URL 參數初始化表單
function initializeLLMFormWithUrlParams() {
    const urlParams = new URLSearchParams(window.location.search);
    const cities = urlParams.getAll('city');
    const defect_types = urlParams.getAll('defect_type');
    const severities = urlParams.getAll('severity');

    // 處理城市
    const llmCityCheckboxes = document.querySelectorAll('.llm-city-checkbox');
    if (cities.length > 0) {
        llmCityCheckboxes.forEach(cb => {
            cb.checked = cities.includes(cb.value);
        });
    }

    // 處理瑕疵類型
    const llmDefectTypeCheckboxes = document.querySelectorAll('.llm-defect-type-checkbox');
    if (defect_types.length > 0) {
        if (defect_types.includes('all')) {
            document.getElementById('llm_defect_type_all').checked = true;
            llmDefectTypeCheckboxes.forEach(cb => cb.checked = true);
        } else {
            llmDefectTypeCheckboxes.forEach(cb => {
                cb.checked = defect_types.includes(cb.value);
            });
            document.getElementById('llm_defect_type_all').checked = llmDefectTypeCheckboxes.length === defect_types.length;
        }
    }

    // 處理嚴重程度
    const llmSeverityCheckboxes = document.querySelectorAll('.llm-severity-checkbox');
    if (severities.length > 0) {
        if (severities.includes('all')) {
            document.getElementById('llm_severity_all').checked = true;
            llmSeverityCheckboxes.forEach(cb => cb.checked = true);
        } else {
            llmSeverityCheckboxes.forEach(cb => {
                cb.checked = severities.includes(cb.value);
            });
            document.getElementById('llm_severity_all').checked = llmSeverityCheckboxes.length === severities.length;
        }
    }
}

// 獲取所有唯一的城市列表並初始化
async function initLLMCitySelector() {
    try {
        const response = await fetch('/api/locations/cities');
        const result = await response.json();
        if (result.status === 'success' && result.data) {
            const cityContainer = document.querySelector('#llmCityCheckboxes .checkbox-grid');
            cityContainer.innerHTML = ''; // 清空現有內容

            const cities = result.data;
            cities.forEach(city => {
                const checkbox = document.createElement('div');
                checkbox.className = 'form-check';
                checkbox.innerHTML = `
                    <input type="checkbox" class="form-check-input llm-city-checkbox" id="llm_city_${city}" value="${city}">
                    <label class="form-check-label" for="llm_city_${city}">${city}</label>
                `;
                cityContainer.appendChild(checkbox);
            });
            // 綁定全選事件
            bindLLMAllCheckbox('llm_city_all', '.llm-city-checkbox');
            initializeLLMFormWithUrlParams();
        } else {
            console.error('位置資料格式錯誤:', result);
        }
    } catch (error) {
        console.error('載入城市資料失敗:', error);
    }
}

// 生成報告
async function generateReport() {
    const generateReportBtn = document.getElementById('generateReportBtn');
    const reportResult = document.getElementById('reportResult');

    const filters = {};

    const selectedCities = getSelectedLLMValues('llm-city-checkbox');
    if (selectedCities.length > 0) {
        filters['city'] = selectedCities;
    }

    const selectedDefectTypes = getSelectedLLMValues('llm-defect-type-checkbox');
    if (selectedDefectTypes.length > 0) {
        filters['defect_type'] = selectedDefectTypes.map(v => parseInt(v));
    }

    const selectedSeverities = getSelectedLLMValues('llm-severity-checkbox');
    if (selectedSeverities.length > 0) {
        filters['severity'] = selectedSeverities.map(v => parseInt(v));
    }

    try {
        // 顯示載入狀態
        generateReportBtn.disabled = true;
        generateReportBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> 正在生成報告...';
        reportResult.textContent = '正在根據您的篩選條件生成報告，這可能需要幾分鐘的時間...';

        const response = await fetch('/api/llm/generate-report', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(filters)
        });

        const result = await response.json();

        if (response.ok && result.status === 'success') {
            // 嘗試將 markdown 轉為 HTML（若有 marked.js 可用，否則直接插入）
            let content = result.data.report_content;
            if (window.marked) {
                reportResult.innerHTML = window.marked.parse(content);
            } else {
                // 若 LLM 回傳已是 HTML 或 markdown，先直接插入
                reportResult.innerHTML = content.replace(/\n/g, '<br>');
            }
        } else {
            throw new Error(result.message || '報告生成失敗');
        }
    } catch (error) {
        console.error('報告生成失敗:', error);
        reportResult.textContent = `報告生成失敗：${error.message}`;
    } finally {
        generateReportBtn.disabled = false;
        generateReportBtn.innerHTML = '<i class="bi bi-file-earmark-text"></i> 生成報告';
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const llmReportForm = document.getElementById('llmReportForm');
    if (llmReportForm) {
        llmReportForm.addEventListener('submit', (e) => {
            e.preventDefault();
            generateReport();
        });
    }

    // 初始化城市選擇器和表單
    initLLMCitySelector();
    bindLLMAllCheckbox('llm_defect_type_all', '.llm-defect-type-checkbox');
    bindLLMAllCheckbox('llm_severity_all', '.llm-severity-checkbox');
});