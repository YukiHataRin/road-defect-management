"""
使用者資料模型定義
"""
from datetime import datetime, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import UserMixin
from config.database import db

class User(UserMixin, db.Model):
    """使用者資料表模型"""
    __tablename__ = 'users'

    # 基本資訊
    id = db.Column(db.Integer, primary_key=True, autoincrement=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(128), nullable=False)
    
    # 時間戳記
    created_at = db.Column(db.DateTime, nullable=False, default=lambda: datetime.now(timezone.utc))
    last_login_at = db.Column(db.DateTime, nullable=True)

    @property
    def password(self):
        """密碼屬性（不可讀取）"""
        raise AttributeError('密碼不可直接讀取')

    @password.setter
    def password(self, password: str):
        """設定密碼（自動進行雜湊處理）"""
        self.password_hash = generate_password_hash(password)

    def verify_password(self, password: str) -> bool:
        """驗證密碼
        
        Args:
            password: 要驗證的密碼
            
        Returns:
            bool: 密碼是否正確
        """
        return check_password_hash(self.password_hash, password)

    @staticmethod
    def create(username: str, password: str) -> 'User':
        """創建新使用者
        
        Args:
            username: 使用者名稱
            password: 密碼
            
        Returns:
            User: 新創建的使用者物件
        """
        user = User(username=username)
        user.password = password
        db.session.add(user)
        db.session.commit()
        return user

    @staticmethod
    def get_by_username(username: str) -> 'User':
        """根據使用者名稱獲取使用者
        
        Args:
            username: 使用者名稱
            
        Returns:
            User: 使用者物件，如果不存在則返回 None
        """
        return User.query.filter_by(username=username).first()

    def update_last_login(self):
        """更新最後登入時間"""
        self.last_login_at = datetime.now(timezone.utc)
        db.session.commit()

    def to_dict(self) -> dict:
        """轉換為字典格式
        
        Returns:
            dict: 使用者資料字典
        """
        return {
            'id': self.id,
            'username': self.username,
            'created_at': self.created_at.isoformat(),
            'last_login_at': self.last_login_at.isoformat() if self.last_login_at else None
        }

    def __repr__(self):
        """獲取物件的字符串表示"""
        return f'<User(id={self.id}, username={self.username})>' 