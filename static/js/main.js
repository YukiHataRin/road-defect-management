/**
 * 主要 JavaScript 功能
 * 版本：1.0.0
 */

// 全局應用對象
const app = {
  /**
   * 初始化應用
   */
  init() {
    console.log('應用初始化 - 版本:', window.APP_VERSION || '開發版');
    this.setupEventListeners();
  },
  
  /**
   * 設置事件監聽器
   */
  setupEventListeners() {
    // 為所有帶有 data-confirm 屬性的元素添加確認對話框
    document.querySelectorAll('[data-confirm]').forEach(element => {
      element.addEventListener('click', (event) => {
        const message = element.getAttribute('data-confirm');
        if (message && !confirm(message)) {
          event.preventDefault();
        }
      });
    });
    
    // 初始化工具提示
    this.initTooltips();
  },
  
  /**
   * 初始化 Bootstrap 工具提示
   */
  initTooltips() {
    // 檢查 Bootstrap 是否可用
    if (typeof bootstrap !== 'undefined' && bootstrap.Tooltip) {
      const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
      tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
      });
    }
  }
};

// 在 DOM 內容加載完成後初始化應用
document.addEventListener('DOMContentLoaded', () => {
  app.init();
}); 