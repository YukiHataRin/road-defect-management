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
            "你是一位專業的道路維護分析師，請根據下方道路瑕疵資料，撰寫一份專業且深入、篇幅較長的分析報告，格式請使用 Markdown。內容要求：\n"
            "1. 報告標題（加粗、專業）\n"
            "2. 詳細的統計摘要（如總瑕疵數、各類型/嚴重度分布、趨勢分析，條列式與段落並用）\n"
            "3. 以表格統計『各行政區、各路段』的瑕疵數量與平均嚴重度，並依需優先修復排序（欄位建議：行政區、路段、瑕疵數、平均嚴重度、建議優先順序）\n"
            "4. 針對需優先修復的區域與路段，撰寫專業建議與修復策略（條列式與段落並用，內容具體且有深度）\n"
            "5. 報告內容務必專業、條理清晰、篇幅充實，避免僅簡單摘要。\n"
            "6. 若資料量過多，僅摘要前 20 筆即可。\n"
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
