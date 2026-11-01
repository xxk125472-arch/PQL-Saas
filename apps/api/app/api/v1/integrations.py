from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import ImportJob, TenantSettings, User

router = APIRouter(tags=["integrations"])


@router.post("/integrations/feishu/sync")
def feishu_sync(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    s = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    if not s or not s.feishu_app_id or not s.feishu_app_secret_enc:
        raise HTTPException(status_code=400, detail="feishu credentials missing")
    mapping = s.feishu_mapping_json or {}
    required = ["external_id", "name", "event_type", "occurred_at"]
    missing = [k for k in required if k not in mapping]
    if missing:
        raise HTTPException(status_code=400, detail=f"mapping missing: {', '.join(missing)}")
    job = ImportJob(tenant_id=user.tenant_id, type="feishu", status="failed", error="Feishu read sync client landing next slice")
    db.add(job)
    db.commit()
    raise HTTPException(status_code=501, detail="Feishu sync client not implemented yet", )
