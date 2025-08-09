// llm_modal.js
// 確保 LLM 篩選 modal 開啟時，drawer 全部隱藏，並用 JS 控制 modal 動畫順序

document.addEventListener('DOMContentLoaded', function() {
    const llmFilterBtn = document.querySelector('[data-bs-target="#llmFilterModal"]');
    if (llmFilterBtn) {
        llmFilterBtn.addEventListener('click', function(e) {
            // 關閉所有 drawer
            document.querySelectorAll('.drawer-container').forEach(d => d.classList.remove('active'));
            // 用 JS 開啟 modal，確保動畫順序
            const modal = new bootstrap.Modal(document.getElementById('llmFilterModal'));
            modal.show();
            // 阻止原本的 data-bs-toggle 行為
            e.preventDefault();
        });
    }
});
