import base64
import hashlib
import json
from typing import Any

import httpx
from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings as app_settings
from app.models import TenantSettings

LLM_TIMEOUT_SECONDS = 30.0


class LLMError(Exception):
    pass


def _fernet() -> Fernet:
    digest = hashlib.sha256(app_settings.secret_key.encode("utf-8")).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_api_key(api_key: str) -> str:
    return _fernet().encrypt(api_key.encode("utf-8")).decode("ascii")


def decrypt_api_key(encrypted_api_key: str) -> str:
    try:
        return _fernet().decrypt(encrypted_api_key.encode("ascii")).decode("utf-8")
    except (InvalidToken, UnicodeEncodeError, UnicodeDecodeError) as exc:
        raise LLMError("LLM API Key 无法解密，请重新保存。") from exc


def has_complete_config(settings: TenantSettings | None) -> bool:
    return bool(
        settings
        and settings.llm_base_url
        and settings.llm_api_key_enc
        and settings.llm_model
    )


def chat_completion(
    settings: TenantSettings,
    messages: list[dict[str, str]],
    *,
    json_mode: bool = False,
) -> str:
    if not has_complete_config(settings):
        raise LLMError("LLM 配置不完整，请填写 Base URL、API Key 和 Model。")

    api_key = decrypt_api_key(settings.llm_api_key_enc)
    base_url = settings.llm_base_url.rstrip("/")
    url = base_url if base_url.endswith("/chat/completions") else f"{base_url}/chat/completions"
    payload: dict[str, Any] = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": 0.2,
    }
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    try:
        response = httpx.post(
            url,
            headers={"Authorization": f"Bearer {api_key}"},
            json=payload,
            timeout=LLM_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        data = response.json()
        content = data["choices"][0]["message"]["content"]
        if not isinstance(content, str) or not content.strip():
            raise ValueError("empty content")
        return content
    except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LLMError("LLM 调用失败，请检查配置或稍后重试。") from exc
