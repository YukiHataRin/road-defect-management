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
        self.model = genai.GenerativeModel('gemini-pro')

    def generate_report(self, defects_data):
        """
        使用 LLM 生成道路瑕疵報告。

        Args:
            defects_data (list): 從 API 獲取的瑕疵數據列表。

        Returns:
            str: LLM 生成的報告內容。
        """
        # 在第一階段，我們先返回一個模擬的回應
        # 後續將實現完整的 prompt 和 API 調用
        prompt = f"請總結以下道路瑕疵數據：\n{defects_data}"

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
