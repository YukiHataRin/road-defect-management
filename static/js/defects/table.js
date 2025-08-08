// 圖片緩存
// 使用全局變數以便與 home.js 共享
if (typeof window.imageCache === 'undefined') {
    window.imageCache = new Map();
}
// 直接使用 window.imageCache，避免重複聲明局部變數

// 初始化 Intersection Observer
document.addEventListener('DOMContentLoaded', () => {
    const imageObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const img = entry.target;
                if (img && img.dataset.src) {
                    loadImage(img).catch(error => {
                        console.error('圖片載入失敗:', error);
                    });
                }
                observer.unobserve(img);
            }
        });
    }, {
        root: null,
        rootMargin: '50px',
        threshold: 0.1
    });

    // 觀察所有懶加載圖片
    document.querySelectorAll('img.lazy').forEach(img => {
        if (img) {
            imageObserver.observe(img);
        }
    });
});

// 加載圖片
async function loadImage(img) {
    if (!img || !img.dataset || !img.dataset.src) {
        throw new Error('無效的圖片元素或來源');
    }

    const src = img.dataset.src;
    const container = img.closest('.defect-image-container');
    const placeholder = container ? container.querySelector('.image-placeholder') : null;

    try {
        // 檢查緩存
        if (window.imageCache.has(src)) {
            img.src = window.imageCache.get(src);
            img.classList.add('loaded');
            if (placeholder) {
                placeholder.style.opacity = '0';
            }
            return;
        }

        // 加載圖片
        const response = await fetch(src, {
            headers: {
                'Accept': 'image/*'
            },
            credentials: 'include',
            mode: 'cors'
        });

        if (!response.ok) {
            if (response.status === 404) {
                throw new Error('圖片不存在');
            }
            throw new Error(`圖片載入失敗: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        // 存入緩存
        window.imageCache.set(src, objectUrl);

        // 顯示圖片
        img.src = objectUrl;
        img.classList.add('loaded');
        if (placeholder) {
            placeholder.style.opacity = '0';
        }

    } catch (error) {
        console.error('圖片載入失敗:', error);
        if (container) {
            container.innerHTML = `
                <div class="no-image">
                    <i class="fas fa-exclamation-triangle text-danger"></i>
                    <span>${error.message === '圖片不存在' ? '圖片不存在' : '載入失敗'}</span>
                </div>
            `;
        }
        
        // 從緩存中移除失敗的圖片
        if (window.imageCache.has(src)) {
            URL.revokeObjectURL(window.imageCache.get(src));
            window.imageCache.delete(src);
        }
        
        throw error;
    }
}

// 將函數導出到全局窗口對象以便與 home.js 共享
window.loadImage = loadImage;

// 重新整理列表
function refreshList() {
    // 清除圖片緩存
    window.imageCache.forEach(url => URL.revokeObjectURL(url));
    window.imageCache.clear();
    
    // 顯示載入指示器
    document.querySelector('.loading').style.display = 'flex';
    
    // 重新載入頁面
    window.location.reload();
}

// 編輯瑕疵
function editDefect(id) {
    // TODO: 實現編輯功能
    alert('編輯瑕疵 ID: ' + id);
}

// 更新狀態
function updateStatus(id) {
    // TODO: 實現狀態更新功能
    alert('更新瑕疵 ID: ' + id + ' 的狀態');
}

// 圖片預覽功能
async function showImagePreview(src) {
    if (!src) {
        console.error('無效的圖片來源');
        return;
    }

    const modal = document.querySelector('.image-preview-modal');
    if (!modal) {
        // 如果找不到模態框，創建一個
        createImagePreviewModal();
        return showImagePreview(src); // 遞迴調用，但這次應該能找到模態框
    }
    
    const modalImg = modal.querySelector('img');
    if (!modalImg) {
        console.error('找不到模態框中的圖片元素');
        return;
    }
    
    modal.style.display = 'flex';
    modalImg.classList.remove('loaded');
    modalImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'; // 清空圖片

    try {
        // 檢查緩存
        if (window.imageCache.has(src)) {
            modalImg.src = window.imageCache.get(src);
            modalImg.classList.add('loaded');
            return;
        }

        // 加載圖片
        const response = await fetch(src, {
            headers: {
                'Accept': 'image/*'
            },
            credentials: 'include',
            mode: 'cors'
        });

        if (!response.ok) {
            throw new Error(`圖片載入失敗: ${response.status}`);
        }

        const blob = await response.blob();
        const objectUrl = URL.createObjectURL(blob);

        // 存入緩存
        window.imageCache.set(src, objectUrl);

        // 顯示圖片
        modalImg.src = objectUrl;
        modalImg.classList.add('loaded');

    } catch (error) {
        console.error('圖片載入失敗:', error);
        hideImagePreview();
        showError('圖片載入失敗：' + error.message);
    }
}

// 創建圖片預覽模態框
function createImagePreviewModal() {
    const modal = document.createElement('div');
    modal.className = 'image-preview-modal';
    modal.style.cssText = 'display: none; position: fixed; z-index: 1050; left: 0; top: 0; width: 100%; height: 100%; overflow: auto; background-color: rgba(0,0,0,0.9); justify-content: center; align-items: center;';
    
    modal.innerHTML = `
        <img class="modal-image" src="" alt="圖片預覽" style="max-width: 90%; max-height: 90%; display: block; margin: auto;">
    `;
    
    // 點擊背景關閉
    modal.addEventListener('click', hideImagePreview);
    
    // 阻止圖片點擊事件冒泡
    const img = modal.querySelector('img');
    if (img) {
        img.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
    
    document.body.appendChild(modal);
    return modal;
}

// 將函數導出到全局窗口對象
window.showImagePreview = showImagePreview;

// 隱藏圖片預覽
function hideImagePreview() {
    const modal = document.querySelector('.image-preview-modal');
    if (!modal) return;
    
    const modalImg = modal.querySelector('img');
    if (modalImg) {
        modalImg.classList.remove('loaded');
        modalImg.src = '';
    }
    modal.style.display = 'none';
}

// 公開為全局函數
window.hideImagePreview = hideImagePreview;

// 顯示錯誤訊息
function showError(message) {
    console.error(message);
    alert(message);
}

// 查看詳情
function viewDetails(id) {
    if (!id) {
        console.error('無效的瑕疵 ID');
        return;
    }
    window.location.href = `${window.BASE_PATH || ''}/defects/detail/${id}`;
}

// 公開為全局函數
window.viewDetails = viewDetails;

// 事件綁定
document.addEventListener('DOMContentLoaded', function() {
    // 阻止模態框圖片點擊事件冒泡
    const modalImg = document.querySelector('.image-preview-modal img');
    if (modalImg) {
        modalImg.addEventListener('click', function(e) {
            e.stopPropagation();
        });
    }
}); 