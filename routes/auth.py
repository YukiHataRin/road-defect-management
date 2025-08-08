"""
認證相關路由
"""
from flask import Blueprint, render_template, redirect, url_for, request, flash
from flask_login import login_user, logout_user, login_required, current_user
from models.user import User
from config.database import db

auth_bp = Blueprint('auth', __name__)

@auth_bp.route('/')
def index():
    return redirect(url_for('auth.login'))

@auth_bp.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        
        user = User.get_by_username(username)
        if user and user.verify_password(password):
            login_user(user)
            user.update_last_login()
            return redirect(url_for('defects.home'))
        else:
            flash('帳號或密碼錯誤')
    
    return render_template('auth/login.html')

@auth_bp.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form.get('username')
        password = request.form.get('password')
        confirm_password = request.form.get('confirm_password')
        
        if password != confirm_password:
            flash('兩次輸入的密碼不一致')
            return render_template('auth/register.html')
            
        if User.get_by_username(username):
            flash('使用者名稱已存在')
            return render_template('auth/register.html')
            
        try:
            user = User.create(username, password)
            login_user(user)
            return redirect(url_for('auth.profile'))
        except Exception as e:
            flash('註冊失敗，請稍後再試')
            return render_template('auth/register.html')
    
    return render_template('auth/register.html')

@auth_bp.route('/logout')
@login_required
def logout():
    logout_user()
    return redirect(url_for('auth.login'))

@auth_bp.route('/profile')
@login_required
def profile():
    return render_template('auth/profile.html') 