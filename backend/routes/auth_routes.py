from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError
from database import db
from models import User
from auth import (
    hash_password,
    verify_password,
    set_auth_cookies,
    clear_auth_cookies,
    require_auth,
    get_current_user_id,
    create_jwt,
)

auth_bp = Blueprint("auth_bp", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return jsonify({"error": "Please provide a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters long."}), 400

    user = User(email=email, password_hash=hash_password(password))
    db.session.add(user)

    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return jsonify({"error": "An account with that email already exists."}), 409

    token = create_jwt(user.id)
    response = jsonify({
        "message": "Registration successful.",
        "token": token,
        "user": {
            "email": user.email,
        },
    })
    return set_auth_cookies(response, user.id)


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({"error": "Invalid email or password."}), 401

    token = create_jwt(user.id)
    response = jsonify({
        "message": "Login successful.",
        "token": token,
        "user": {
            "email": user.email,
        },
    })
    return set_auth_cookies(response, user.id)


@auth_bp.post("/logout")
@require_auth
def logout():
    response = jsonify({"message": "Logged out."})
    return clear_auth_cookies(response)


@auth_bp.get("/me")
@require_auth
def me():
    user_id = get_current_user_id()
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "User not found."}), 404

    return jsonify({
        "user": {
            "id": user.id,
            "email": user.email,
            "created_at": user.created_at.isoformat(),
        }
    })
