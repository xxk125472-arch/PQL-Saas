import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class SecretDecryptionError(ValueError):
    pass


def _fernet() -> Fernet:
    digest = hashlib.sha256(settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_secret(value: str) -> str:
    return _fernet().encrypt(value.encode("utf-8")).decode("ascii")


def decrypt_secret(value: str) -> str:
    try:
        return _fernet().decrypt(value.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeError, ValueError) as exc:
        raise SecretDecryptionError("密钥解密失败") from exc
