"""
LLM 服務模組，用於與 Google Gemini API 互動
並包含詳細的錯誤回報與偵錯日誌機制
"""
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold
from flask import current_app

class LLMService:
    def __init__(self, api_key):
        if not api_key:
            raise ValueError("Gemini API key is not set.")
        genai.configure(api_key=api_key)
        self.model = genai.GenerativeModel('gemini-2.5-pro')

    def generate_report(self, defects_data):
        """
        使用 LLM 生成結構化且美觀的道路瑕疵報告（Markdown 格式）。
        """
        prompt = (
            "你是一位專業的道路維護分析師，請根據下方道路瑕疵資料，撰寫一份專業且深入、篇幅較長的分析報告，格式請使用 Markdown。內容要求：\n"
            "1. 報告標題（加粗、專業）\n"
            "2. 詳細的統計摘要（如總瑕疵數、各類型/嚴重度分布、趨勢分析，條列式與段落並用）\n"
            "3. 請產生兩個統計表格，皆以 markdown 標準語法（每行開頭與結尾都要有 |，且表頭下方要有 --- 分隔線），如下例：\n"
            "   | 欄位1 | 欄位2 |\n"
            "   | --- | --- |\n"
            "   | 資料1 | 資料2 |\n"
            "   (1) 行政區瑕疵數統計表（欄位：行政區、瑕疵數量、平均嚴重度，依瑕疵數量排序）\n"
            "   (2) 路段瑕疵數統計表（欄位：行政區、路段名稱、瑕疵數量、平均嚴重度，依瑕疵數量排序）\n"
            "4. 針對需優先修復的區域與路段，撰寫專業建議與修復策略（條列式與段落並用，內容具體且有深度）\n"
            "5. 報告內容務必專業、條理清晰、篇幅充實，避免僅簡單摘要。\n"
            "6. 不要產生任何 mermaid 或圖表語法，只產生上述 markdown 表格。\n"
            "\n資料如下：\n"
            f"{defects_data[:40]}"
        )

        # --- 加入 safety_settings 來降低阻擋的機率 ---
        safety_settings = {
            HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
        }

        try:
            current_app.logger.info("[DEBUG] 1. 即將呼叫 Gemini API (已設定安全等級)...")
            response = self.model.generate_content(
                prompt,
                safety_settings=safety_settings # 將安全設定傳入
            )
            current_app.logger.info("[DEBUG] 2. API 呼叫完成。")
            
            if not response.candidates:
                prompt_feedback = response.prompt_feedback
                error_message = (
                    f"無法生成報告：請求因提示詞(Prompt)本身的問題被阻擋。\n"
                    f"原因: {prompt_feedback.block_reason.name if prompt_feedback.block_reason else '未知'}\n"
                    f"詳細安全評級: {[str(rating) for rating in prompt_feedback.safety_ratings]}"
                )
                current_app.logger.error(error_message)
                return error_message

            candidate = response.candidates[0]
            
            if not candidate.content.parts:
                finish_reason_name = candidate.finish_reason.name
                safety_ratings_details = [
                    f"  - 類別: {rating.category.name}, 機率: {rating.probability.name}"
                    for rating in candidate.safety_ratings
                ]
                error_message = (
                    f"無法生成報告：回應為空，即使放寬安全設定，內容仍可能被阻擋。\n"
                    f"API回報的終止原因: {finish_reason_name}\n"
                    f"詳細安全評級:\n" + "\n".join(safety_ratings_details)
                )
                current_app.logger.error(error_message)
                return error_message

            finish_reason_name = candidate.finish_reason.name
            if finish_reason_name != "STOP":
                 error_message = f"無法生成報告：內容生成因 '{finish_reason_name}' 而異常中止。"
                 current_app.logger.warning(error_message)
                 return error_message

            current_app.logger.info("[DEBUG] 所有檢查通過，準備回傳 response.text。")
            return response.text

        except Exception as e:
            current_app.logger.error(f"調用 Gemini API 時發生未預期的錯誤: {e}")
            return f"無法生成報告：發生未預期的錯誤: {e}"

def get_llm_service():
    """
    獲取 LLMService 的單例。
    """
    if 'llm_service' not in current_app.config:
        api_key = current_app.config.get('GEMINI_API_KEY')
        current_app.config['llm_service'] = LLMService(api_key)
    return current_app.config['llm_service']
