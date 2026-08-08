import bcrypt
import jwt
import secrets
from functools import wraps
from datetime import datetime, timezone, timedelta
from flask import current_app, jsonify, request, g


def hash_password(password: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except Exception:
        return False


def create_jwt(user_id: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(days=current_app.config["JWT_EXPIRES_DAYS"])).timestamp()),
    }
    return jwt.encode(payload, current_app.config["JWT_SECRET"], algorithm="HS256")


def decode_jwt(token: str):
    return jwt.decode(token, current_app.config["JWT_SECRET"], algorithms=["HS256"])


def set_auth_cookies(response, user_id: int):
    token = create_jwt(user_id)
    csrf = secrets.token_urlsafe(32)
    max_age = current_app.config["JWT_EXPIRES_DAYS"] * 24 * 60 * 60
    secure = not current_app.debug
    response.set_cookie(
        current_app.config["JWT_COOKIE_NAME"],
        token,
        max_age=max_age,
        httponly=True,
        secure=secure,
        samesite="None" if secure else "Lax",
        path="/",
    )
    response.set_cookie(
        current_app.config["JWT_COOKIE_CSRF_NAME"],
        csrf,
        max_age=max_age,
        httponly=False,
        secure=secure,
        samesite="None" if secure else "Lax",
        path="/",
    )
    return response


def clear_auth_cookies(response):
    response.delete_cookie(current_app.config["JWT_COOKIE_NAME"], path="/")
    response.delete_cookie(current_app.config["JWT_COOKIE_CSRF_NAME"], path="/")
    return response


def get_current_user_id():
    token = request.cookies.get(current_app.config["JWT_COOKIE_NAME"])
    if not token:
        return None
    try:
        payload = decode_jwt(token)
        return int(payload["sub"])
    except Exception:
        return None


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = get_current_user_id()
        if not user_id:
            return jsonify({"error": "Authentication required."}), 401
        g.user_id = user_id
        csrf_cookie = request.cookies.get(current_app.config["JWT_COOKIE_CSRF_NAME"])
        if request.method in {"POST", "PATCH", "PUT", "DELETE"}:
            csrf_header = request.headers.get("X-CSRF-Token")
            if not csrf_cookie or not csrf_header or csrf_cookie != csrf_header:
                return jsonify({"error": "CSRF validation failed."}), 403
        return fn(*args, **kwargs)
    return wrapper
  
