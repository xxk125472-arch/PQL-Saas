from datetime import datetime
import time

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.schemas import AnalysisRunCreate, AnalysisRunResponse, SkillItem
from app.core.db import get_db
from app.models import AnalysisRun, Customer, Score, TenantSettings, User
from app.skills.weekly_focus_v1 import build_rules_report

router = APIRouter(tags=["analysis"])

OFFICIAL_SKILLS = [
    SkillItem(
        id="weekly_focus_v1",
        name="本周运营焦点",
        description="漏斗解读 + 风险/PQL 名单 + 建议动作汇总",
        enabled=True,
    )
]


@router.get("/analysis/skills", response_model=list[SkillItem])
def list_skills(user: User = Depends(get_current_user)) -> list[SkillItem]:
    return OFFICIAL_SKILLS


@router.post("/analysis/runs", response_model=AnalysisRunResponse)
def create_run(
    body: AnalysisRunCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisRunResponse:
    if body.skill_id != "weekly_focus_v1":
        raise HTTPException(status_code=400, detail="skill not allowed")
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    start = time.time()
    mode = "llm" if settings and settings.llm_api_key_enc else "rules_only"
    # V1 Day1: always rules_only until LLM gateway lands; if key present still rules for now with note
    report = build_rules_report(db, user.tenant_id, body.params or {})
    if mode == "llm":
        # hard gateway placeholder — keep rules until httpx chat completion is wired
        mode = "rules_only"
        report = "> Banner: LLM 网关下一迭代接入；本次仍为规则回退。\n\n" + report
    else:
        report = "> Banner: 当前为规则回退，未调用 LLM。\n\n" + report

    run = AnalysisRun(
        tenant_id=user.tenant_id,
        skill_id=body.skill_id,
        params_json=body.params or {},
        mode=mode,
        status="success",
        report_md=report,
        latency_ms=int((time.time() - start) * 1000),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return AnalysisRunResponse(
        id=run.id,
        skill_id=run.skill_id,
        params_json=run.params_json,
        mode=run.mode,
        status=run.status,
        report_md=run.report_md,
        error=run.error,
        latency_ms=run.latency_ms,
        created_at=run.created_at,
    )


@router.get("/analysis/runs", response_model=list[AnalysisRunResponse])
def list_runs(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[AnalysisRunResponse]:
    rows = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.tenant_id == user.tenant_id)
        .order_by(AnalysisRun.created_at.desc())
        .limit(20)
        .all()
    )
    return [
        AnalysisRunResponse(
            id=r.id,
            skill_id=r.skill_id,
            params_json=r.params_json,
            mode=r.mode,
            status=r.status,
            report_md=r.report_md,
            error=r.error,
            latency_ms=r.latency_ms,
            created_at=r.created_at,
        )
        for r in rows
    ]


@router.get("/analysis/runs/{run_id}", response_model=AnalysisRunResponse)
def get_run(run_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> AnalysisRunResponse:
    r = db.query(AnalysisRun).filter(AnalysisRun.tenant_id == user.tenant_id, AnalysisRun.id == run_id).first()
    if not r:
        raise HTTPException(status_code=404, detail="run not found")
    return AnalysisRunResponse(
        id=r.id,
        skill_id=r.skill_id,
        params_json=r.params_json,
        mode=r.mode,
        status=r.status,
        report_md=r.report_md,
        error=r.error,
        latency_ms=r.latency_ms,
        created_at=r.created_at,
    )
