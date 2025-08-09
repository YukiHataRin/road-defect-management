// llm_custom_modal.js
// 控制自訂 LLM modal 顯示/隱藏

document.addEventListener('DOMContentLoaded', function() {
  const modal = document.getElementById('llmCustomModal');
  const backdrop = document.getElementById('llmCustomModalBackdrop');
  const openBtn = document.querySelector('[data-llm-custom-modal]');
  const closeBtn = document.getElementById('llmCustomModalCloseBtn');
  const cancelBtn = document.getElementById('llmCustomModalCancel');
  const applyBtn = document.getElementById('llmCustomModalApply');

  function showModal() {
    backdrop.classList.remove('hide');
    modal.classList.remove('hide');
    document.body.style.overflow = 'hidden';
  }
  function hideModal() {
    backdrop.classList.add('hide');
    modal.classList.add('hide');
    document.body.style.overflow = '';
  }
  if (openBtn) {
    openBtn.addEventListener('click', function(e) {
      e.preventDefault();
      showModal();
    });
  }
  [closeBtn, cancelBtn, backdrop].forEach(el => {
    if (el) el.addEventListener('click', hideModal);
  });
  // 套用條件時觸發報告生成並關閉 modal
  if (applyBtn) {
    applyBtn.addEventListener('click', function(e) {
      e.preventDefault();
      // 觸發原本的報告生成流程
      const llmReportForm = document.getElementById('llmReportForm');
      if (llmReportForm) {
        // 觸發 submit 事件，llm.js 會攔截並處理
        llmReportForm.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
      }
      hideModal();
    });
  }
  // ESC 鍵關閉
  document.addEventListener('keydown', function(e) {
    if (!modal.classList.contains('hide') && e.key === 'Escape') hideModal();
  });
});
