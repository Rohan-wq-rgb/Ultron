import os
from datetime import timedelta


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "dev-secret-change-me")
    SQLALCHEMY_DATABASE_URI = os.getenv("DATABASE_URL", "sqlite:///ultron.db")
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET = os.getenv("JWT_SECRET", SECRET_KEY)
    FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173")
    CORS_ORIGINS = [
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")
        if origin.strip()
    ]
    GITHUB_PAGES_ORIGIN = os.getenv("GITHUB_PAGES_ORIGIN", FRONTEND_URL)
    ENCRYPTION_KEY = os.getenv("ENCRYPTION_KEY", "")
    GROQ_DEFAULT_MODEL = os.getenv("GROQ_DEFAULT_MODEL", "llama-3.3-70b-versatile")
    JWT_COOKIE_NAME = "ultron_token"
    JWT_COOKIE_CSRF_NAME = "ultron_csrf"
    JWT_EXPIRES_DAYS = int(os.getenv("JWT_EXPIRES_DAYS", "7"))
    PERMANENT_SESSION_LIFETIME = timedelta(days=JWT_EXPIRES_DAYS)
  
