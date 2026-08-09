# backend/otp_service.py

import os
import secrets
import smtplib
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage


OTP_EXPIRY_MINUTES = int(os.getenv("OTP_EXPIRY_MINUTES", "10"))


def generate_otp():
    """Generate a secure 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"


def get_expiry():
    """Return OTP expiry timestamp."""
    return datetime.now(timezone.utc) + timedelta(
        minutes=OTP_EXPIRY_MINUTES
    )


def send_otp_email(email, otp):
    """
    Send OTP to user's email.

    SMTP credentials must come from Render environment variables.
    """

    smtp_host = os.getenv("SMTP_HOST")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))
    smtp_username = os.getenv("SMTP_USERNAME")
    smtp_password = os.getenv("SMTP_PASSWORD")
    from_email = os.getenv("SMTP_FROM_EMAIL") or smtp_username

    if not smtp_host:
        raise RuntimeError("SMTP_HOST is not configured")

    if not smtp_username:
        raise RuntimeError("SMTP_USERNAME is not configured")

    if not smtp_password:
        raise RuntimeError("SMTP_PASSWORD is not configured")

    if not from_email:
        raise RuntimeError("SMTP_FROM_EMAIL is not configured")

    message = EmailMessage()

    message["Subject"] = "Your ULTRON AI verification code"
    message["From"] = from_email
    message["To"] = email

    message.set_content(
        f"""
ULTRON AI

Your email verification code is:

{otp}

This code will expire in {OTP_EXPIRY_MINUTES} minutes.

If you did not request this code, you can safely ignore this email.

— ULTRON AI
"""
    )

    try:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()

            server.login(
                smtp_username,
                smtp_password
            )

            server.send_message(message)

        return True

    except Exception as exc:
        # Never expose SMTP credentials or OTP in the error.
        print(f"OTP email delivery failed: {type(exc).__name__}")
        return False
