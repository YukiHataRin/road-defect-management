# 道路瑕疵管理系統 - 認證系統技術文件

## 1. 系統概述

本文件詳細描述道路瑕疵管理系統的認證模組，包含使用者註冊、登入、登出等功能，以及相關的安全機制和維護指南。

### 1.1 技術架構

- **Web 框架**：Flask 2.x
- **ORM**：SQLAlchemy 1.4+
- **認證管理**：Flask-Login
- **資料儲存**：SQLite
- **密碼加密**：HMAC-SHA256 + Salt
- **前端框架**：Bootstrap 5.x
- **AJAX 處理**：原生 Fetch API

### 1.2 目錄結構

```
road_defect_management/
├── models/
│   └── user.py          # 使用者模型
├── routes/
│   └── auth.py          # 認證路由
├── templates/auth/
│   ├── login.html       # 登入頁面
│   ├── register.html    # 註冊頁面
│   └── profile.html     # 個人資料頁面
├── static/
│   └── js/
│       └── auth/        # 認證相關 JavaScript
├── config/
│   ├── auth.py          # 認證配置
│   └── database.py      # 資料庫配置
└── instance/
    └── users.db         # SQLite 資料庫
```

## 2. 資料模型

### 2.1 使用者模型 (User)

#### 資料表結構

| 欄位名稱 | 類型 | 說明 | 索引 |
|---------|------|------|------|
| id | Integer | 主鍵，自動遞增 | Primary Key |
| username | String(50) | 使用者名稱 | Unique Index |
| password_hash | String(128) | 密碼雜湊值 | - |
| salt | String(64) | 密碼加密鹽值 | - |
| created_at | DateTime | 帳號創建時間 | Index |
| last_login_at | DateTime | 最後登入時間 | Index |
| login_attempts | Integer | 登入嘗試次數 | - |
| locked_until | DateTime | 帳號鎖定時間 | Index |

#### 核心方法

```python
class User(UserMixin, db.Model):
    def set_password(self, password: str) -> None:
        """設置密碼（自動生成 salt 和雜湊）"""
        
    def verify_password(self, password: str) -> bool:
        """驗證密碼"""
        
    def update_last_login(self) -> None:
        """更新最後登入時間"""
        
    def increment_login_attempts(self) -> None:
        """增加登入嘗試次數"""
        
    def reset_login_attempts(self) -> None:
        """重置登入嘗試次數"""
```

## 3. 安全機制

### 3.1 密碼安全

1. **雜湊算法**：HMAC-SHA256
   - 使用隨機生成的 salt
   - 每個用戶獨立的 salt 值
   - 固定長度的雜湊輸出

2. **密碼策略**：
   - 最小長度：8 字符
   - 必須包含：數字、字母、特殊字符
   - 不允許常見密碼
   - 定期更換提醒

3. **防暴力破解**：
   - 登入嘗試次數限制
   - 帳號暫時鎖定機制
   - IP 位址限制

### 3.2 會話安全

1. **會話管理**：
   - 使用 Flask-Login
   - 安全的會話 ID
   - 會話超時設置

2. **CSRF 保護**：
   - 所有表單包含 CSRF Token
   - Ajax 請求驗證

3. **XSS 防護**：
   - 模板自動轉義
   - 內容安全策略 (CSP)

## 4. API 端點

### 4.1 認證路由

| 端點 | 方法 | 功能 | 參數 | 返回 |
|-----|------|------|------|------|
| `/login` | POST | 使用者登入 | username, password | JWT Token |
| `/logout` | POST | 登出 | token | 成功訊息 |
| `/register` | POST | 註冊 | username, password, confirm_password | 用戶資訊 |
| `/profile` | GET | 獲取資料 | token | 用戶資料 |
| `/profile` | PUT | 更新資料 | token, data | 更新結果 |

### 4.2 錯誤代碼

| 代碼 | 說明 | 處理方式 |
|-----|------|---------|
| 401 | 未認證 | 重定向到登入 |
| 403 | 無權限 | 顯示錯誤訊息 |
| 429 | 請求過多 | 顯示剩餘等待時間 |

## 5. 維護指南

### 5.1 日常維護

1. **資料庫維護**：
   ```bash
   # 備份資料庫
   sqlite3 instance/users.db ".backup 'backup/users_$(date +%Y%m%d).db'"
   
   # 檢查資料庫完整性
   sqlite3 instance/users.db "PRAGMA integrity_check;"
   ```

2. **日誌監控**：
   - 檢查 `/var/log/auth.log`
   - 監控異常登入
   - 記錄 IP 黑名單

3. **性能監控**：
   - 監控響應時間
   - 檢查資源使用
   - 追蹤慢查詢

### 5.2 故障排除

1. **常見問題**：
   - 登入失敗
   - 會話過期
   - 資料庫鎖定

2. **診斷步驟**：
   ```bash
   # 檢查應用日誌
   tail -f logs/app.log
   
   # 檢查資料庫連接
   sqlite3 instance/users.db ".tables"
   
   # 檢查進程狀態
   ps aux | grep flask
   ```

3. **恢復流程**：
   - 備份還原
   - 重置密碼
   - 解鎖帳號

### 5.3 安全更新

1. **定期檢查**：
   - 依賴包更新
   - 安全漏洞修補
   - 密碼策略審查

2. **更新流程**：
   ```bash
   # 更新依賴
   pip install --upgrade -r requirements.txt
   
   # 備份配置
   cp config/auth.py config/auth.py.bak
   
   # 應用更新
   flask db upgrade
   ```

## 6. 開發指南

### 6.1 本地開發

1. **環境設置**：
   ```bash
   # 創建虛擬環境
   python -m venv venv
   source venv/bin/activate
   
   # 安裝依賴
   pip install -r requirements.txt
   
   # 設置環境變數
   export FLASK_ENV=development
   export FLASK_DEBUG=1
   ```

2. **運行測試**：
   ```bash
   # 單元測試
   pytest tests/test_auth.py
   
   # 覆蓋率報告
   pytest --cov=app tests/
   ```

### 6.2 部署檢查清單

- [ ] 更新依賴版本
- [ ] 檢查配置文件
- [ ] 備份資料庫
- [ ] 測試認證流程
- [ ] 檢查錯誤處理
- [ ] 驗證安全設置
- [ ] 更新文件版本

## 7. 版本歷史

### v1.0.0 (2025-02-18)
- 初始版本
- 基本認證功能
- SQLite 資料儲存

### v1.1.0 (2025-02-20)
- 添加密碼重置
- 改進安全機制
- 優化錯誤處理

## 8. 聯繫支援

- 技術支援：support@example.com
- 文件維護：docs@example.com
- 緊急聯繫：emergency@example.com

## 9. 參考資源

- [Flask 官方文件](https://flask.palletsprojects.com/)
- [Flask-Login 文件](https://flask-login.readthedocs.io/)
- [SQLAlchemy 文件](https://docs.sqlalchemy.org/)
- [安全最佳實踐](https://owasp.org/www-project-top-ten/) 