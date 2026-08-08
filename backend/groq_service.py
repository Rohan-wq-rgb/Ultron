import requests
from groq import Groq
from encryption import decrypt_text, EncryptionError


ALLOWED_MODELS = {
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "mixtral-8x7b-32768",
}


class GroqServiceError(Exception):
    pass


def validate_groq_key(api_key: str) -> bool:
    if not api_key:
        return False
    try:
        response = requests.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=20,
        )
        return response.status_code == 200
    except requests.RequestException:
        return False


def pick_model(requested: str | None, default_model: str) -> str:
    model = (requested or default_model or "").strip()
    if model in ALLOWED_MODELS:
        return model
    return default_model if default_model in ALLOWED_MODELS else "llama-3.3-70b-versatile"


def chat_with_groq(*, encrypted_api_key: str, messages: list[dict], model: str, temperature: float, max_tokens: int):
    try:
        api_key = decrypt_text(encrypted_api_key)
    except EncryptionError as exc:
        raise GroqServiceError("Stored API key could not be decrypted.") from exc

    client = Groq(api_key=api_key)
    try:
        completion = client.chat.completions.create(
            model=model,
            messages=messages,
            temperature=temperature,
            max_completion_tokens=max_tokens,
        )
        return completion.choices[0].message.content or ""
    except Exception as exc:
        msg = str(exc).lower()
        if "rate" in msg:
            raise GroqServiceError("Groq rate limit reached.") from exc
        if "api key" in msg or "authentication" in msg or "unauthorized" in msg:
            raise GroqServiceError("The configured Groq API key appears to be invalid.") from exc
        raise GroqServiceError("Groq request failed.") from exc
      
