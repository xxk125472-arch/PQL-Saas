"""Health / PQL scoring + suggested action. Full formula per PRD §4."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import event, inspect
from sqlalchemy.orm import Session

from app.core.timeutil import silent_days, utcnow
from app.models import Customer, Event, Score, TenantSettings

STAGE_PROGRESS = {
    "new": 10,
    "installed": 30,
    "first_value": 55,
    "reuse": 75,
    "retention": 100,
    "at_risk": 40,
    "churned": 15,
}

PQL_STAGES = {"first_value", "reuse", "retention"}
SCORING_SETTINGS_FIELDS = {
    "health_weights",
    "pql_weights",
    "pql_threshold",
    "silent_risk_days",
    "silent_churn_days",
    "retention_window_days",
}


def _clamp(v: float) -> float:
    return round(max(0.0, min(100.0, v)), 2)


def recency_score(last_active_at: datetime | None, now: datetime) -> float:
    if last_active_at is None:
        return 0.0
    days = max(0.0, (now - last_active_at).total_seconds() / 86400.0)
    if days <= 0:
        return 100.0
    if days >= 14:
        return 0.0
    return 100.0 * (1.0 - days / 14.0)


def frequency_score(event_count_14d: int) -> float:
    if event_count_14d <= 0:
        return 0.0
    if event_count_14d >= 10:
        return 100.0
    return 100.0 * event_count_14d / 10.0


def depth_score(feature_count_14d: int | None) -> float:
    if feature_count_14d is None:
        return 50.0
    if feature_count_14d <= 0:
        return 0.0
    if feature_count_14d >= 5:
        return 100.0
    return 100.0 * feature_count_14d / 5.0


def compute_health(
    *,
    stage: str,
    last_active_at: datetime | None,
    event_count_14d: int,
    feature_count_14d: int | None,
    weights: dict[str, float],
    now: datetime | None = None,
) -> tuple[float, dict[str, Any]]:
    now = now or utcnow()
    parts = {
        "recency": recency_score(last_active_at, now),
        "frequency": frequency_score(event_count_14d),
        "depth": depth_score(feature_count_14d),
        "stage_progress": float(STAGE_PROGRESS.get(stage, 10)),
    }
    total = sum(parts[k] * float(weights.get(k, 0.0)) for k in parts)
    return _clamp(total), parts


def compute_pql(
    *,
    stage: str,
    health: float,
    frequency: float,
    last_active_at: datetime | None,
    weights: dict[str, float],
    now: datetime | None = None,
) -> tuple[float, dict[str, Any]]:
    now = now or utcnow()
    if stage in {"first_value", "reuse", "retention", "at_risk", "churned"}:
        activation = 100.0
    elif stage == "installed":
        activation = 40.0
    else:
        activation = 0.0

    engagement = (float(STAGE_PROGRESS.get(stage, 10)) + frequency) / 2.0
    seconds_since_active = (now - last_active_at).total_seconds() if last_active_at else None
    recency_boost = (
        100.0
        if seconds_since_active is not None and 0 <= seconds_since_active <= timedelta(days=7).total_seconds()
        else 0.0
    )
    parts = {
        "activation": activation,
        "engagement": engagement,
        "health": float(health),
        "recency_boost": recency_boost,
    }
    total = sum(parts[k] * float(weights.get(k, 0.0)) for k in parts)
    return _clamp(total), parts


def suggest_action(
    *,
    stage: str,
    pql_score: float,
    health_score: float,
    pql_threshold: int,
    has_events: bool,
) -> tuple[str, str]:
    if stage == "churned":
        return "winback", "启动挽回：联系确认需求是否变化"
    if stage == "at_risk":
        return "reengage", "七日内触达：推送价值场景或成功案例"
    if stage == "new" or not has_events:
        return "activate_install", "推动完成安装/首次打开"
    if stage == "installed":
        return "drive_first_value", "引导完成首次价值行为"
    if stage == "first_value":
        return "drive_reuse", "引导第二次关键使用"
    if pql_score >= pql_threshold and health_score >= 80:
        return "expand_or_advocate", "高价值客户：挖掘扩展或转介绍"
    return "maintain", "保持观察，按周复查"


def derive_stage(
    event_types: set[str],
    last_active_at: datetime | None,
    *,
    silent_risk_days: int,
    silent_churn_days: int,
    retention_window_days: int,
    now: datetime | None = None,
    active_dates_in_window: int | None = None,
) -> str:
    """Stage algorithm locked with 荀彧 METRICS-FIELDS.md §3.2."""
    now = now or utcnow()
    if not event_types:
        return "new"

    reached_install = "install" in event_types or "first_value" in event_types or "reuse" in event_types
    reached_fv = "first_value" in event_types or "reuse" in event_types
    reached_reuse = "reuse" in event_types

    if reached_fv:
        if last_active_at is None:
            return "churned"
        silent = silent_days(now, last_active_at)  # floor days
        # PRD/荀彧: silent_days > threshold
        if silent > silent_churn_days:
            return "churned"
        if silent > silent_risk_days:
            return "at_risk"

    if reached_reuse:
        # >=2 distinct calendar days with events in retention window
        if (active_dates_in_window or 0) >= 2:
            return "retention"
        return "reuse"
    if reached_fv:
        return "first_value"
    if reached_install:
        return "installed"
    return "new"


def recalculate_tenant(
    db: Session,
    tenant_id: str,
    settings: TenantSettings,
    now: datetime | None = None,
) -> int:
    now = now or utcnow()
    customers = db.query(Customer).filter(Customer.tenant_id == tenant_id).all()
    for customer in customers:
        events = (
            db.query(Event)
            .filter(Event.tenant_id == tenant_id, Event.customer_id == customer.id)
            .all()
        )
        event_types = {e.event_type for e in events}
        last_active = max((e.occurred_at for e in events), default=None)
        active_dates = {
            e.occurred_at.date()
            for e in events
            if 0 <= (now - e.occurred_at).days <= settings.retention_window_days
        }
        customer.stage = derive_stage(
            event_types,
            last_active,
            silent_risk_days=settings.silent_risk_days,
            silent_churn_days=settings.silent_churn_days,
            retention_window_days=settings.retention_window_days,
            now=now,
            active_dates_in_window=len(active_dates),
        )
        customer.last_active_at = last_active
        cutoff = now - timedelta(days=14)
        recent = [e for e in events if e.occurred_at >= cutoff]
        features = {e.feature_key for e in recent if e.feature_key}
        health, health_breakdown = compute_health(
            stage=customer.stage,
            last_active_at=last_active,
            event_count_14d=len(recent),
            feature_count_14d=len(features) if features else (None if not recent else 0),
            weights=settings.health_weights,
            now=now,
        )
        pql, pql_breakdown = compute_pql(
            stage=customer.stage,
            health=health,
            frequency=health_breakdown["frequency"],
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
        score = (
            db.query(Score)
            .filter(Score.tenant_id == tenant_id, Score.customer_id == customer.id)
            .first()
        )
        if not score:
            score = Score(tenant_id=tenant_id, customer_id=customer.id)
            db.add(score)
        score.health_score = health
        score.pql_score = pql
        score.is_pql = pql >= settings.pql_threshold and customer.stage in PQL_STAGES
        score.health_breakdown = health_breakdown
        score.pql_breakdown = pql_breakdown
        score.suggested_action = action
        score.action_reason = reason
        score.calculated_at = now
        customer.updated_at = now
    return len(customers)


@event.listens_for(Session, "before_commit")
def _recalculate_after_scoring_settings_change(session: Session) -> None:
    changed_settings = []
    for obj in session.dirty:
        if not isinstance(obj, TenantSettings):
            continue
        state = inspect(obj)
        if any(state.attrs[field].history.has_changes() for field in SCORING_SETTINGS_FIELDS):
            changed_settings.append(obj)
    for settings in changed_settings:
        recalculate_tenant(session, settings.tenant_id, settings)
