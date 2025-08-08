document.addEventListener('DOMContentLoaded', function() {
    const generateReportBtn = document.getElementById('generate-report-btn');
    const reportContainer = document.getElementById('report-container');
    const loadingContainer = document.querySelector('.loading-container');
    const searchForm = document.getElementById('searchForm');

    // 初始化地區選擇器
    if (typeof initializeLocationSelector === 'function') {
        initializeLocationSelector();
    } else {
        console.error('initializeLocationSelector function not found. Make sure location_selector.js is loaded.');
    }

    generateReportBtn.addEventListener('click', async () => {
        // 顯示載入指示器
        loadingContainer.style.display = 'flex';
        reportContainer.innerHTML = '';

        // 收集篩選條件
        const formData = new FormData(searchForm);
        const filters = {
            city: formData.getAll('city'),
            district: formData.getAll('district'),
            road: formData.getAll('road'),
            defect_type: formData.getAll('defect_type'),
            severity: formData.getAll('severity'),
            start_time: formData.get('start_time'),
            end_time: formData.get('end_time')
        };

        try {
            const response = await fetch('/api/llm/generate-report', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getCookie('jwt_token')}`
                },
                body: JSON.stringify(filters)
            });

            const result = await response.json();

            if (response.ok && result.status === 'success') {
                // 使用 marked.js 解析 Markdown
                reportContainer.innerHTML = marked.parse(result.data.report_content);
            } else {
                reportContainer.innerHTML = `<div class="alert alert-danger">${result.message || '生成報告失敗'}</div>`;
            }
        } catch (error) {
            console.error('Error generating report:', error);
            reportContainer.innerHTML = `<div class="alert alert-danger">請求失敗，請稍後再試。</div>`;
        } finally {
            // 隱藏載入指示器
            loadingContainer.style.display = 'none';
        }
    });

    // Helper function to get cookie by name
    function getCookie(name) {
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop().split(';').shift();
    }
});
