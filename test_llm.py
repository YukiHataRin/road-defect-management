import requests
import json

# 專案運行的基礎 URL
BASE_URL = "http://localhost:5000"

# 管理員登入憑證
ADMIN_USERNAME = "hatarin"
ADMIN_PASSWORD = "howard20030529"

def test_llm_with_session():
    """
    使用 requests.Session 模擬瀏覽器登入並測試 LLM 報告生成端點。
    這種方法適用於測試基於 session 和 cookie 的網頁驗證。
    """
    # 使用 'with' 陳述式來確保 session 被正確關閉
    with requests.Session() as session:
        # --- 步驟 1: 登入並建立 Session ---
        
        # 目標是處理網頁表單的 /login 路由
        login_url = f"{BASE_URL}/login"
        
        # 發送 'form data' (application/x-www-form-urlencoded)
        login_payload = {
            "username": ADMIN_USERNAME,
            "password": ADMIN_PASSWORD
        }
        
        print(f"正在向網頁登入端點 {login_url} 發送表單...")
        try:
            # 發送 POST 請求來登入
            login_res = session.post(login_url, data=login_payload, allow_redirects=True)
            login_res.raise_for_status()

            # 驗證是否登入成功
            if login_res.url == login_url:
                 print("登入失敗，似乎仍停留在登入頁面。請檢查帳號密碼是否正確。")
                 return

            print("登入成功，Session Cookie 已在 session 物件中設定。")

        except requests.exceptions.RequestException as e:
            print(f"登入過程中發生錯誤: {e}")
            return

        # --- 步驟 2: 使用已驗證的 Session 測試 LLM 報告生成端點 ---
        
        print("\n--- 開始測試受保護的 LLM 報告生成端點 ---")
        # 根據您提供的路由程式碼，更新為正確的端點
        report_url = f"{BASE_URL}/api/llm/generate-report"
        
        # 根據路由要求，建立一個篩選條件的 payload
        # 您可以修改這裡的條件來進行不同的測試
        filters_payload = {
            "district": "西屯區",
            "type": "坑洞"
        }
        
        print(f"正在使用已登入的 session 向 {report_url} 發送請求...")
        print(f"篩選條件: {json.dumps(filters_payload, ensure_ascii=False)}")
        
        try:
            # 使用同一個 session 物件發送請求
            report_res = session.post(report_url, json=filters_payload)
            report_res.raise_for_status()

            print("\n請求成功！")
            print("LLM 生成的報告回應:")
            # 美化 JSON 輸出
            print(json.dumps(report_res.json(), indent=2, ensure_ascii=False))

        except requests.exceptions.HTTPError as e:
            if e.response.status_code in [401, 403]:
                print(f"請求被拒絕 (狀態碼: {e.response.status_code})。這通常意味著登入 session 未被伺服器正確識別。")
            else:
                print(f"請求失敗，狀態碼：{e.response.status_code}")
            print(f"回應內容：{e.response.text}")
        except json.JSONDecodeError:
            print("錯誤：無法將端點的回應解析為 JSON。")
            print(f"收到的原始回應內容: {report_res.text}")
        except requests.exceptions.RequestException as e:
            print(f"請求時發生錯誤： {e}")


if __name__ == "__main__":
    print("--- 開始使用 Session 進行後端功能測試 ---")
    test_llm_with_session()
    print("\n--- 測試結束 ---")
