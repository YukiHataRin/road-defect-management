"""
視圖路由模組
"""
from flask import Blueprint, render_template, redirect, url_for, request
from flask_login import login_required

views_bp = Blueprint('views', __name__)

@views_bp.route('/login')
def login():
    """登入頁面"""
    # 如果已經登入，重定向到首頁
    if 'jwt_token' in request.cookies:
        return redirect(url_for('views.defects_home'))
    return render_template('auth/login.html')

@views_bp.route('/')
@login_required
def index():
    """首頁，重定向到瑕疵頁面"""
    return redirect(url_for('views.defects_home'))

@views_bp.route('/defects')
@login_required
def defects_home():
    """瑕疵管理主頁面"""
    return render_template('defects/home.html')

@views_bp.route('/llm')
@login_required
def llm_home():
    """語言模型主頁面"""
    return render_template('llm/index.html')