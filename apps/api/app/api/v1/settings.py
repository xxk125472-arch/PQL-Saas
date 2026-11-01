from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.schemas import SettingsResponse, SettingsUpdate
from app.core.db import get_db
from app.models import TenantSettings, User
from app.services.defaults import weights_sum_ok

router = APIRouter(tags=["settings"])


def _mask(value: str | None) -> str | None:
    if not value:
        return None
    if len(value) <= 4:
        return "****"
    return value[:2] + "****" + value[-2:]


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
        llm_api_key_masked=_mask(s.llm_api_key_enc),
        feishu_app_secret_masked=_mask(s.feishu_app_secret_enc),
    )


@router.get("/settings", response_model=SettingsResponse)
def get_settings(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> SettingsResponse:
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="settings not found")
    return _to_resp(s)


@router.put("/settings", response_model=SettingsResponse)
def put_settings(
    body: SettingsUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SettingsResponse:
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s:
        raise HTTPException(status_code=404, detail="settings not found")
    if body.health_weights is not None:
        if not weights_sum_ok(body.health_weights):
            raise HTTPException(status_code=400, detail="health_weights must sum to 1.0", )
        s.health_weights = body.health_weights
    if body.pql_weights is not None:
        if not weights_sum_ok(body.pql_weights):
            raise HTTPException(status_code=400, detail="pql_weights must sum to 1.0")
        s.pql_weights = body.pql_weights
    for field in (
        "pql_threshold",
        "silent_risk_days",
        "silent_churn_days",
        "retention_window_days",
        "feishu_app_id",
        "feishu_mapping_json",
        "llm_base_url",
        "llm_model",
        "llm_timeout_sec",
    ):
        val = getattr(body, field)
        if val is not None:
            setattr(s, field, val)
    if body.feishu_app_secret is not None:
        s.feishu_app_secret_enc = body.feishu_app_secret
    if body.llm_api_key is not None:
        s.llm_api_key_enc = body.llm_api_key
    db.commit()
    db.refresh(s)
    return _to_resp(s)


@router.post("/settings/llm/test")
def test_llm(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s or not s.llm_api_key_enc or not s.llm_base_url:
        raise HTTPException(status_code=400, detail="LLM not configured")
    return {"ok": True, "message": "credentials present; live ping will be wired with analysis gateway"}
