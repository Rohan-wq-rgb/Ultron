import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class EncryptionError(Exception):
    pass


def _key_bytes() -> bytes:
    key = os.getenv("ENCRYPTION_KEY", "")
    if not key:
        raise EncryptionError("Encryption key is not configured.")
    try:
        raw = base64.urlsafe_b64decode(key.encode("utf-8"))
    except Exception as exc:
        raise EncryptionError("Invalid encryption key format.") from exc
    if len(raw) != 32:
        raise EncryptionError("Encryption key must decode to 32 bytes.")
    return raw


def encrypt_text(plaintext: str) -> str:
    if plaintext is None:
        raise EncryptionError("Cannot encrypt empty value.")
    aesgcm = AESGCM(_key_bytes())
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + ciphertext).decode("utf-8")


def decrypt_text(token: str) -> str:
    if not token:
        raise EncryptionError("Cannot decrypt empty value.")
    blob = base64.urlsafe_b64decode(token.encode("utf-8"))
    nonce, ciphertext = blob[:12], blob[12:]
    aesgcm = AESGCM(_key_bytes())
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode("utf-8")
  
