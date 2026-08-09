import os


class Config:
    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "dev-secret-change-me"
    )

    JWT_SECRET = os.getenv(
        "JWT_SECRET",
        SECRET_KEY
    )

    JWT_EXPIRES_DAYS = int(
        os.getenv("JWT_EXPIRES_DAYS", "7")
    )

    JWT_COOKIE_NAME = os.getenv(
        "JWT_COOKIE_NAME",
        "ultron_access"
    )

    JWT_COOKIE_CSRF_NAME = os.getenv(
        "JWT_COOKIE_CSRF_NAME",
        "ultron_csrf"
    )

    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "sqlite:///ultron.db"
    )

    SQLALCHEMY_TRACK_MODIFICATIONS = False

    FRONTEND_URL = os.getenv(
        "FRONTEND_URL",
        "http://localhost:5173"
    )

    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv(
            "CORS_ORIGINS",
            "http://localhost:5173"
        ).split(",")
        if origin.strip()
    ]

    # SMTP
    SMTP_HOST = os.getenv("SMTP_HOST", "")
    SMTP_PORT = int(
        os.getenv("SMTP_PORT", "587")
    )
    SMTP_USERNAME = os.getenv(
        "SMTP_USERNAME",
        ""
    )
    SMTP_PASSWORD = os.getenv(
        "SMTP_PASSWORD",
        ""
    )

    SMTP_USE_TLS = os.getenv(
        "SMTP_USE_TLS",
        "true"
    ).lower() in {
        "1",
        "true",
        "yes",
        "on"
    }

    SMTP_FROM_EMAIL = os.getenv(
        "SMTP_FROM_EMAIL",
        SMTP_USERNAME
    )

    SMTP_FROM_NAME = os.getenv(
        "SMTP_FROM_NAME",
        "ULTRON AI"
    )

    # OTP
    OTP_EXPIRES_MINUTES = int(
        os.getenv(
            "OTP_EXPIRES_MINUTES",
            "10"
        )
    )

    OTP_MAX_ATTEMPTS = int(
        os.getenv(
            "OTP_MAX_ATTEMPTS",
            "5"
        )
    )

    # Groq
    GROQ_DEFAULT_MODEL = os.getenv(
        "GROQ_DEFAULT_MODEL",
        "llama-3.3-70b-versatile"
    )
