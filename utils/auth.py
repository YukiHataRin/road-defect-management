"""
認證中間件
"""
from functools import wraps
from flask import request, jsonify
from road_defect_management.utils.jwt import verify_token
from road_defect_management.models.user import User

def login_required(f):
    """檢查使用者是否已登入的裝飾器
    
    Args:
        f: 要裝飾的函數
        
    Returns:
        裝飾後的函數
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get('Authorization')
        if not auth_header:
            return jsonify({
                'message': '請提供認證 token'
            }), 401
        
        # 移除 'Bearer ' 前綴
        if auth_header.startswith('Bearer '):
            token = auth_header[7:]
        else:
            token = auth_header
            
        payload = verify_token(token)
        if not payload or payload.get('type') != 'access':
            return jsonify({
                'message': '無效的 token'
            }), 401
            
        user_id = payload.get('user_id')
        user = User.query.get(user_id)
        if not user:
            return jsonify({
                'message': '使用者不存在'
            }), 401
            
        # 將使用者資訊添加到 request 中
        request.user = user
        return f(*args, **kwargs)
        
    return decorated 