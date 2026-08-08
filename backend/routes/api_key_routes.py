from flask import Blueprint, jsonify, request, g
from database import db
from models import ApiKey
from auth import require_auth
from encryption import encrypt_text
from groq_service import validate_groq_key

api_key_bp = Blueprint("api_key_bp", __name__, url_prefix="/api/api-key")


@api_key_bp.post("")
@require_auth
def save_api_key():
    data = request.get_json(silent=True) or {}
    api_key = (data.get("api_key") or "").strip()
    if not api_key:
        return jsonify({"error": "Groq API key is required."}), 400
    if not validate_groq_key(api_key):
        return jsonify({"error": "The configured Groq API key appears to be invalid."}), 400

    encrypted = encrypt_text(api_key)
    existing = ApiKey.query.filter_by(user_id=g.user_id).first()
    if existing:
        existing.encrypted_api_key = encrypted
    else:
        db.session.add(ApiKey(user_id=g.user_id, encrypted_api_key=encrypted))
    db.session.commit()
    return jsonify({"configured": True})


@api_key_bp.get("/status")
@require_auth
def api_key_status():
    existing = ApiKey.query.filter_by(user_id=g.user_id).first()
    return jsonify({"configured": bool(existing)})


@api_key_bp.delete("")
@require_auth
def delete_api_key():
    existing = ApiKey.query.filter_by(user_id=g.user_id).first()
    if existing:
        db.session.delete(existing)
        db.session.commit()
    return jsonify({"configured": False})
  
