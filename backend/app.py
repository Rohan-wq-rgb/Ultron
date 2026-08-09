import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

load_dotenv(BASE_DIR / ".env")

from flask import Flask, jsonify
from flask_cors import CORS
from config import Config
from database import db, migrate
from auth_routes import auth_bp
from routes.api_key_routes import api_key_bp
from routes.chat_routes import chat_bp


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)

    db.init_app(app)
    migrate.init_app(app, db)

    origins = app.config["CORS_ORIGINS"]
    CORS(
        app,
        origins=origins,
        supports_credentials=True,
        allow_headers=["Content-Type", "Authorization", "X-CSRF-Token"],
        methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    )

    app.register_blueprint(auth_bp)
    app.register_blueprint(api_key_bp)
    app.register_blueprint(chat_bp)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True, "service": "ultron-ai", "status": "online"})

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(_):
        return jsonify({"error": "ULTRON CORE OFFLINE"}), 500

    with app.app_context():
        db.create_all()

    return app


app = create_app()

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=True)
  
