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
    url_prefix="/api/auth",
)


# ============================================================
# OTP HELPERS
# ============================================================

def _generate_otp() -> str:
    """Generate a secure 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def _hash_otp(code: str) -> str:
    """Hash OTP using bcrypt."""
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(
        code.encode("utf-8"),
        salt
    ).decode("utf-8")


def _verify_otp(code: str, code_hash: str) -> bool:
    """Verify OTP against its bcrypt hash."""
    try:
        return bcrypt.checkpw(
            code.encode("utf-8"),
            code_hash.encode("utf-8"),
        )
    except Exception:
        return False


def _otp_expiry_minutes() -> int:
    """OTP lifetime from application configuration."""
    from flask import current_app

    return int(
        current_app.config.get(
            "OTP_EXPIRES_MINUTES",
            10,
        )
    )


def _otp_max_attempts() -> int:
    """Maximum OTP verification attempts."""
    from flask import current_app

    return int(
        current_app.config.get(
            "OTP_MAX_ATTEMPTS",
            5,
        )
    )


def _create_and_send_otp(user: User) -> None:
    """
    Create a new OTP, save only its bcrypt hash,
    and send the plain OTP to the user's email.

    The caller is responsible for committing the transaction.
    """

    otp_code = _generate_otp()

    expires_at = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=_otp_expiry_minutes()
        )
    )

    # Remove any previous OTP.
    existing_otp = EmailOtp.query.filter_by(
        user_id=user.id
    ).first()

    if existing_otp:
        existing_otp.email = user.email
        existing_otp.code_hash = _hash_otp(otp_code)
        existing_otp.expires_at = expires_at
        existing_otp.attempts = 0

        otp_row = existing_otp

    else:
        otp_row = EmailOtp(
            user_id=user.id,
            email=user.email,
            code_hash=_hash_otp(otp_code),
            expires_at=expires_at,
            attempts=0,
        )

        db.session.add(otp_row)

    # Flush first so database errors are detected before email.
    db.session.flush()

    try:
        send_verification_email(
            user.email,
            otp_code,
        )

    except EmailDeliveryError:
        raise


def _normalize_email(value) -> str:
    """Normalize an email address."""
    return (value or "").strip().lower()


def _is_valid_email(email: str) -> bool:
    """
    Basic email validation.
    Detailed email validation should be handled by the
    email provider as well.
    """
    return (
        bool(email)
        and "@" in email
        and "." in email.split("@")[-1]
    )


def _get_user_from_email(email: str):
    return User.query.filter_by(
        email=email
    ).first()


# ============================================================
# REGISTER
# ============================================================

@auth_bp.post("/register")
def register():

    data = request.get_json(silent=True) or {}

    email = _normalize_email(
        data.get("email")
    )

    password = data.get("password") or ""

    # ----------------------------
    # Validation
    # ----------------------------

    if not _is_valid_email(email):
        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    if len(password) < 8:
        return jsonify({
            "error": "Password must be at least 8 characters long."
        }), 400

    # ----------------------------
    # Existing user
    # ----------------------------

    existing_user = _get_user_from_email(email)

    if existing_user:

        pending_otp = EmailOtp.query.filter_by(
            user_id=existing_user.id
        ).first()

        if pending_otp:

            return jsonify({
                "error": (
                    "Email verification is still pending. "
                    "Please verify your email or resend the OTP."
                ),
                "verification_required": True,
                "email": email,
            }), 409

        return jsonify({
            "error": (
                "An account with this email already exists. "
                "Please login instead."
            ),
        }), 409

    # ----------------------------
    # Create user
    # ----------------------------

    user = User(
        email=email,
        password_hash=hash_password(password),
    )

    db.session.add(user)

    try:

        # Get user.id before creating OTP.
        db.session.flush()

        _create_and_send_otp(user)

        # Save user + OTP.
        db.session.commit()

    except EmailDeliveryError:

        db.session.rollback()

        return jsonify({
            "error": (
                "Account could not be created because "
                "the verification email could not be sent."
            ),
            "verification_required": False,
        }), 500

    except IntegrityError:

        db.session.rollback()

        return jsonify({
            "error": (
                "An account with this email already exists."
            ),
        }), 409

    except Exception:

        db.session.rollback()

        return jsonify({
            "error": "Registration failed. Please try again."
        }), 500

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

    data = request.get_json(silent=True) or {}

    email = _normalize_email(
        data.get("email")
    )

    otp = str(
        data.get("otp") or ""
    ).strip()

    # ----------------------------
    # Validation
    # ----------------------------

    if not _is_valid_email(email):
        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    if (
        len(otp) != 6
        or not otp.isdigit()
    ):
        return jsonify({
            "error": "Please enter the 6-digit OTP."
        }), 400

    # ----------------------------
    # Find user
    # ----------------------------

    user = _get_user_from_email(email)

    if not user:
        return jsonify({
            "error": "User not found."
        }), 404

    # ----------------------------
    # Find OTP
    # ----------------------------

    otp_row = EmailOtp.query.filter_by(
        user_id=user.id,
        email=email,
    ).first()

    if not otp_row:

        return jsonify({
            "error": "Email is already verified."
        }), 400

    # ----------------------------
    # Check attempts
    # ----------------------------

    max_attempts = _otp_max_attempts()

    if otp_row.attempts >= max_attempts:

        db.session.delete(otp_row)
        db.session.commit()

        return jsonify({
            "error": (
                "Too many incorrect attempts. "
                "Please request a new OTP."
            ),
        }), 429

    # ----------------------------
    # Check expiration
    # ----------------------------

    now = datetime.now(timezone.utc)

    expires_at = otp_row.expires_at

    # Handle databases that return naive datetime.
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(
            tzinfo=timezone.utc
        )

    if expires_at <= now:

        db.session.delete(otp_row)
        db.session.commit()

        return jsonify({
            "error": "OTP expired. Please resend the code."
        }), 400

    # ----------------------------
    # Increment attempts
    # ----------------------------

    otp_row.attempts += 1

    # ----------------------------
    # Verify OTP
    # ----------------------------

    if not _verify_otp(
        otp,
        otp_row.code_hash,
    ):

        db.session.commit()

        remaining = max(
            0,
            max_attempts - otp_row.attempts,
        )

        return jsonify({
            "error": "Invalid OTP.",
            "attempts_remaining": remaining,
        }), 400

    # ----------------------------
    # OTP verified
    # ----------------------------

    db.session.delete(otp_row)
    db.session.commit()

    # ----------------------------
    # Create authentication token
    # ----------------------------

    token = create_jwt(
        user.id
    )

    response = jsonify({
        "message": "Email verified successfully.",
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
        },
    })

    return set_auth_cookies(
        response,
        user.id,
    )


# ============================================================
# RESEND OTP
# ============================================================

@auth_bp.post("/resend-otp")
def resend_otp():

    data = request.get_json(silent=True) or {}

    email = _normalize_email(
        data.get("email")
    )

    if not _is_valid_email(email):
        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    # ----------------------------
    # Find user
    # ----------------------------

    user = _get_user_from_email(email)

    if not user:

        return jsonify({
            "error": "User not found."
        }), 404

    # ----------------------------
    # Check pending OTP
    # ----------------------------

    otp_row = EmailOtp.query.filter_by(
        user_id=user.id,
        email=email,
    ).first()

    if not otp_row:

        return jsonify({
            "error": "Email is already verified."
        }), 400

    # ----------------------------
    # Generate new OTP
    # ----------------------------

    otp_code = _generate_otp()

    otp_row.code_hash = _hash_otp(
        otp_code
    )

    otp_row.expires_at = (
        datetime.now(timezone.utc)
        + timedelta(
            minutes=_otp_expiry_minutes()
        )
    )

    otp_row.attempts = 0

    try:

        # Save the new OTP before sending.
        db.session.commit()

    except Exception:

        db.session.rollback()

        return jsonify({
            "error": "Could not create a new OTP."
        }), 500

    # ----------------------------
    # Send email
    # ----------------------------

    try:

        send_verification_email(
            email,
            otp_code,
        )

    except EmailDeliveryError:

        return jsonify({
            "error": (
                "Could not send the verification email. "
                "Please try again later."
            ),
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

    data = request.get_json(silent=True) or {}

    email = _normalize_email(
        data.get("email")
    )

    password = data.get("password") or ""

    # ----------------------------
    # Validation
    # ----------------------------

    if not _is_valid_email(email):

        return jsonify({
            "error": "Please provide a valid email address."
        }), 400

    if not password:

        return jsonify({
            "error": "Please enter your password."
        }), 400

    # ----------------------------
    # Find user
    # ----------------------------

    user = _get_user_from_email(email)

    if not user:

        return jsonify({
            "error": "Invalid email or password."
        }), 401

    # ----------------------------
    # Verify password
    # ----------------------------

    if not verify_password(
        password,
        user.password_hash,
    ):

        return jsonify({
            "error": "Invalid email or password."
        }), 401

    # ----------------------------
    # Check email verification
    # ----------------------------

    pending_otp = EmailOtp.query.filter_by(
        user_id=user.id,
        email=email,
    ).first()

    if pending_otp:

        return jsonify({
            "error": "Please verify your email first.",
            "verification_required": True,
            "email": email,
        }), 403

    # ----------------------------
    # Create JWT
    # ----------------------------

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
        user.id,
    )


# ============================================================
# LOGOUT
# ============================================================

@auth_bp.post("/logout")
@require_auth
def logout():

    response = jsonify({
        "message": "Logged out successfully."
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
            "created_at": (
                user.created_at.isoformat()
                if user.created_at
                else None
            ),
        }
    }), 200
