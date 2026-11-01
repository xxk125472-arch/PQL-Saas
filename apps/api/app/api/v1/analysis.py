import time

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.schemas import AnalysisRunCreate, AnalysisRunResponse, SkillItem
from app.core.db import get_db
from app.models import AnalysisRun, TenantSettings, User
from app.services import llm
from app.skills.weekly_focus_v1 import (
    build_facts,
    build_llm_messages,
    build_rules_report,
    normalize_params,
    parse_llm_report,
)

router = APIRouter(tags=["analysis"])

OFFICIAL_SKILLS = [
    SkillItem(
        id="weekly_focus_v1",
        name="本周运营焦点",
        description="漏斗解读 + 风险/PQL 名单 + 建议动作汇总",
        enabled=True,
    )
]


def _error(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


def _to_response(run: AnalysisRun) -> AnalysisRunResponse:
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


@router.get("/analysis/skills", response_model=list[SkillItem])
def list_skills(user: User = Depends(get_current_user)) -> list[SkillItem]:
    return OFFICIAL_SKILLS


@router.post("/analysis/runs", response_model=AnalysisRunResponse)
def create_run(
    body: AnalysisRunCreate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisRunResponse | JSONResponse:
    if body.skill_id != "weekly_focus_v1":
        return _error(400, "仅支持官方 Skill weekly_focus_v1。", "skill_not_allowed")
    try:
        params = normalize_params(body.params or {})
    except ValueError as exc:
        return _error(400, str(exc), "invalid_analysis_params")

    start = time.perf_counter()
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).first()
    facts = build_facts(db, user.tenant_id, params)
    report = build_rules_report(facts)
    mode = "rules_only"
    run_error = None

    if settings and settings.llm_api_key_enc:
        if not llm.has_complete_config(settings):
            run_error = "LLM 配置不完整，已回退规则报告。"
        else:
            try:
                content = llm.chat_completion(settings, build_llm_messages(facts), json_mode=True)
                report = parse_llm_report(content, facts)
                mode = "llm"
            except ValueError as exc:
                run_error = f"parse_error：{exc}已回退规则报告。"
            except llm.LLMError as exc:
                run_error = f"{exc}已回退规则报告。"

    run = AnalysisRun(
        tenant_id=user.tenant_id,
        skill_id=body.skill_id,
        params_json=params,
        mode=mode,
        status="success",
        report_md=report,
        error=run_error,
        latency_ms=int((time.perf_counter() - start) * 1000),
    )
    db.add(run)
    db.commit()
    db.refresh(run)
    return _to_response(run)


@router.get("/analysis/runs", response_model=list[AnalysisRunResponse])
def list_runs(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[AnalysisRunResponse]:
    rows = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.tenant_id == user.tenant_id)
        .order_by(AnalysisRun.created_at.desc())
        .limit(20)
        .all()
    )
    return [_to_response(run) for run in rows]


@router.get("/analysis/runs/{run_id}", response_model=AnalysisRunResponse)
def get_run(
    run_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> AnalysisRunResponse | JSONResponse:
    run = (
        db.query(AnalysisRun)
        .filter(AnalysisRun.tenant_id == user.tenant_id, AnalysisRun.id == run_id)
        .first()
    )
    if not run:
        return _error(404, "未找到该分析记录。", "analysis_run_not_found")
    return _to_response(run)
