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

from email_service import (
    send_verification_email,
    EmailDeliveryError,
)


auth_bp = Blueprint(
    "auth_bp",
    __name__,
    url_prefix="/api/auth"
)


# ============================================================
# OTP HELPERS
# ============================================================

def _generate_otp():
    """
    Generate a secure 6-digit OTP.
    """
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(code):
    """
    Hash OTP before storing it in database.
    """
    salt = bcrypt.gensalt(rounds=12)

    return bcrypt.hashpw(
        code.encode("utf-8"),
        salt
    ).decode("utf-8")


def _verify_otp(code, code_hash):
    """
    Verify entered OTP against stored bcrypt hash.
    """
    try:
        return bcrypt.checkpw(
            code.encode("utf-8"),
            code_hash.encode("utf-8")
        )
    except Exception:
        return False


def _otp_expiry_minutes():
    """
    Read OTP expiry from Render environment.
    """
    from flask import current_app

    return int(
        current_app.config.get(
            "OTP_EXPIRES_MINUTES",
            10
        )
    )


def _otp_max_attempts():
    """
    Maximum wrong OTP attempts.
    """
    from flask import current_app

    return int(
        current_app.config.get(
            "OTP_MAX_ATTEMPTS",
            5
        )
    )


# ============================================================
# CREATE / REPLACE OTP
# ============================================================

def _create_and_send_otp(user):
    """
    Prepare a new OTP.

    IMPORTANT:
    This function does NOT commit.
    The caller commits only after the email
    has been successfully sent.
    """

    existing_otp = EmailOtp.query.filter_by(
        user_id=user.id
    ).first()

    if existing_otp:
        db.session.delete(existing_otp)
        db.session.flush()

    otp_code = _generate_otp()

    otp_row = EmailOtp(
        user_id=user.id,
        email=user.email,
        code_hash=_hash_otp(otp_code),
        expires_at=(
            datetime.now(timezone.utc)
            + timedelta(
                minutes=_otp_expiry_minutes()
            )
        ),
        attempts=0,
    )

    db.session.add(otp_row)
    db.session.flush()

    try:
        send_verification_email(
            user.email,
            otp_code
        )
    except EmailDeliveryError:
        # No commit happened.
        # Rollback restores the previous state.
        raise

    return True


# ============================================================
# REGISTER
# ============================================================

@auth_bp.post("/register")
def register():

    data = request.get_json(
        silent=True
    ) or {}

    email = (
        data.get("email") or ""
    ).strip().lower()

    password = (
        data.get("password") or ""
    )

    # Validate email
    if not email or "@" not in email:
        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    # Validate password
    if len(password) < 8:
        return jsonify({
            "error": "Password must be at least 8 characters long."
        }), 400

    # Check existing account
    existing_user = User.query.filter_by(
        email=email
    ).first()

    if existing_user:

        # Check whether email is still waiting for verification
        pending_otp = EmailOtp.query.filter_by(
            user_id=existing_user.id
        ).first()

        if pending_otp:

            try:
                _create_and_send_otp(
                    existing_user
                )

            except EmailDeliveryError:
                return jsonify({
                    "error": (
                        "Could not send verification email. "
                        "Please check the email service configuration."
                    ),
                    "verification_required": True,
                    "email": email,
                }), 500

            return jsonify({
                "message": (
                    "This account is not verified yet. "
                    "A new OTP has been sent."
                ),
                "verification_required": True,
                "email": email,
            }), 200

        # Account already exists and is verified
        return jsonify({
            "error": (
                "An account with this email already exists. "
                "Please login instead."
            )
        }), 409

    # Create new user
user = User(
    email=email,
    password_hash=hash_password(password)
)

db.session.add(user)

try:
    db.session.flush()

    # Email must succeed BEFORE commit.
    _create_and_send_otp(user)

    # Commit only after email was sent.
    db.session.commit()

except EmailDeliveryError:
    db.session.rollback()

    return jsonify({
        "error": (
            "We could not send the verification email. "
            "Your account was not created. "
            "Please try again."
        )
    }), 500

except IntegrityError:
    db.session.rollback()

    return jsonify({
        "error": (
            "An account with this email already exists."
        )
    }), 409

return jsonify({
    "message": "Verification code sent to your email.",
    "verification_required": True,
    "email": email,
}), 201

# ============================================================
# VERIFY OTP
# ============================================================

@auth_bp.post("/verify-otp")
def verify_otp():

    data = request.get_json(
        silent=True
    ) or {}

    email = (
        data.get("email") or ""
    ).strip().lower()

    otp = (
        data.get("otp") or ""
    ).strip()

    # Validate email
    if not email or "@" not in email:
        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    # Validate OTP
    if (
        not otp
        or len(otp) != 6
        or not otp.isdigit()
    ):
        return jsonify({
            "error": "Please enter the 6-digit OTP."
        }), 400

    # Find user
    user = User.query.filter_by(
        email=email
    ).first()

    if not user:
        return jsonify({
            "error": "User not found."
        }), 404

    # Find OTP
    otp_row = EmailOtp.query.filter_by(
        user_id=user.id,
        email=email
    ).first()

    if not otp_row:
        return jsonify({
            "error": (
                "No pending verification found. "
                "Please request a new OTP."
            )
        }), 400

    # Current time
    now = datetime.now(timezone.utc)

    # Check expiry
    if otp_row.expires_at < now:

        db.session.delete(otp_row)
        db.session.commit()

        return jsonify({
            "error": (
                "OTP expired. "
                "Please request a new code."
            )
        }), 400

    # Check maximum attempts
    if otp_row.attempts >= _otp_max_attempts():

        db.session.delete(otp_row)
        db.session.commit()

        return jsonify({
            "error": (
                "Too many incorrect attempts. "
                "Please request a new OTP."
            )
        }), 429

    # Increase attempt count
    otp_row.attempts += 1

    # Check OTP
    if not _verify_otp(
        otp,
        otp_row.code_hash
    ):

        db.session.commit()

        remaining = max(
            0,
            _otp_max_attempts()
            - otp_row.attempts
        )

        return jsonify({
            "error": "Invalid OTP.",
            "remaining_attempts": remaining
        }), 400

    # OTP correct
    db.session.delete(
        otp_row
    )

    db.session.commit()

    # Create JWT
    token = create_jwt(
        user.id
    )

    response = jsonify({
        "message": (
            "Email verified successfully."
        ),
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
        },
    })

    return set_auth_cookies(
        response,
        user.id
    )


# ============================================================
# RESEND OTP
# ============================================================

@auth_bp.post("/resend-otp")
def resend_otp():

    data = request.get_json(
        silent=True
    ) or {}

    email = (
        data.get("email") or ""
    ).strip().lower()

    if not email or "@" not in email:
        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    user = User.query.filter_by(
        email=email
    ).first()

    if not user:
        return jsonify({
            "error": "User not found."
        }), 404

    # If no pending OTP exists,
    # account is already verified.
    pending_otp = EmailOtp.query.filter_by(
        user_id=user.id
    ).first()

    if not pending_otp:
        return jsonify({
            "error": "Email is already verified."
        }), 400

try:
    _create_and_send_otp(user)

    db.session.commit()

except EmailDeliveryError:
    db.session.rollback()

    return jsonify({
        "error": (
            "Could not resend verification email. "
            "Please try again later."
        )
    }), 500

    return jsonify({
        "message": "Verification code resent.",
        "verification_required": True,
        "email": email,
    }), 200


# ============================================================
# LOGIN
# ============================================================

@auth_bp.post("/login")
def login():

    data = request.get_json(
        silent=True
    ) or {}

    email = (
        data.get("email") or ""
    ).strip().lower()

    password = (
        data.get("password") or ""
    )

    # Find user
    user = User.query.filter_by(
        email=email
    ).first()

    # Check credentials
    if (
        not user
        or not verify_password(
            password,
            user.password_hash
        )
    ):
        return jsonify({
            "error": "Invalid email or password."
        }), 401

    # Check email verification
    pending_otp = EmailOtp.query.filter_by(
        user_id=user.id
    ).first()

    if pending_otp:

        return jsonify({
            "error": (
                "Please verify your email before logging in."
            ),
            "verification_required": True,
            "email": email,
        }), 403

    # Create JWT
    token = create_jwt(
        user.id
    )

    response = jsonify({
        "message": "Login successful.",
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
        },
    })

    return set_auth_cookies(
        response,
        user.id
    )


# ============================================================
# LOGOUT
# ============================================================

@auth_bp.post("/logout")
@require_auth
def logout():

    response = jsonify({
        "message": "Logged out."
    })

    return clear_auth_cookies(
        response
    )


# ============================================================
# CURRENT USER
# ============================================================

@auth_bp.get("/me")
@require_auth
def me():

    user_id = get_current_user_id()

    user = User.query.get(
        user_id
    )

    if not user:
        return jsonify({
            "error": "User not found."
        }), 404

    return jsonify({
        "user": {
            "id": user.id,
            "email": user.email,
            "created_at": user.created_at.isoformat(),
        }
    })
