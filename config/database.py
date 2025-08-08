"""
資料庫配置
"""
from flask_sqlalchemy import SQLAlchemy
import os

# 創建資料庫實例
db = SQLAlchemy()

def init_db(app):
    """初始化資料庫
    
    Args:
        app: Flask 應用程式實例
    """
    # 確保 instance 目錄存在
    os.makedirs(app.instance_path, exist_ok=True)
    
    # 從應用程式配置中讀取資料庫設定
    current_config = app.config.get('CURRENT_CONFIG', {})
    db_config = current_config.get('database', {})
    
    # 設置資料庫 URI
    db_url = db_config.get('url')
    if db_url and db_url.startswith('sqlite:///'):
        # 如果是 SQLite，設置正確的路徑
        db_name = db_url.split('sqlite:///')[-1]
        db_path = os.path.join(app.instance_path, db_name)
        app.config['SQLALCHEMY_DATABASE_URI'] = f'sqlite:///{db_path}'
    else:
        # 其他資料庫類型，直接使用設定的 URL
        app.config['SQLALCHEMY_DATABASE_URI'] = db_url
        
    # 資料庫回顯設定
    app.config['SQLALCHEMY_ECHO'] = db_config.get('echo', False)
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    
    # 初始化資料庫
    db.init_app(app)
    
    # 在應用程式上下文中創建所有資料表
    with app.app_context():
        db.create_all() 