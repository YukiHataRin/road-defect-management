// API 端點
const API_BASE_URL = 'http://127.0.0.1:5002/api/v1';

// 等待 DOM 完全載入
document.addEventListener('DOMContentLoaded', function() {
    // 初始化新增瑕疵模態框
    const addDefectModal = new bootstrap.Modal(document.getElementById('addDefectModal'));
    
    // 點擊新增瑕疵按鈕時顯示模態框
    document.getElementById('addDefectToggle').addEventListener('click', () => {
        addDefectModal.show();
    });

    // 在地圖上點擊時自動填入經緯度
    if (typeof map !== 'undefined') {
        map.on('click', (e) => {
            if (document.getElementById('addDefectModal').classList.contains('show')) {
                document.getElementById('newLatitude').value = e.latlng.lat.toFixed(6);
                document.getElementById('newLongitude').value = e.latlng.lng.toFixed(6);
            }
        });
    }

    // 單筆圖片預覽功能
    document.getElementById('newImage').addEventListener('change', function(e) {
        const file = e.target.files[0];
        const previewContainer = document.getElementById('imagePreviewContainer');
        const preview = document.getElementById('imagePreview');
        
        if (file) {
            // 檢查檔案大小
            if (file.size > 10 * 1024 * 1024) { // 10MB
                showError('圖片大小不能超過 10MB');
                this.value = '';
                previewContainer.style.display = 'none';
                return;
            }
            
            // 檢查檔案類型
            if (!file.type.match('image/(jpeg|png)')) {
                showError('只支援 JPG 和 PNG 格式的圖片');
                this.value = '';
                previewContainer.style.display = 'none';
                return;
            }

            // 顯示圖片預覽
            const reader = new FileReader();
            reader.onloadend = () => {
                preview.src = reader.result;
                previewContainer.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            preview.src = '';
            previewContainer.style.display = 'none';
        }
    });

    // 批量圖片預覽功能
    document.getElementById('imageFiles').addEventListener('change', function(e) {
        const files = Array.from(e.target.files);
        const container = document.getElementById('batchPreviewContainer');
        container.innerHTML = ''; // 清空現有預覽

        files.forEach((file, index) => {
            // 檢查檔案大小和類型
            if (file.size > 10 * 1024 * 1024) {
                showError(`圖片 ${file.name} 大小超過 10MB`);
                return;
            }
            if (!file.type.match('image/(jpeg|png)')) {
                showError(`圖片 ${file.name} 格式不支援`);
                return;
            }

            // 創建預覽元素
            const col = document.createElement('div');
            col.className = 'col-md-4';
            col.innerHTML = `
                <div class="card">
                    <img src="" alt="${file.name}" class="card-img-top" style="height: 150px; object-fit: cover;">
                    <div class="card-body">
                        <p class="card-text small text-truncate">${file.name}</p>
                    </div>
                </div>
            `;

            // 讀取並顯示圖片
            const reader = new FileReader();
            reader.onloadend = () => {
                col.querySelector('img').src = reader.result;
            };
            reader.readAsDataURL(file);

            container.appendChild(col);
        });
    });

    // JSON 檔案預覽功能
    document.getElementById('jsonFile').addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);
            
            // 驗證 JSON 格式
            if (!data.defects || !Array.isArray(data.defects)) {
                throw new Error('JSON 格式錯誤：缺少 defects 陣列');
            }

            // 可以在這裡添加更詳細的資料驗證
            console.log(`成功載入 ${data.defects.length} 筆瑕疵資料`);
        } catch (error) {
            showError('JSON 檔案格式錯誤：' + error.message);
            this.value = '';
        }
    });
});

// 提交處理函數
async function submitDefect() {
    // 判斷當前是單筆還是批量模式
    const isBatchMode = document.querySelector('#batch-tab').classList.contains('active');
    
    if (isBatchMode) {
        await submitBatchDefects();
    } else {
        await submitNewDefect();
    }
}

// 批量提交函數
async function submitBatchDefects() {
    try {
        const jsonFile = document.getElementById('jsonFile').files[0];
        const imageFiles = Array.from(document.getElementById('imageFiles').files);

        if (!jsonFile || imageFiles.length === 0) {
            showError('請選擇 JSON 檔案和圖片檔案');
            return;
        }

        showLoading();

        // 讀取 JSON 檔案
        const jsonText = await jsonFile.text();
        const jsonData = JSON.parse(jsonText);

        if (!jsonData.defects || !Array.isArray(jsonData.defects)) {
            throw new Error('JSON 格式錯誤');
        }

        // 建立檔名到檔案的映射
        const imageMap = new Map(imageFiles.map(file => [file.name, file]));

        // 檢查所有必要的圖片是否都存在
        const missingImages = jsonData.defects
            .filter(defect => !imageMap.has(defect.image_name))
            .map(defect => defect.image_name);

        if (missingImages.length > 0) {
            throw new Error('找不到對應的圖片檔案：' + missingImages.join(', '));
        }

        // 開始批量上傳
        console.log(`開始上傳 ${jsonData.defects.length} 筆資料...`);

        for (const defect of jsonData.defects) {
            // 準備瑕疵資料
            const defectData = {
                defect_type: defect.defect_type,
                severity: defect.severity || 1, // 預設為中等
                latitude: defect.latitude,
                longitude: defect.longitude,
                district: defect.district,
                road_section: defect.road_section,
                device_id: 'WEB_DEVICE_001',
                capture_time: new Date().toISOString()
            };

            // 步驟1：創建瑕疵記錄
            console.log(`正在創建瑕疵記錄：${defect.road_section}`);
            const defectResponse = await fetch(`${API_BASE_URL}/road-defects`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify(defectData)
            });

            const defectResult = await defectResponse.json();
            if (!defectResponse.ok || defectResult.error) {
                throw new Error(`創建瑕疵記錄失敗：${defectResult.message || '未知錯誤'}`);
            }

            // 步驟2：上傳對應的圖片
            const imageFile = imageMap.get(defect.image_name);
            const imageData = await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result.split(',')[1]);
                reader.readAsDataURL(imageFile);
            });

            console.log(`正在上傳圖片：${defect.image_name}`);
            const imageResponse = await fetch(`${API_BASE_URL}/road-defects/${defectResult.data.id}/image`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                mode: 'cors',
                body: JSON.stringify({
                    image_data: imageData,
                    filename: defect.image_name
                })
            });

            const imageResult = await imageResponse.json();
            if (!imageResponse.ok || imageResult.error) {
                throw new Error(`圖片上傳失敗：${imageResult.message || '未知錯誤'}`);
            }
        }

        // 全部上傳完成
        showSuccess(`成功上傳 ${jsonData.defects.length} 筆資料`);
        const modal = bootstrap.Modal.getInstance(document.getElementById('addDefectModal'));
        modal.hide();
        document.getElementById('batchUploadForm').reset();
        document.getElementById('batchPreviewContainer').innerHTML = '';
        window.location.reload();

    } catch (error) {
        showError('批量上傳失敗：' + error.message);
        console.error('Error:', error);
    } finally {
        hideLoading();
    }
}

// 單筆提交函數
async function submitNewDefect() {
    try {
        const form = document.getElementById('addDefectForm');
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }

        showLoading();

        // 準備圖片檔案
        const imageFile = document.getElementById('newImage').files[0];
        if (!imageFile) {
            showError('請選擇瑕疵圖片');
            return;
        }

        // 準備基本數據
        const defectData = {
            defect_type: parseInt(document.getElementById('newDefectType').value),
            severity: parseInt(document.getElementById('newSeverity').value) || 1, // 預設為中等
            latitude: parseFloat(document.getElementById('newLatitude').value),
            longitude: parseFloat(document.getElementById('newLongitude').value),
            district: document.getElementById('newDistrict').value,
            road_section: document.getElementById('newRoadSection').value,
            device_id: 'WEB_DEVICE_001',
            capture_time: new Date().toISOString()
        };

        // 驗證必要欄位
        const requiredFields = ['defect_type', 'latitude', 'longitude', 'device_id'];
        const missingFields = requiredFields.filter(field => !defectData[field]);
        
        if (missingFields.length > 0) {
            throw new Error('缺少必要欄位：' + missingFields.join(', '));
        }

        // 步驟1：創建瑕疵記錄
        console.log('正在創建瑕疵記錄...');
        const defectResponse = await fetch(`${API_BASE_URL}/road-defects`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify(defectData)
        });
        
        const defectResult = await defectResponse.json();
        
        if (!defectResponse.ok || defectResult.error) {
            throw new Error(defectResult.message || '新增瑕疵資料失敗');
        }

        const defectId = defectResult.data.id;
        console.log('瑕疵記錄創建成功，ID:', defectId);

        // 步驟2：上傳圖片
        console.log('正在上傳圖片...');
        const imageData = await new Promise((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const base64Data = reader.result.split(',')[1];
                resolve(base64Data);
            };
            reader.readAsDataURL(imageFile);
        });

        const imageUploadData = {
            image_data: imageData,
            filename: imageFile.name
        };

        const imageResponse = await fetch(`${API_BASE_URL}/road-defects/${defectId}/image`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            mode: 'cors',
            body: JSON.stringify(imageUploadData)
        });

        const imageResult = await imageResponse.json();

        if (!imageResponse.ok || imageResult.error) {
            throw new Error(imageResult.message || '圖片上傳失敗');
        }

        console.log('圖片上傳成功');
        
        // 新增成功
        showSuccess('新增成功');
        const modal = bootstrap.Modal.getInstance(document.getElementById('addDefectModal'));
        modal.hide();
        form.reset();
        document.getElementById('imagePreviewContainer').style.display = 'none';
        window.location.reload(); // 重新載入頁面以顯示新資料

    } catch (error) {
        showError('系統錯誤：' + error.message);
        console.error('Error:', error);
    } finally {
        hideLoading();
    }
}

// 工具函數
function showLoading() {
    document.querySelector('.loading').style.display = 'flex';
}

function hideLoading() {
    document.querySelector('.loading').style.display = 'none';
}

function showError(message) {
    alert(message);
}

function showSuccess(message) {
    alert(message);
}
