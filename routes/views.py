"""
視圖路由模組
"""
from flask import Blueprint, render_template, redirect, url_for, request

views_bp = Blueprint('views', __name__)

@views_bp.route('/login')
def login():
    """登入頁面"""
    # 如果已經登入，重定向到首頁
    if request.headers.get('Authorization'):
        return redirect(url_for('views.index'))
    return render_template('login.html')

@views_bp.route('/')
def index():
    """首頁"""
    # 如果未登入，重定向到登入頁面
    if not request.headers.get('Authorization'):
        return redirect(url_for('views.login'))
    return render_template('index.html') 