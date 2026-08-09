from datetime import datetime, timezone, timedelta
import bcrypt
import secrets
from flask import Blueprint, jsonify, request
from sqlalchemy.exc import IntegrityError

from database import db
from models import User, EmailOtp
from auth import (
    hash_password,
    verify_password,
    set_auth_cookies,
    clear_auth_cookies,
    require_auth,
    get_current_user_id,
    create_jwt,
)
from email_service import send_verification_email, EmailDeliveryError

auth_bp = Blueprint("auth_bp", __name__, url_prefix="/api/auth")


def _generate_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(code: str) -> str:
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(code.encode("utf-8"), salt).decode("utf-8")


def _verify_otp(code: str, code_hash: str) -> bool:
    try:
        return bcrypt.checkpw(code.encode("utf-8"), code_hash.encode("utf-8"))
    except Exception:
        return False


def _otp_expiry_minutes() -> int:
    from flask import current_app
    return int(current_app.config.get("OTP_EXPIRES_MINUTES", 10))


def _otp_max_attempts() -> int:
    from flask import current_app
    return int(current_app.config.get("OTP_MAX_ATTEMPTS", 5))


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or "@" not in email:
        return jsonify({"error": "Please provide a valid email address."}), 400
    if len(password) < 8:
        return jsonify({"error": "Password must be at least 8 characters long."}), 400

    existing_user = User.query.filter_by(email=email).first()
    if existing_user:
        pending = EmailOtp.query.filter_by(user_id=existing_user.id).first()
        if pending:
            return jsonify({
                "error": "Email verification pending. Please verify your email or resend the code.",
                "verification_required": True,
                "email": email,
            }), 409
        return jsonify({"error": "An account with that email already exists."}), 409

    user = User(email=email, password_hash=hash_password(password))
    db.session.add(user)
    db.session.flush()

    otp_code = _generate_otp()
    otp_row = EmailOtp(
        user_id=user.id,
        email=email,
        code_hash=_hash_otp(otp_code),
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=_otp_expiry_minutes()),
        attempts=0,
    )
    db.session.add(otp_row)
    db.session.commit()

    try:
        send_verification_email(email, otp_code)
    except EmailDeliveryError:
        return jsonify({
            "error": "Account created, but verification email could not be sent. Please resend the code.",
            "verification_required": True,
            "email": email,
        }), 500

    return jsonify({
        "message": "Verification code sent to your email.",
        "verification_required": True,
        "email": email,
    }), 201


@auth_bp.post("/verify-otp")
def verify_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    otp = (data.get("otp") or "").strip()

    if not email or "@" not in email:
        return jsonify({"error": "Please provide a valid email address."}), 400
    if not otp or len(otp) != 6 or not otp.isdigit():
        return jsonify({"error": "Please enter the 6-digit OTP."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    otp_row = EmailOtp.query.filter_by(user_id=user.id, email=email).first()
    if not otp_row:
        return jsonify({"error": "Email already verified."}), 400

    now = datetime.now(timezone.utc)
    if otp_row.expires_at < now:
        db.session.delete(otp_row)
        db.session.commit()
        return jsonify({"error": "OTP expired. Please resend the code."}), 400

    if otp_row.attempts >= _otp_max_attempts():
        db.session.delete(otp_row)
        db.session.commit()
        return jsonify({"error": "Too many attempts. Please resend the code."}), 429

    otp_row.attempts += 1

    if not _verify_otp(otp, otp_row.code_hash):
        db.session.commit()
        return jsonify({"error": "Invalid OTP."}), 400

    db.session.delete(otp_row)
    db.session.commit()

    token = create_jwt(user.id)
    response = jsonify({
        "message": "Email verified successfully.",
        "token": token,
        "user": {
            "email": user.email,
        },
    })
    return set_auth_cookies(response, user.id)


@auth_bp.post("/resend-otp")
def resend_otp():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email or "@" not in email:
        return jsonify({"error": "Please provide a valid email address."}), 400

    user = User.query.filter_by(email=email).first()
    if not user:
        return jsonify({"error": "User not found."}), 404

    otp_row = EmailOtp.query.filter_by(user_id=user.id, email=email).first()
    if not otp_row:
        return jsonify({"error": "Email is already verified."}), 400

    otp_code = _generate_otp()
    otp_row.code_hash = _hash_otp(otp_code)
    otp_row.expires_at = datetime.now(timezone.utc) + timedelta(minutes=_otp_expiry_minutes())
    otp_row.attempts = 0
    db.session.commit()

    try:
        send_verification_email(email, otp_code)
    except EmailDeliveryError:
        return jsonify({"error": "Could not resend verification email."}), 500

    return jsonify({"message": "Verification code resent.", "verification_required": True, "email": email})


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    user = User.query.filter_by(email=email).first()
    if not user or not verify_password(password, user.password_hash):
        return jsonify({"error": "Invalid email or password."}), 401

    pending = EmailOtp.query.filter_by(user_id=user.id, email=email).first()
    if pending:
        return jsonify({
            "error": "Please verify your email first.",
            "verification_required": True,
            "email": email,
        }), 403

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
