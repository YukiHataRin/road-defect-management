"""
LLM 服務模組，用於與 Google Gemini API 互動
"""
import google.generativeai as genai
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

        Args:
            defects_data (list): 從 API 獲取的瑕疵數據列表。

        Returns:
            str: LLM 生成的報告內容（Markdown 格式）。
        """
        prompt = (
            "請根據以下道路瑕疵資料，生成一份結構化且美觀的道路瑕疵分析報告，格式請使用 Markdown，內容包含：\n"
            "1. 報告標題（加粗）\n"
            "2. 統計摘要（如總數、各類型/嚴重度分布，條列式）\n"
            "3. 主要瑕疵資料以表格呈現（欄位建議：城市、行政區、街道、瑕疵類型、嚴重度、發現日期等）\n"
            "4. 依據資料給出簡短建議（條列式）\n"
            "5. 若資料量過多，僅摘要前 20 筆即可。\n"
            "\n資料如下：\n"
            f"{defects_data}"
        )

        try:
            response = self.model.generate_content(prompt)
            return response.text
        except Exception as e:
            current_app.logger.error(f"調用 Gemini API 時發生錯誤: {e}")
            return f"無法生成報告：{e}"

def get_llm_service():
    """
    獲取 LLMService 的單例。
    """
    if 'llm_service' not in current_app.config:
        api_key = current_app.config.get('GEMINI_API_KEY')
        current_app.config['llm_service'] = LLMService(api_key)
    return current_app.config['llm_service']
