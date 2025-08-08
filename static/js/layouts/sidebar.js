// sidebar.js
// 處理 sidebar drawer 切換與 LLM 導航

document.addEventListener('DOMContentLoaded', function() {
    const drawerToggles = document.querySelectorAll('.nav-link[data-drawer]');
    drawerToggles.forEach(toggle => {
        toggle.addEventListener('click', function(e) {
            e.preventDefault();
            const drawer = this.getAttribute('data-drawer');
            // 關閉所有 drawer
            document.querySelectorAll('.drawer-container').forEach(d => d.classList.remove('active'));
            // 移除所有 sidebar active 樣式
            drawerToggles.forEach(t => t.classList.remove('active'));
            // 開啟對應 drawer
            if (drawer) {
                const drawerEl = document.getElementById(drawer + 'Drawer');
                if (drawerEl) drawerEl.classList.add('active');
                this.classList.add('active');
            }
            // 額外：llmDrawer 時隱藏地圖
            const mapContainer = document.getElementById('mapContainer');
            if (drawer === 'llm' && mapContainer) {
                mapContainer.style.display = 'none';
            } else if (mapContainer) {
                mapContainer.style.display = '';
            }
        });
    });
});
