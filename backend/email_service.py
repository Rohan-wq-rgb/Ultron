import smtplib
from email.message import EmailMessage
from flask import current_app


class EmailDeliveryError(Exception):
    pass


def send_verification_email(to_email: str, otp_code: str):
    host = current_app.config.get("SMTP_HOST", "")
    port = int(current_app.config.get("SMTP_PORT", 587))
    username = current_app.config.get("SMTP_USERNAME", "")
    password = current_app.config.get("SMTP_PASSWORD", "")
    use_tls = bool(current_app.config.get("SMTP_USE_TLS", True))
    from_email = current_app.config.get("SMTP_FROM_EMAIL", username)
    from_name = current_app.config.get("SMTP_FROM_NAME", "ULTRON AI")

    if not host or not from_email:
        raise EmailDeliveryError("SMTP is not configured.")

    msg = EmailMessage()
    msg["Subject"] = "Verify your ULTRON AI email"
    msg["From"] = f"{from_name} <{from_email}>"
    msg["To"] = to_email
    msg.set_content(
        f"""ULTRON AI Email Verification

Your verification code is: {otp_code}

This code expires in 10 minutes.

If you did not request this, you can ignore this email.
"""
    )

    try:
        with smtplib.SMTP(host, port, timeout=20) as server:
            if use_tls:
                server.starttls()
            if username:
                server.login(username, password)
            server.send_message(msg)
    except Exception as exc:
        raise EmailDeliveryError("Failed to send verification email.") from exc
