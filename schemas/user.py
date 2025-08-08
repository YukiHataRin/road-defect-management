"""
使用者資料驗證模式

此模組定義了使用者相關操作的資料驗證規則，包含：
1. 登入驗證
2. 密碼修改驗證
"""
from marshmallow import Schema, fields, validates, validates_schema, ValidationError


class UserLoginSchema(Schema):
    """使用者登入資料驗證模式"""
    
    username = fields.String(
        required=True,
        error_messages={'required': '請輸入使用者名稱'},
        metadata={'description': '使用者名稱'}
    )
    password = fields.String(
        required=True,
        error_messages={'required': '請輸入密碼'},
        metadata={'description': '密碼'}
    )
    remember_me = fields.Boolean(
        load_default=False,
        metadata={'description': '記住我'}
    )


class PasswordChangeSchema(Schema):
    """密碼修改驗證模式"""
    
    current_password = fields.String(
        required=True,
        error_messages={'required': '請輸入目前的密碼'},
        metadata={'description': '目前的密碼'}
    )
    new_password = fields.String(
        required=True,
        error_messages={'required': '請輸入新密碼'},
        metadata={'description': '新密碼（至少8個字符）'}
    )
    confirm_new_password = fields.String(
        required=True,
        error_messages={'required': '請確認新密碼'},
        metadata={'description': '確認新密碼'}
    )

    @validates('new_password')
    def validate_new_password(self, value):
        """驗證新密碼強度"""
        if len(value) < 8:
            raise ValidationError('密碼至少需要8個字符')
        if not any(c.isupper() for c in value):
            raise ValidationError('密碼必須包含至少一個大寫字母')
        if not any(c.islower() for c in value):
            raise ValidationError('密碼必須包含至少一個小寫字母')
        if not any(c.isdigit() for c in value):
            raise ValidationError('密碼必須包含至少一個數字')

    @validates_schema
    def validate_passwords(self, data, **kwargs):
        """驗證新密碼相關規則"""
        current_password = data.get('current_password')
        new_password = data.get('new_password')
        confirm_password = data.get('confirm_new_password')
        
        if current_password == new_password:
            raise ValidationError('新密碼不能與目前的密碼相同')
            
        if new_password != confirm_password:
            raise ValidationError('新密碼與確認密碼不符')


class UserResponseSchema(Schema):
    """使用者資料響應模式"""
    
    id = fields.Integer(dump_only=True)
    username = fields.String(dump_only=True)
    created_at = fields.DateTime(dump_only=True)
    last_login_at = fields.DateTime(dump_only=True) 