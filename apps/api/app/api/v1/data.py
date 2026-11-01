"""Synthetic / CSV / Feishu sync endpoints. Synthetic implemented for Day1 demo path."""

from datetime import datetime, timedelta
import random

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models import Customer, Event, ImportJob, Score, TenantSettings, User
from app.services.scoring import compute_health, compute_pql, derive_stage, suggest_action

router = APIRouter(tags=["data"])


def _recompute_customer(db: Session, customer: Customer, settings: TenantSettings) -> None:
    events = db.query(Event).filter(Event.tenant_id == customer.tenant_id, Event.customer_id == customer.id).all()
    types = {e.event_type for e in events}
    last_active = max((e.occurred_at for e in events), default=None)
    customer.last_active_at = last_active
    window_start = datetime.utcnow() - timedelta(days=settings.retention_window_days)
    active_dates = {e.occurred_at.date() for e in events if e.occurred_at >= window_start}
    customer.stage = derive_stage(
        types,
        last_active,
        silent_risk_days=settings.silent_risk_days,
        silent_churn_days=settings.silent_churn_days,
        retention_window_days=settings.retention_window_days,
        active_dates_in_window=len(active_dates),
    )
    now = datetime.utcnow()
    cutoff = now - timedelta(days=14)
    recent = [e for e in events if e.occurred_at >= cutoff]
    features = {e.feature_key for e in recent if e.feature_key}
    health, h_break = compute_health(
        stage=customer.stage,
        last_active_at=last_active,
        event_count_14d=len(recent),
        feature_count_14d=len(features) if features else (None if not recent else 0),
        weights=settings.health_weights,
        now=now,
    )
    pql, p_break = compute_pql(
        stage=customer.stage,
        health=health,
        frequency=h_break["frequency"],
        last_active_at=last_active,
        weights=settings.pql_weights,
        now=now,
    )
    action, reason = suggest_action(
        stage=customer.stage,
        pql_score=pql,
        health_score=health,
        pql_threshold=settings.pql_threshold,
        has_events=bool(events),
    )
    is_pql = pql >= settings.pql_threshold and customer.stage in {"first_value", "reuse", "retention"}
    score = (
        db.query(Score)
        .filter(Score.tenant_id == customer.tenant_id, Score.customer_id == customer.id)
        .first()
    )
    if not score:
        score = Score(tenant_id=customer.tenant_id, customer_id=customer.id)
        db.add(score)
    score.health_score = health
    score.pql_score = pql
    score.is_pql = is_pql
    score.health_breakdown = h_break
    score.pql_breakdown = p_break
    score.suggested_action = action
    score.action_reason = reason
    score.calculated_at = now
    customer.updated_at = now


@router.post("/data/synthetic")
def generate_synthetic(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tid = user.tenant_id
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tid).first()
    if not settings:
        raise RuntimeError("settings missing")

    # delete previous synthetic only
    old = db.query(Customer).filter(Customer.tenant_id == tid, Customer.source == "synthetic").all()
    old_ids = [c.id for c in old]
    if old_ids:
        db.query(Score).filter(Score.tenant_id == tid, Score.customer_id.in_(old_ids)).delete(synchronize_session=False)
        db.query(Event).filter(Event.tenant_id == tid, Event.customer_id.in_(old_ids)).delete(synchronize_session=False)
        db.query(Customer).filter(Customer.tenant_id == tid, Customer.source == "synthetic").delete(synchronize_session=False)
        db.flush()

    job = ImportJob(tenant_id=tid, type="synthetic", status="pending")
    db.add(job)
    db.flush()

    now = datetime.utcnow()
    rng = random.Random(42)
    stages_plan = (
        ["installed"] * 8
        + ["first_value"] * 10
        + ["reuse"] * 8
        + ["retention"] * 6
        + ["at_risk"] * 5
        + ["churned"] * 3
        + ["new"] * 4
    )
    created = 0
    for i, target in enumerate(stages_plan, start=1):
        c = Customer(
            tenant_id=tid,
            external_id=f"syn-{i:03d}",
            name=f"演示客户 {i:03d}",
            stage="new",
            source="synthetic",
        )
        db.add(c)
        db.flush()
        events: list[tuple[str, datetime, str | None]] = []
        base = now - timedelta(days=rng.randint(1, 40))
        if target != "new":
            events.append(("install", base, None))
        if target in {"first_value", "reuse", "retention", "at_risk", "churned"}:
            events.append(("first_value", base + timedelta(days=2), "core_aha"))
        if target in {"reuse", "retention", "at_risk", "churned"}:
            events.append(("reuse", base + timedelta(days=5), "report"))
            events.append(("feature_use", base + timedelta(days=6), "dashboard"))
        if target == "retention":
            events.append(("retention_active", now - timedelta(days=1), "dashboard"))
            events.append(("feature_use", now - timedelta(hours=12), "export"))
        if target == "at_risk":
            # last active ~10 days ago
            events = [(t, now - timedelta(days=10 + j), fk) for j, (t, _, fk) in enumerate(events)] or [
                ("install", now - timedelta(days=20), None),
                ("first_value", now - timedelta(days=18), "core_aha"),
            ]
        if target == "churned":
            events = [
                ("install", now - timedelta(days=60), None),
                ("first_value", now - timedelta(days=55), "core_aha"),
                ("reuse", now - timedelta(days=50), "report"),
            ]
        for et, at, fk in events:
            db.add(
                Event(
                    tenant_id=tid,
                    customer_id=c.id,
                    event_type=et,
                    feature_key=fk,
                    occurred_at=at,
                )
            )
        db.flush()
        _recompute_customer(db, c, settings)
        created += 1

    job.status = "success"
    job.stats_json = {"customers": created}
    db.commit()
    return {"ok": True, "import_id": job.id, "customers": created}


@router.post("/data/csv/customers")
async def upload_customers_csv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Day1 stub: implemented in next slice; keep route for frontend contract
    content = await file.read()
    job = ImportJob(tenant_id=user.tenant_id, type="csv_customers", status="pending", stats_json={"bytes": len(content)})
    db.add(job)
    db.commit()
    return {"ok": True, "import_id": job.id, "message": "CSV customers parser landing next; file accepted"}


@router.post("/data/csv/events")
async def upload_events_csv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    content = await file.read()
    job = ImportJob(tenant_id=user.tenant_id, type="csv_events", status="pending", stats_json={"bytes": len(content)})
    db.add(job)
    db.commit()
    return {"ok": True, "import_id": job.id, "message": "CSV events parser landing next; file accepted"}
