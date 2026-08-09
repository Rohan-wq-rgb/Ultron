import smtplib
from email.message import EmailMessage

from flask import current_app


class EmailDeliveryError(Exception):
    """Raised when verification email cannot be delivered."""
    pass


def send_verification_email(to_email: str, otp_code: str):
    """
    Send the ULTRON AI email verification OTP.

    SMTP credentials are read from Render environment variables.
    The OTP is sent only by email and is never stored here.
    """

    host = current_app.config.get("SMTP_HOST", "")
    port = int(current_app.config.get("SMTP_PORT", 587))

    username = current_app.config.get(
        "SMTP_USERNAME",
        ""
    )

    password = current_app.config.get(
        "SMTP_PASSWORD",
        ""
    )

    from_email = current_app.config.get(
        "SMTP_FROM_EMAIL",
        username
    )

    from_name = current_app.config.get(
        "SMTP_FROM_NAME",
        "ULTRON AI"
    )

    use_tls = str(
        current_app.config.get(
            "SMTP_USE_TLS",
            "true"
        )
    ).lower() in (
        "1",
        "true",
        "yes",
        "on"
    )

    otp_minutes = int(
        current_app.config.get(
            "OTP_EXPIRES_MINUTES",
            10
        )
    )

    # --------------------------------------------------------
    # Validate SMTP configuration
    # --------------------------------------------------------

    if not host:
        raise EmailDeliveryError(
            "SMTP_HOST is not configured."
        )

    if not from_email:
        raise EmailDeliveryError(
            "SMTP_FROM_EMAIL is not configured."
        )

    if not username:
        raise EmailDeliveryError(
            "SMTP_USERNAME is not configured."
        )

    if not password:
        raise EmailDeliveryError(
            "SMTP_PASSWORD is not configured."
        )

    # --------------------------------------------------------
    # Create email
    # --------------------------------------------------------

    message = EmailMessage()

    message["Subject"] = (
        "Your ULTRON AI verification code"
    )

    message["From"] = (
        f"{from_name} <{from_email}>"
    )

    message["To"] = to_email

    message.set_content(
        f"""
ULTRON AI
Email Verification
==================

Your verification code is:

{otp_code}

This code will expire in {otp_minutes} minutes.

If you did not request this verification code,
you can safely ignore this email.

Do not share this code with anyone.

— ULTRON AI
"""
    )

    # --------------------------------------------------------
    # Send email
    # --------------------------------------------------------

    try:

        with smtplib.SMTP(
            host,
            port,
            timeout=20
        ) as server:

            server.ehlo()

            if use_tls:
                server.starttls()
                server.ehlo()

            server.login(
                username,
                password
            )

            server.send_message(
                message
            )

    except Exception as exc:

        # Do NOT expose SMTP password or OTP
        print(
            "Email delivery failed:",
            type(exc).__name__
        )

        raise EmailDeliveryError(
            "Failed to send verification email."
        ) from exc

    return True
