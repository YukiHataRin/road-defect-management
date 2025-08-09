"""
LLM 相關功能的路由
"""
from flask import Blueprint, request, jsonify
from flask_login import login_required
from services.llm_service import get_llm_service
from utils.api import call_road_defect_api

llm_bp = Blueprint('llm', __name__, url_prefix='/api/llm')

@llm_bp.route('/generate-report', methods=['POST'])
@login_required
def generate_report():
    """
    根據前端傳來的篩選條件，生成一份道路瑕疵報告。
    """
    try:
        # 從請求中獲取篩選參數
        filters = request.get_json()
        if not filters:
            return jsonify({"status": "error", "message": "請求中未包含篩選條件。"}), 400

        # 調用外部 API 獲取瑕疵數據
        api_result = call_road_defect_api('road-defects', params=filters)

        if not api_result.get('success') or not api_result.get('data', {}).get('data'):
            return jsonify({"status": "error", "message": "根據所選條件，找不到瑕疵數據。"}), 404

        defects_data = api_result['data']['data']

        # # 為了避免 prompt 過長，只取前 20 筆資料
        # if len(defects_data) > 20:
        #     defects_data = defects_data[:20]

        # 獲取 LLM 服務並生成報告
        llm_service = get_llm_service()
        report_content = llm_service.generate_report(defects_data)

        return jsonify({
            "status": "success",
            "data": {
                "report_content": report_content
            }
        })

    except Exception as e:
        return jsonify({"status": "error", "message": f"生成報告時發生錯誤: {str(e)}"}), 500

@llm_bp.route('/analyze-defect/<int:defect_id>', methods=['POST'])
@login_required
def analyze_defect(defect_id):
    """
    分析單一的高風險瑕疵，並提供處理建議。
    """
    # 在後續階段實現
    return jsonify({"status": "success", "message": f"Analyze defect endpoint called for defect_id: {defect_id}."})

@llm_bp.route('/query', methods=['POST'])
@login_required
def query():
    """
    接收自然語言查詢，轉換為 API 參數並返回結果。
    """
    # 在後續階段實現
    return jsonify({"status": "success", "message": "Query endpoint called."})
