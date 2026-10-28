"""Password/login regression tests; only an in-memory user database is used."""
import sys
from pathlib import Path

import pytest
from flask import Flask
from flask_login import LoginManager, current_user, login_required
from werkzeug.security import generate_password_hash

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from config.database import db
from models.user import User
from routes.auth import auth_bp
from utils.passwords import check_password_hash

PASSWORD = 'isolated-test-密碼-only'


@pytest.fixture(scope='module')
def scrypt_hash():
    # Independent fixture generated with Werkzeug 3.1.8 for PASSWORD above;
    # no production account/hash is used, nor is the verifier its own oracle.
    return ('scrypt:32768:8:1$xSTcoiMY6uB4Xq2v$'
            'ccc0185efa8251ec3a3594a3b8e637271741040467eddf1b6558f0505fc199e1'
            'ed6a84c8810bf3a9a86e3b12f56c25802cb21bc97c9f92b750443b5f1b204256')


def test_scrypt_correct_and_wrong_password(scrypt_hash):
    assert check_password_hash(scrypt_hash, PASSWORD)
    assert not check_password_hash(scrypt_hash, 'incorrect')


def test_existing_pbkdf2_is_preserved():
    encoded = generate_password_hash(PASSWORD, method='pbkdf2:sha256:260000')
    assert check_password_hash(encoded, PASSWORD)
    assert not check_password_hash(encoded, 'incorrect')


@pytest.mark.parametrize('encoded', [None, '', 'broken', 'unknown$salt$hash',
    'scrypt:32768:8:1$salt$broken', 'scrypt:32768:8:1$$' + '0' * 128,
    'scrypt:1073741824:8:1$salt$' + '0' * 128,
    'scrypt:32768:8:999999$salt$' + '0' * 128,
    'scrypt:32768:8:1$salt$' + 'é' * 128,
    'pbkdf2:invalid:100$salt$abc'])
def test_invalid_hash_rejected(encoded):
    assert not check_password_hash(encoded, PASSWORD)


@pytest.mark.parametrize('password', [None, 42, b'bytes'])
def test_invalid_password_rejected(scrypt_hash, password):
    assert not check_password_hash(scrypt_hash, password)


def test_invalid_scrypt_does_not_run_expensive_kdf(monkeypatch):
    def forbidden(*args, **kwargs):
        raise AssertionError('KDF must not run for unsupported parameters')
    monkeypatch.setattr('utils.passwords.hashlib.scrypt', forbidden)
    assert not check_password_hash('scrypt:1073741824:8:1$salt$' + '0' * 128, PASSWORD)


@pytest.fixture
def app(monkeypatch):
    # Do not import app.py: it creates live tables on import.
    app = Flask(__name__)
    app.config.update(TESTING=True, SECRET_KEY='test-only',
                      SQLALCHEMY_DATABASE_URI='sqlite:///:memory:',
                      SQLALCHEMY_TRACK_MODIFICATIONS=False)
    db.init_app(app)
    manager = LoginManager(app)
    manager.login_view = 'auth.login'
    manager.user_loader(lambda uid: User.query.get(int(uid)))
    app.register_blueprint(auth_bp)
    @app.route('/home', endpoint='defects.home')
    @login_required
    def home():
        return 'authenticated:' + current_user.username
    # Template rendering is not part of this backend regression; live GET is
    # checked separately. Actual auth blueprint, model, DB and session are used.
    monkeypatch.setattr('routes.auth.render_template', lambda *a, **kw: 'login form')
    with app.app_context():
        db.create_all()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.mark.parametrize('method', ['scrypt', 'pbkdf2'])
def test_login_success_updates_last_login_not_password(app, scrypt_hash, method):
    original = scrypt_hash if method == 'scrypt' else generate_password_hash(PASSWORD)
    user = User(username='test-user', password_hash=original)
    db.session.add(user)
    db.session.commit()
    client = app.test_client()
    result = client.post('/login', data={'username': 'test-user', 'password': PASSWORD})
    assert result.status_code == 302 and result.headers['Location'].endswith('/home')
    assert client.get('/home').get_data(as_text=True) == 'authenticated:test-user'
    assert User.query.first().last_login_at is not None
    assert User.query.first().password_hash == original


@pytest.mark.parametrize('case', ['wrong', 'missing', 'malformed', 'unknown-user'])
def test_rejected_login_has_no_session_or_server_error(app, scrypt_hash, case):
    user = User(username='test-user', password_hash='broken' if case == 'malformed' else scrypt_hash)
    db.session.add(user)
    db.session.commit()
    client = app.test_client()
    form = {'username': 'absent' if case == 'unknown-user' else 'test-user', 'password': 'wrong'}
    if case == 'missing':
        form.pop('password')
    result = client.post('/login', data=form)
    assert result.status_code == 200
    with client.session_transaction() as session:
        assert '_user_id' not in session
        assert any('帳號或密碼錯誤' in message for _, message in session['_flashes'])
    assert user.last_login_at is None
    assert client.get('/home').status_code == 302


def test_new_password_creation_still_verifies():
    user = User(username='new-test-user')
    user.password = PASSWORD
    assert user.verify_password(PASSWORD)
    assert not user.verify_password('wrong')
