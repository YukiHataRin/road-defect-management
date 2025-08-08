"""
Flask 應用程式啟動腳本
"""
import argparse
import json
import os
from pathlib import Path
from flask import Flask, redirect, url_for, request, send_from_directory
from flask_login import LoginManager
from flask_cors import CORS
from models.user import User
from config.database import init_db
from werkzeug.middleware.proxy_fix import ProxyFix

# 應用版本
APP_VERSION = '0.1.0'

def create_app(config):
    app = Flask(__name__)
    
    # 將配置添加到應用程式配置中，方便其他模塊訪問
    app.config['CURRENT_CONFIG'] = config
    app.config['SECRET_KEY'] = config['flask']['secret_key']
    app.config['GEMINI_API_KEY'] = config.get('secrets', {}).get('gemini_api_key')
    
    # 設置應用程式根路徑
    # app.config['APPLICATION_ROOT'] = ''
    # app.config['PREFERRED_URL_SCHEME'] = 'https'
    # app.config['STATIC_URL_PATH'] = '/static'
    # app.config['STATIC_FOLDER'] = 'static'

    # 使用 ProxyFix 中間件處理代理頭
    app.wsgi_app = ProxyFix(
        app.wsgi_app,
        x_for=1,
        x_proto=1,
        x_host=1,
        x_prefix=1
    )

    # 添加中間件處理代理路徑
    @app.before_request
    def fix_proxy_path():
        script_name = request.environ.get('HTTP_X_SCRIPT_NAME', '')
        if script_name:
            request.environ['SCRIPT_NAME'] = script_name
            request.environ['PATH_INFO'] = request.environ['PATH_INFO'].replace(script_name, '', 1)

    # 初始化 CORS
    cors_origins = config['api']['cors_origins']
    cors_methods = config['api']['cors_methods']
    cors_headers = config['api']['cors_headers']
    
    CORS(app, resources={
        r"/api/*": {
            "origins": cors_origins,
            "methods": cors_methods,
            "allow_headers": cors_headers + ["X-Script-Name", "Authorization"],
            "supports_credentials": True,
            "expose_headers": ["Content-Type", "X-Total-Count"]
        }
    })

    # 初始化資料庫
    init_db(app)

    # 初始化 LoginManager
    login_manager = LoginManager()
    login_manager.init_app(app)
    login_manager.login_view = 'auth.login'
    login_manager.login_message = '請先登入系統'

    @login_manager.user_loader
    def load_user(user_id):
        return User.query.get(int(user_id))
    
    # 禁用 Flask-Assets
    assets_enabled = False
    
    # 注入全局變量到模板
    @app.context_processor
    def inject_globals():
        return {
            'version': APP_VERSION,
            'assets_enabled': assets_enabled
        }

    # 註冊藍圖
    from routes.auth import auth_bp
    from routes.defects import defects_bp
    from routes.llm import llm_bp
    
    app.register_blueprint(auth_bp)
    app.register_blueprint(defects_bp)
    app.register_blueprint(llm_bp)

    # 添加根路由重定向
    @app.route('/')
    def index():
        return redirect(url_for('auth.login'))

    return app


# 載入配置文件
def load_config():
    # 載入主配置
    config_path = Path(__file__).parent / 'config.json'
    with open(config_path, 'r', encoding='utf-8') as f:
        config = json.load(f)

    # 載入密鑰配置
    secrets_path = Path(__file__).parent / 'config/secrets.json'
    if secrets_path.exists():
        with open(secrets_path, 'r', encoding='utf-8') as f:
            secrets = json.load(f)
        # 將密鑰合併到主配置中
        config['secrets'] = secrets
    else:
        print("警告: 'config/secrets.json' 文件未找到。")
        config['secrets'] = {}

    # 獲取環境配置
    env = os.getenv('FLASK_ENV', 'development')

    # 將密鑰配置合併到特定環境的配置中
    env_config = config[env]
    env_config['secrets'] = config.get('secrets', {})

    return env_config, env


# 獲取配置
current_config, ENV = load_config()

# 設置環境變數
os.environ['JWT_SECRET_KEY'] = current_config['jwt']['secret_key']
os.environ['FLASK_ENV'] = current_config['flask']['env']

# 創建應用程式
app = create_app(current_config)

if __name__ == '__main__':
    # 解析命令列參數
    parser = argparse.ArgumentParser(description='啟動道路瑕疵管理系統')
    parser.add_argument('--host', default='0.0.0.0', help='服務主機位址')
    parser.add_argument('--port', type=int, default=5000, help='服務端口')
    parser.add_argument('--debug', action='store_true', help='啟用調試模式')
    parser.add_argument('--ssl', action='store_true', help='啟用 HTTPS')
    args = parser.parse_args()

    # SSL 配置
    ssl_context = None
    if args.ssl:
        cert_dir = Path(__file__).parent / 'ssl'
        cert_dir.mkdir(exist_ok=True)
        cert_file = cert_dir / 'cert.pem'
        key_file = cert_dir / 'key.pem'

        if not (cert_file.exists() and key_file.exists()):
            print("正在生成自簽名 SSL 證書...")
            os.system(
                'openssl req -x509 -newkey rsa:4096 -nodes -out ssl/cert.pem '
                '-keyout ssl/key.pem -days 365 -subj "/CN=localhost"'
            )
        ssl_context = (str(cert_file), str(key_file))

    # 顯示服務配置信息
    print("\n=== 道路瑕疵管理系統 ===")
    print(f"版本: {APP_VERSION}")
    print(f"環境: {ENV}")
    print(f"主機: {args.host}")
    print(f"端口: {args.port}")
    print(f"調試模式: {'啟用' if args.debug else '停用'}")
    print(f"HTTPS: {'啟用' if args.ssl else '停用'}")
    if args.ssl:
        print(f"證書路徑: {cert_file}")
    api_base_url = current_config.get('road_defect_api', {}).get('base_url', 'http://127.0.0.1:5002/api/v1')
    print(f"瑕疵 API: {api_base_url}")
    print("=====================\n")

    # 啟動應用程式
    app.run(
        host=args.host,
        port=args.port,
        debug=args.debug or current_config['flask']['debug'],
        ssl_context=ssl_context
    )
