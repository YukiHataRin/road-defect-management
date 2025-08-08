"""
資料庫初始化腳本
"""
import os
import sys
from pathlib import Path

# 添加專案根目錄到 Python 路徑
root_dir = Path(__file__).parent.parent
sys.path.append(str(root_dir))

from config.database import engine, Base, db_session
from models.user import User

def init_db(force: bool = False):
    """初始化資料庫
    
    Args:
        force: 是否強制重新創建資料表
    """
    if force:
        print("正在刪除現有資料表...")
        Base.metadata.drop_all(bind=engine)

    print("正在創建資料表...")
    Base.metadata.create_all(bind=engine)

    # 檢查是否已有管理員帳號
    admin = db_session.query(User).filter_by(username='admin').first()
    if not admin:
        print("正在創建預設管理員帳號...")
        admin = User(username='admin')
        admin.password = 'Admin123'  # 在實際部署時應該使用更強的密碼
        db_session.add(admin)
        db_session.commit()
        print("預設管理員帳號已創建")
    
    print("資料庫初始化完成！")

if __name__ == '__main__':
    # 解析命令列參數
    force = '--force' in sys.argv
    init_db(force) 