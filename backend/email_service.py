import smtplib
from email.message import EmailMessage
from flask import current_app


class EmailDeliveryError(Exception):
    """Raised when OTP email delivery fails."""
    pass


def send_verification_email(to_email: str, otp_code: str) -> None:
    host = current_app.config.get("SMTP_HOST", "").strip()
    port = int(current_app.config.get("SMTP_PORT", 587))
    username = current_app.config.get("SMTP_USERNAME", "").strip()
    password = current_app.config.get("SMTP_PASSWORD", "")
    use_tls = bool(current_app.config.get("SMTP_USE_TLS", True))
    from_email = (
        current_app.config.get("SMTP_FROM_EMAIL", "").strip()
        or username
    )
    from_name = (
        current_app.config.get("SMTP_FROM_NAME", "ULTRON AI").strip()
    )

    if not host:
        raise EmailDeliveryError("SMTP_HOST is not configured.")

    if not username:
        raise EmailDeliveryError("SMTP_USERNAME is not configured.")

    if not password:
        raise EmailDeliveryError("SMTP_PASSWORD is not configured.")

    if not from_email:
        raise EmailDeliveryError("SMTP_FROM_EMAIL is not configured.")

    message = EmailMessage()
    message["Subject"] = "ULTRON AI — Email Verification Code"
    message["From"] = f"{from_name} <{from_email}>"
    message["To"] = to_email

    message.set_content(
        f"""Hello,

Welcome to ULTRON AI.

Your email verification code is:

{otp_code}

This code will expire in 10 minutes.

If you did not create an ULTRON AI account, you can safely ignore this email.

Regards,
ULTRON AI
"""
    )

    try:
        with smtplib.SMTP(host, port, timeout=30) as server:
            server.ehlo()

            if use_tls:
                server.starttls()
                server.ehlo()

            server.login(username, password)
            server.send_message(message)

    except Exception as exc:
        # Never log the email password or OTP.
        current_app.logger.error(
            "OTP email delivery failed: %s",
            type(exc).__name__,
        )
        raise EmailDeliveryError(
            "Failed to send verification email."
        ) from exc
