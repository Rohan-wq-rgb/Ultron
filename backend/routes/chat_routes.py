from flask import Blueprint, jsonify, request, g
from sqlalchemy import desc
from database import db
from models import Chat, Message, ApiKey
from auth import require_auth
from groq_service import chat_with_groq, pick_model, GroqServiceError

chat_bp = Blueprint("chat_bp", __name__, url_prefix="/api")


def serialize_chat(chat: Chat):
    return {
        "id": chat.id,
        "title": chat.title,
        "model": chat.model,
        "temperature": chat.temperature,
        "max_tokens": chat.max_tokens,
        "system_prompt": chat.system_prompt,
        "created_at": chat.created_at.isoformat(),
        "updated_at": chat.updated_at.isoformat(),
    }


def serialize_message(message: Message):
    return {
        "id": message.id,
        "chat_id": message.chat_id,
        "role": message.role,
        "content": message.content,
        "created_at": message.created_at.isoformat(),
    }


@chat_bp.get("/chats")
@require_auth
def list_chats():
    chats = Chat.query.filter_by(user_id=g.user_id).order_by(desc(Chat.updated_at)).all()
    return jsonify({"chats": [serialize_chat(chat) for chat in chats]})


@chat_bp.post("/chats")
@require_auth
def create_chat():
    data = request.get_json(silent=True) or {}
    chat = Chat(
        user_id=g.user_id,
        title=(data.get("title") or "New Chat").strip()[:255],
        model=pick_model(data.get("model"), "llama-3.3-70b-versatile"),
        temperature=float(data.get("temperature") or 0.6),
        max_tokens=int(data.get("max_tokens") or 1024),
        system_prompt=(data.get("system_prompt") or Chat.system_prompt.default.arg).strip(),
    )
    db.session.add(chat)
    db.session.commit()
    return jsonify({"chat": serialize_chat(chat)}), 201


@chat_bp.get("/chats/<int:chat_id>")
@require_auth
def get_chat(chat_id: int):
    chat = Chat.query.filter_by(id=chat_id, user_id=g.user_id).first()
    if not chat:
        return jsonify({"error": "Chat not found."}), 404
    return jsonify({
        "chat": serialize_chat(chat),
        "messages": [serialize_message(m) for m in chat.messages],
    })


@chat_bp.patch("/chats/<int:chat_id>")
@require_auth
def update_chat(chat_id: int):
    chat = Chat.query.filter_by(id=chat_id, user_id=g.user_id).first()
    if not chat:
        return jsonify({"error": "Chat not found."}), 404

    data = request.get_json(silent=True) or {}
    if "title" in data:
        chat.title = (data.get("title") or "New Chat").strip()[:255]
    if "model" in data:
        chat.model = pick_model(data.get("model"), chat.model)
    if "temperature" in data:
        chat.temperature = max(0.0, min(2.0, float(data.get("temperature") or chat.temperature)))
    if "max_tokens" in data:
        chat.max_tokens = max(64, min(4096, int(data.get("max_tokens") or chat.max_tokens)))
    if "system_prompt" in data:
        chat.system_prompt = (data.get("system_prompt") or chat.system_prompt).strip()

    db.session.commit()
    return jsonify({"chat": serialize_chat(chat)})


@chat_bp.delete("/chats/<int:chat_id>")
@require_auth
def delete_chat(chat_id: int):
    chat = Chat.query.filter_by(id=chat_id, user_id=g.user_id).first()
    if not chat:
        return jsonify({"error": "Chat not found."}), 404
    db.session.delete(chat)
    db.session.commit()
    return jsonify({"deleted": True})


@chat_bp.post("/chat")
@require_auth
def send_chat():
    data = request.get_json(silent=True) or {}
    user_message = (data.get("message") or "").strip()
    chat_id = data.get("chat_id")
    if not user_message:
        return jsonify({"error": "Message is required."}), 400

    chat = None
    if chat_id:
        chat = Chat.query.filter_by(id=int(chat_id), user_id=g.user_id).first()
    if not chat:
        chat = Chat(
            user_id=g.user_id,
            title=(user_message[:40] or "New Chat"),
            model="llama-3.3-70b-versatile",
            temperature=0.6,
            max_tokens=1024,
        )
        db.session.add(chat)
        db.session.flush()

    api_key_row = ApiKey.query.filter_by(user_id=g.user_id).first()
    if not api_key_row:
        return jsonify({"error": "Groq API key is not configured. Open Settings → AI Configuration to add your key."}), 400

    user_msg = Message(chat_id=chat.id, role="user", content=user_message)
    db.session.add(user_msg)
    db.session.flush()

    messages = [{"role": "system", "content": chat.system_prompt}]
    for m in chat.messages[-20:]:
        if m.id != user_msg.id:
            messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": user_message})

    try:
        answer = chat_with_groq(
            encrypted_api_key=api_key_row.encrypted_api_key,
            messages=messages,
            model=pick_model(chat.model, "llama-3.3-70b-versatile"),
            temperature=chat.temperature,
            max_tokens=chat.max_tokens,
        )
    except GroqServiceError as exc:
        db.session.rollback()
        return jsonify({"error": str(exc)}), 400

    assistant_msg = Message(chat_id=chat.id, role="assistant", content=answer)
    if not chat.title or chat.title == "New Chat":
        chat.title = (user_message[:40] or "New Chat").strip()
    db.session.add(assistant_msg)
    db.session.commit()

    return jsonify({
        "chat": serialize_chat(chat),
        "messages": [serialize_message(m) for m in chat.messages],
        "answer": answer,
    })
          
