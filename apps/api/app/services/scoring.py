"""Health / PQL scoring + suggested action. Full formula per PRD §4."""

from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from app.core.timeutil import silent_days, utcnow

STAGE_PROGRESS = {
    "new": 10,
    "installed": 30,
    "first_value": 55,
    "reuse": 75,
    "retention": 100,
    "at_risk": 40,
    "churned": 15,
}

ACTION_PRIORITY = [
    ("churned", "winback", "启动挽回：联系确认需求是否变化"),
    ("at_risk", "reengage", "七日内触达：推送价值场景或成功案例"),
]


def _clamp(v: float) -> int:
    return int(max(0, min(100, round(v))))


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
) -> tuple[int, dict[str, Any]]:
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
    health: int,
    frequency: float,
    last_active_at: datetime | None,
    weights: dict[str, float],
    now: datetime | None = None,
) -> tuple[int, dict[str, Any]]:
    now = now or utcnow()
    if stage in {"first_value", "reuse", "retention", "at_risk", "churned"}:
        activation = 100.0
    elif stage == "installed":
        activation = 40.0
    else:
        activation = 0.0

    stage_eng = {"reuse": 75.0, "retention": 100.0}.get(stage, 40.0 if stage == "first_value" else 0.0)
    engagement = (stage_eng + frequency) / 2.0
    recency_boost = 100.0 if last_active_at and (now - last_active_at) <= timedelta(days=7) else 0.0
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
    pql_score: int,
    health_score: int,
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

    reached_fv = "first_value" in event_types
    reached_reuse = "reuse" in event_types
    reached_install = "install" in event_types or reached_fv or reached_reuse

    if reached_fv or reached_reuse:
        if last_active_at is None:
            return "churned"
        silent = (now - last_active_at).days
        if silent >= silent_churn_days:
            return "churned"
        if silent >= silent_risk_days:
            return "at_risk"
        if reached_reuse and last_active_at >= now - timedelta(days=retention_window_days):
            return "retention"
        if reached_reuse:
            return "reuse"
        return "first_value"
    if reached_install:
        return "installed"
    return "new"
