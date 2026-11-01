from urllib.parse import urlparse

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.schemas import (
    LLMSettingsResponse,
    LLMSettingsUpdate,
    SettingsResponse,
    SettingsUpdate,
)
from app.core.db import get_db
from app.models import TenantSettings, User
from app.services import llm
from app.services.defaults import weights_sum_ok

router = APIRouter(tags=["settings"])


def _error(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


def _mask(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "****"
    return value[:2] + "****" + value[-2:]


def _normalize_base_url(value: str) -> str | None:
    normalized = value.strip().rstrip("/")
    if not normalized:
        return None
    parsed = urlparse(normalized)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("Base URL 必须是有效的 HTTP 或 HTTPS 地址。")
    if parsed.username or parsed.password:
        raise ValueError("Base URL 不能包含用户名或密码。")
    return normalized


def _to_resp(s: TenantSettings) -> SettingsResponse:
    return SettingsResponse(
        health_weights=s.health_weights,
        pql_weights=s.pql_weights,
        pql_threshold=s.pql_threshold,
        silent_risk_days=s.silent_risk_days,
        silent_churn_days=s.silent_churn_days,
        retention_window_days=s.retention_window_days,
        feishu_app_id=s.feishu_app_id,
        feishu_mapping_json=s.feishu_mapping_json,
        llm_base_url=s.llm_base_url,
        llm_model=s.llm_model,
        llm_timeout_sec=s.llm_timeout_sec,
        llm_api_key_masked="********" if s.llm_api_key_enc else None,
        feishu_app_secret_masked=_mask(s.feishu_app_secret_enc),
    )


def _to_llm_resp(s: TenantSettings) -> LLMSettingsResponse:
    return LLMSettingsResponse(
        base_url=s.llm_base_url,
        model=s.llm_model,
        timeout_sec=s.llm_timeout_sec,
        api_key_masked="********" if s.llm_api_key_enc else None,
        has_api_key=bool(s.llm_api_key_enc),
    )


@router.get("/settings", response_model=SettingsResponse)
def get_settings(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SettingsResponse | JSONResponse:
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s:
        return _error(404, "未找到当前租户设置。", "settings_not_found")
    return _to_resp(s)


@router.put("/settings", response_model=SettingsResponse)
def put_settings(
    body: SettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SettingsResponse | JSONResponse:
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s:
        return _error(404, "未找到当前租户设置。", "settings_not_found")
    if body.health_weights is not None:
        if not weights_sum_ok(body.health_weights):
            return _error(400, "健康分权重之和必须为 1.0。", "invalid_health_weights")
        s.health_weights = body.health_weights
    if body.pql_weights is not None:
        if not weights_sum_ok(body.pql_weights):
            return _error(400, "PQL 权重之和必须为 1.0。", "invalid_pql_weights")
        s.pql_weights = body.pql_weights
    if body.llm_base_url is not None:
        try:
            s.llm_base_url = _normalize_base_url(body.llm_base_url)
        except ValueError as exc:
            return _error(400, str(exc), "invalid_llm_base_url")
    for field in (
        "pql_threshold",
        "silent_risk_days",
        "silent_churn_days",
        "retention_window_days",
        "feishu_app_id",
        "feishu_mapping_json",
        "llm_model",
        "llm_timeout_sec",
    ):
        val = getattr(body, field)
        if val is not None:
            setattr(s, field, val)
    if body.feishu_app_secret is not None:
        s.feishu_app_secret_enc = body.feishu_app_secret
    if body.llm_api_key is not None:
        api_key = body.llm_api_key.strip()
        s.llm_api_key_enc = llm.encrypt_api_key(api_key) if api_key else None
    db.commit()
    db.refresh(s)
    return _to_resp(s)


@router.put("/settings/llm", response_model=LLMSettingsResponse)
def put_llm_settings(
    body: LLMSettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> LLMSettingsResponse | JSONResponse:
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s:
        return _error(404, "未找到当前租户设置。", "settings_not_found")
    if body.base_url is not None:
        try:
            s.llm_base_url = _normalize_base_url(body.base_url)
        except ValueError as exc:
            return _error(400, str(exc), "invalid_llm_base_url")
    if body.model is not None:
        s.llm_model = body.model.strip() or None
    if body.api_key is not None:
        api_key = body.api_key.strip()
        s.llm_api_key_enc = llm.encrypt_api_key(api_key) if api_key else None
    if body.timeout_sec is not None:
        if body.timeout_sec < 1 or body.timeout_sec > 300:
            return _error(400, "超时时间必须在 1 到 300 秒之间。", "invalid_llm_timeout")
        s.llm_timeout_sec = body.timeout_sec
    db.commit()
    db.refresh(s)
    return _to_llm_resp(s)


@router.post("/settings/llm/test", response_model=None)
def test_llm(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict[str, object] | JSONResponse:
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not llm.has_complete_config(s):
        return _error(400, "LLM 配置不完整，请填写 Base URL、API Key 和 Model。", "llm_not_configured")
    try:
        llm.chat_completion(
            s,
            [
                {"role": "system", "content": "你是连接测试助手。"},
                {"role": "user", "content": "请只回复：连接成功"},
            ],
        )
    except llm.LLMError as exc:
        return _error(502, str(exc), "llm_test_failed")
    return {"ok": True, "message": "LLM 连接测试成功。"}
