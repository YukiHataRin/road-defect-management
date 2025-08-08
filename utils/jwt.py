"""
JWT 工具模組
"""
import os
import jwt
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

# JWT 配置
JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'dev-secret-key')  # 開發環境使用預設值
JWT_ALGORITHM = 'HS256'
JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)

def create_token(user_id: int, token_type: str = 'access') -> str:
    """創建 JWT token
    
    Args:
        user_id: 使用者 ID
        token_type: token 類型 ('access' 或 'refresh')
        
    Returns:
        str: JWT token
    """
    expires = JWT_ACCESS_TOKEN_EXPIRES if token_type == 'access' else JWT_REFRESH_TOKEN_EXPIRES
    expires_at = datetime.utcnow() + expires
    
    payload = {
        'user_id': user_id,
        'type': token_type,
        'exp': expires_at,
        'iat': datetime.utcnow()
    }
    
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def verify_token(token: str) -> Optional[Dict[str, Any]]:
    """驗證 JWT token
    
    Args:
        token: JWT token
        
    Returns:
        Optional[Dict[str, Any]]: 解碼後的 payload，如果無效則返回 None
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        # Token 已過期
        return None
    except jwt.InvalidTokenError:
        # Token 無效
        return None 