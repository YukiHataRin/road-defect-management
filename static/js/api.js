/**
 * API 請求和錯誤處理工具
 * 版本：1.0.0
 */
const api = {
  /**
   * 發送 API 請求並處理錯誤
   * @param {string} url - API 端點
   * @param {Object} options - fetch 選項
   * @returns {Promise} - 解析為 API 響應
   */
  async request(url, options = {}) {
    try {
      // 設置默認標頭
      const headers = {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers
      };
      
      // 發送請求
      const response = await fetch(url, {
        ...options,
        headers
      });
      
      // 檢查 HTTP 錯誤
      if (!response.ok) {
        // 嘗試解析 JSON 錯誤訊息
        try {
          const errorData = await response.json();
          throw new Error(errorData.message || `HTTP 錯誤 ${response.status}`);
        } catch (e) {
          throw new Error(`HTTP 錯誤 ${response.status}: ${response.statusText}`);
        }
      }
      
      // 如果請求成功，解析 JSON 響應
      // 註：如果預期響應不是 JSON 格式，應該由調用者處理
      return await response.json();
    } catch (error) {
      // 顯示錯誤訊息
      this.showError(error.message);
      
      // 重新拋出錯誤以便調用者可以處理
      throw error;
    }
  },
  
  /**
   * 顯示錯誤訊息
   * @param {string} message - 錯誤訊息
   * @param {number} duration - 訊息顯示時間（毫秒），默認 5000
   */
  showError(message, duration = 5000) {
    const errorContainer = document.getElementById('ajax-error-container');
    if (!errorContainer) return;
    
    // 創建錯誤提示
    const alertElement = document.createElement('div');
    alertElement.className = 'alert alert-danger alert-dismissible fade show';
    alertElement.setAttribute('role', 'alert');
    
    alertElement.innerHTML = `
      <i class="bi bi-exclamation-triangle-fill me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="關閉"></button>
    `;
    
    // 添加到容器
    errorContainer.appendChild(alertElement);
    
    // 設置自動關閉
    setTimeout(() => {
      alertElement.classList.remove('show');
      setTimeout(() => {
        if (errorContainer.contains(alertElement)) {
          errorContainer.removeChild(alertElement);
        }
      }, 150);
    }, duration);
  },
  
  /**
   * 顯示成功訊息
   * @param {string} message - 成功訊息
   * @param {number} duration - 訊息顯示時間（毫秒），默認 3000
   */
  showSuccess(message, duration = 3000) {
    const errorContainer = document.getElementById('ajax-error-container');
    if (!errorContainer) return;
    
    // 創建成功提示
    const alertElement = document.createElement('div');
    alertElement.className = 'alert alert-success alert-dismissible fade show';
    alertElement.setAttribute('role', 'alert');
    
    alertElement.innerHTML = `
      <i class="bi bi-check-circle-fill me-2"></i>
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="關閉"></button>
    `;
    
    // 添加到容器
    errorContainer.appendChild(alertElement);
    
    // 設置自動關閉
    setTimeout(() => {
      alertElement.classList.remove('show');
      setTimeout(() => {
        if (errorContainer.contains(alertElement)) {
          errorContainer.removeChild(alertElement);
        }
      }, 150);
    }, duration);
  },
  
  /**
   * GET 請求快捷方式
   * @param {string} url - API 端點
   * @param {Object} params - URL 參數
   * @returns {Promise} - 解析為 API 響應
   */
  async get(url, params = {}) {
    // 構建 URL 參數
    const queryParams = new URLSearchParams();
    for (const key in params) {
      if (params[key] !== undefined && params[key] !== null) {
        queryParams.append(key, params[key]);
      }
    }
    
    const queryString = queryParams.toString();
    const fullUrl = queryString ? `${url}?${queryString}` : url;
    
    return this.request(fullUrl, { method: 'GET' });
  },
  
  /**
   * 帶分頁的 GET 請求
   * @param {string} url - API 端點
   * @param {Object} params - URL 參數
   * @param {number} page - 頁碼，從 1 開始
   * @param {number} pageSize - 每頁數量
   * @returns {Promise} - 解析為帶分頁信息的響應
   */
  async getPage(url, params = {}, page = 1, pageSize = 10) {
    // 添加分頁參數
    const paginationParams = {
      ...params,
      page: page,
      page_size: pageSize
    };
    
    const response = await this.get(url, paginationParams);
    
    // 標準化分頁響應
    return this.normalizePaginationResponse(response, page, pageSize);
  },
  
  /**
   * 標準化不同格式的分頁響應
   * @param {Object} response - API 響應
   * @param {number} currentPage - 當前頁碼
   * @param {number} pageSize - 每頁數量
   * @returns {Object} - 標準化後的分頁響應
   */
  normalizePaginationResponse(response, currentPage, pageSize) {
    // 默認標準化響應
    const normalized = {
      items: [],
      pagination: {
        currentPage: currentPage,
        pageSize: pageSize,
        totalItems: 0,
        totalPages: 0,
        hasNext: false,
        hasPrev: currentPage > 1
      }
    };
    
    // 處理不同的 API 響應格式
    if (response) {
      // 情況 1: {data: [...], meta: {page, page_size, total}}
      if (response.data && response.meta) {
        normalized.items = response.data;
        const meta = response.meta;
        normalized.pagination.totalItems = meta.total || 0;
        normalized.pagination.currentPage = meta.page || currentPage;
        normalized.pagination.pageSize = meta.page_size || pageSize;
        normalized.pagination.totalPages = Math.ceil(normalized.pagination.totalItems / normalized.pagination.pageSize);
        normalized.pagination.hasNext = normalized.pagination.currentPage < normalized.pagination.totalPages;
      }
      // 情況 2: {data: [...], total_count: X, page: Y, page_size: Z}
      else if (response.data && 'total_count' in response) {
        normalized.items = response.data;
        normalized.pagination.totalItems = response.total_count || 0;
        normalized.pagination.currentPage = response.page || currentPage;
        normalized.pagination.pageSize = response.page_size || pageSize;
        normalized.pagination.totalPages = Math.ceil(normalized.pagination.totalItems / normalized.pagination.pageSize);
        normalized.pagination.hasNext = normalized.pagination.currentPage < normalized.pagination.totalPages;
      }
      // 情況 3: {items: [...], pagination: {...}}
      else if (response.items && response.pagination) {
        normalized.items = response.items;
        normalized.pagination = {
          ...normalized.pagination,
          ...response.pagination
        };
      }
      // 情況 4: 數組響應，無分頁信息
      else if (Array.isArray(response)) {
        normalized.items = response;
        normalized.pagination.totalItems = response.length;
        normalized.pagination.totalPages = 1;
        normalized.pagination.hasNext = false;
      }
      // 情況 5: {data: [...]} 僅含數據數組，無分頁信息
      else if (response.data && Array.isArray(response.data)) {
        normalized.items = response.data;
        normalized.pagination.totalItems = response.data.length;
        // 檢查 X-Total-Count 標頭
        const totalCount = response.headers?.get?.('X-Total-Count');
        if (totalCount) {
          const total = parseInt(totalCount, 10);
          if (!isNaN(total)) {
            normalized.pagination.totalItems = total;
            normalized.pagination.totalPages = Math.ceil(total / pageSize);
            normalized.pagination.hasNext = currentPage * pageSize < total;
          }
        }
      }
    }
    
    return normalized;
  },
  
  /**
   * 生成分頁 HTML 元素
   * @param {Object} pagination - 分頁信息
   * @param {Function} onClick - 點擊頁碼的回調函數
   * @param {string} containerClass - 容器額外的 CSS 類
   * @returns {HTMLElement} - 分頁導航元素
   */
  createPaginationElement(pagination, onClick, containerClass = '') {
    const { currentPage, totalPages } = pagination;
    
    // 創建分頁容器
    const nav = document.createElement('nav');
    nav.setAttribute('aria-label', '分頁導航');
    if (containerClass) {
      nav.className = containerClass;
    }
    
    // 如果只有一頁，不顯示分頁
    if (totalPages <= 1) {
      return nav;
    }
    
    const ul = document.createElement('ul');
    ul.className = 'pagination';
    
    // 上一頁按鈕
    const prevLi = document.createElement('li');
    prevLi.className = `page-item ${currentPage <= 1 ? 'disabled' : ''}`;
    const prevA = document.createElement('a');
    prevA.className = 'page-link';
    prevA.href = '#';
    prevA.setAttribute('aria-label', '上一頁');
    prevA.innerHTML = '<span aria-hidden="true">&laquo;</span>';
    if (currentPage > 1) {
      prevA.addEventListener('click', (e) => {
        e.preventDefault();
        onClick(currentPage - 1);
      });
    }
    prevLi.appendChild(prevA);
    ul.appendChild(prevLi);
    
    // 頁碼按鈕
    const maxPageButtons = 5; // 最多顯示的頁碼按鈕數
    let startPage = Math.max(1, currentPage - Math.floor(maxPageButtons / 2));
    const endPage = Math.min(totalPages, startPage + maxPageButtons - 1);
    startPage = Math.max(1, endPage - maxPageButtons + 1);
    
    // 如果起始頁不是 1，顯示第一頁和省略號
    if (startPage > 1) {
      const firstLi = document.createElement('li');
      firstLi.className = 'page-item';
      const firstA = document.createElement('a');
      firstA.className = 'page-link';
      firstA.href = '#';
      firstA.textContent = '1';
      firstA.addEventListener('click', (e) => {
        e.preventDefault();
        onClick(1);
      });
      firstLi.appendChild(firstA);
      ul.appendChild(firstLi);
      
      if (startPage > 2) {
        const ellipsisLi = document.createElement('li');
        ellipsisLi.className = 'page-item disabled';
        const ellipsisSpan = document.createElement('span');
        ellipsisSpan.className = 'page-link';
        ellipsisSpan.innerHTML = '&hellip;';
        ellipsisLi.appendChild(ellipsisSpan);
        ul.appendChild(ellipsisLi);
      }
    }
    
    // 頁碼按鈕
    for (let i = startPage; i <= endPage; i++) {
      const pageLi = document.createElement('li');
      pageLi.className = `page-item ${i === currentPage ? 'active' : ''}`;
      const pageA = document.createElement('a');
      pageA.className = 'page-link';
      pageA.href = '#';
      pageA.textContent = i.toString();
      if (i === currentPage) {
        pageA.setAttribute('aria-current', 'page');
      } else {
        pageA.addEventListener('click', (e) => {
          e.preventDefault();
          onClick(i);
        });
      }
      pageLi.appendChild(pageA);
      ul.appendChild(pageLi);
    }
    
    // 如果結束頁不是最後一頁，顯示省略號和最後一頁
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        const ellipsisLi = document.createElement('li');
        ellipsisLi.className = 'page-item disabled';
        const ellipsisSpan = document.createElement('span');
        ellipsisSpan.className = 'page-link';
        ellipsisSpan.innerHTML = '&hellip;';
        ellipsisLi.appendChild(ellipsisSpan);
        ul.appendChild(ellipsisLi);
      }
      
      const lastLi = document.createElement('li');
      lastLi.className = 'page-item';
      const lastA = document.createElement('a');
      lastA.className = 'page-link';
      lastA.href = '#';
      lastA.textContent = totalPages.toString();
      lastA.addEventListener('click', (e) => {
        e.preventDefault();
        onClick(totalPages);
      });
      lastLi.appendChild(lastA);
      ul.appendChild(lastLi);
    }
    
    // 下一頁按鈕
    const nextLi = document.createElement('li');
    nextLi.className = `page-item ${currentPage >= totalPages ? 'disabled' : ''}`;
    const nextA = document.createElement('a');
    nextA.className = 'page-link';
    nextA.href = '#';
    nextA.setAttribute('aria-label', '下一頁');
    nextA.innerHTML = '<span aria-hidden="true">&raquo;</span>';
    if (currentPage < totalPages) {
      nextA.addEventListener('click', (e) => {
        e.preventDefault();
        onClick(currentPage + 1);
      });
    }
    nextLi.appendChild(nextA);
    ul.appendChild(nextLi);
    
    nav.appendChild(ul);
    return nav;
  },
  
  /**
   * 設置無限滾動加載
   * @param {HTMLElement} container - 內容容器元素
   * @param {Function} loadMoreCallback - 加載更多內容的回調函數
   * @param {Object} options - 配置選項
   * @returns {Object} - 控制物件，包含停止監聽方法
   */
  setupInfiniteScroll(container, loadMoreCallback, options = {}) {
    const defaults = {
      threshold: 100, // 距離底部多少像素時觸發加載
      loadingText: '正在載入更多...',
      noMoreText: '沒有更多內容了',
      debounceMs: 200
    };
    
    const settings = { ...defaults, ...options };
    let isLoading = false;
    let hasMore = true;
    let debounceTimer = null;
    
    // 創建加載指示器
    const loadingIndicator = document.createElement('div');
    loadingIndicator.className = 'text-center mt-3 mb-3 d-none';
    loadingIndicator.innerHTML = `
      <div class="spinner-border spinner-border-sm text-primary me-2" role="status">
        <span class="visually-hidden">正在載入...</span>
      </div>
      <span>${settings.loadingText}</span>
    `;
    container.appendChild(loadingIndicator);
    
    // 創建無更多內容指示器
    const noMoreIndicator = document.createElement('div');
    noMoreIndicator.className = 'text-center text-muted mt-3 mb-3 d-none';
    noMoreIndicator.textContent = settings.noMoreText;
    container.appendChild(noMoreIndicator);
    
    // 滾動處理函數
    const handleScroll = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      
      debounceTimer = setTimeout(() => {
        if (isLoading || !hasMore) return;
        
        const scrollPosition = window.innerHeight + window.scrollY;
        const threshold = document.body.offsetHeight - settings.threshold;
        
        if (scrollPosition >= threshold) {
          isLoading = true;
          loadingIndicator.classList.remove('d-none');
          
          // 調用加載更多回調
          loadMoreCallback()
            .then(response => {
              isLoading = false;
              loadingIndicator.classList.add('d-none');
              
              // 檢查是否還有更多內容
              if (response && response.pagination) {
                hasMore = response.pagination.hasNext;
                if (!hasMore) {
                  noMoreIndicator.classList.remove('d-none');
                }
              } else {
                // 如果響應中沒有分頁信息，假設沒有更多內容
                hasMore = false;
                noMoreIndicator.classList.remove('d-none');
              }
            })
            .catch(error => {
              console.error('加載更多內容時出錯:', error);
              isLoading = false;
              loadingIndicator.classList.add('d-none');
            });
        }
      }, settings.debounceMs);
    };
    
    // 添加滾動事件監聽器
    window.addEventListener('scroll', handleScroll);
    
    // 返回控制對象
    return {
      stop() {
        window.removeEventListener('scroll', handleScroll);
        if (loadingIndicator.parentNode) {
          loadingIndicator.parentNode.removeChild(loadingIndicator);
        }
        if (noMoreIndicator.parentNode) {
          noMoreIndicator.parentNode.removeChild(noMoreIndicator);
        }
      },
      reset() {
        isLoading = false;
        hasMore = true;
        loadingIndicator.classList.add('d-none');
        noMoreIndicator.classList.add('d-none');
      },
      setHasMore(value) {
        hasMore = Boolean(value);
        if (!hasMore) {
          noMoreIndicator.classList.remove('d-none');
        } else {
          noMoreIndicator.classList.add('d-none');
        }
      }
    };
  },
  
  /**
   * POST 請求快捷方式
   * @param {string} url - API 端點
   * @param {Object} data - 請求數據
   * @returns {Promise} - 解析為 API 響應
   */
  async post(url, data = {}) {
    return this.request(url, {
      method: 'POST',
      body: JSON.stringify(data)
    });
  },
  
  /**
   * PUT 請求快捷方式
   * @param {string} url - API 端點
   * @param {Object} data - 請求數據
   * @returns {Promise} - 解析為 API 響應
   */
  async put(url, data = {}) {
    return this.request(url, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  },
  
  /**
   * DELETE 請求快捷方式
   * @param {string} url - API 端點
   * @returns {Promise} - 解析為 API 響應
   */
  async delete(url) {
    return this.request(url, {
      method: 'DELETE'
    });
  }
};

// 確保在 DOM 載入完成後初始化
document.addEventListener('DOMContentLoaded', () => {
  console.log('API 工具已初始化');
}); 