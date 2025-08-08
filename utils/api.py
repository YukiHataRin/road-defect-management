"""
API 調用工具函數
"""
import json
import requests
from flask import current_app, request
from typing import Dict, Any, Optional

def call_road_defect_api(
    endpoint: str,
    method: str = 'GET',
    params: Optional[Dict[str, Any]] = None,
    data: Optional[Dict[str, Any]] = None,
    stream: bool = False
) -> Dict[str, Any]:
    """
    調用道路瑕疵 API
    
    Args:
        endpoint: API 端點，不包含基礎 URL
        method: HTTP 方法，預設為 GET
        params: URL 參數
        data: POST 資料
        stream: 是否以串流方式獲取響應
        
    Returns:
        Dict: API 響應內容和狀態碼
    """
    try:
        # 輸出 API 請求參數以便調試
        print(f"Calling API endpoint: {endpoint}")
        print(f"Method: {method}")
        print(f"Params: {params}")
        print(f"Data: {data}")
        
        # 使用對方的 API URL
        base_url = 'http://140.134.37.59:5002/api/v1'
        api_url = f"{base_url}/{endpoint.lstrip('/')}"
        print(f"Full API URL: {api_url}")
        
        # 記錄 API 請求
        current_app.logger.info(f"正在請求 API: {api_url}")
        if params:
            current_app.logger.info(f"參數: {json.dumps(params, ensure_ascii=False, indent=2)}")
        if data:
            current_app.logger.info(f"資料: {json.dumps(data, ensure_ascii=False, indent=2)}")
        
        # 發送請求
        response = requests.request(
            method=method,
            url=api_url,
            params=params,
            json=data if data else None,
            stream=stream
        )
        
        # 輸出響應狀態
        print(f"API Response status: {response.status_code}")
        
        # 如果是流式響應，直接返回
        if stream:
            return {
                'success': response.ok,
                'status_code': response.status_code,
                'response': response
            }

        # 解析響應
        if response.ok:
            return {
                'success': True,
                'data': response.json()
            }
        else:
            error_message = '未知錯誤'
            try:
                error_data = response.json()
                error_message = error_data.get('message', error_data.get('error', '未知錯誤'))
            except:
                error_message = response.text or '未知錯誤'
            
            print(f"API Error: {error_message}")
            return {
                'success': False,
                'message': error_message,
                'status_code': response.status_code
            }

    except Exception as e:
        print(f"API Call Error: {str(e)}")
        return {
            'success': False,
            'message': str(e)
        } 