#!/usr/bin/env python3
"""Generate PQL Health sample CSVs + metric field doc for PRD-v1."""
from __future__ import annotations

import csv
from datetime import datetime, timedelta, timezone
from pathlib import Path

OUT = Path(__file__).resolve().parent
NOW = datetime(2026, 11, 1, 6, 0, 0, tzinfo=timezone.utc)  # ~ demo day UTC

FEATURES = ["dashboard", "import_csv", "funnel", "score_view", "analysis", "settings", "feishu_sync"]


def iso(dt: datetime) -> str:
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def days_ago(n: float) -> datetime:
    return NOW - timedelta(days=n)


# (external_id, name, stage_label for docs, event plan)
# event plan: list of (event_type, days_ago, feature_key|None)
CUSTOMERS: list[tuple[str, str, str, list[tuple[str, float, str | None]]]] = []

# --- new (8): archive only ---
for i in range(1, 9):
    CUSTOMERS.append((f"CUST-NEW-{i:02d}", f"新客客户{i:02d}", "new", []))

# --- installed only (12) ---
for i in range(1, 13):
    CUSTOMERS.append(
        (
            f"CUST-INS-{i:02d}",
            f"已安装客户{i:02d}",
            "installed",
            [("install", 3 + i * 0.4, None)],
        )
    )

# --- first_value, no reuse (15) ---
for i in range(1, 16):
    base = 5 + i * 0.5
    events = [
        ("install", base + 2, None),
        ("first_value", base, "dashboard"),
        ("feature_use", base - 0.2, "funnel"),
    ]
    CUSTOMERS.append((f"CUST-FV-{i:02d}", f"首次价值客户{i:02d}", "first_value", events))

# --- reuse, not retention (15): reuse happened, but last active outside retention window or not enough ---
# For stage reuse: had reuse after first_value; last active within risk window but not currently retention
# retention = current stage retention: active within 14d AND reached reuse
# So for plain reuse: last event 2-6 days ago but we still mark as reuse if they have reuse - actually PRD says
# retention = stage == retention from derivation
# Derivation: retention if within observation window still has active events after reuse
# For reuse-only demo customers: last active 8-13 days ago? Risk is 7d silent after first_value+
# Careful:
# at_risk: had first_value+, silent > 7 days
# So reuse customers need last_active <= 7 days ago to not be at_risk
# retention: currently stage == retention - typically active in 14d window after reuse
# Distinction reuse vs retention for synthetic: 
# - reuse: has reuse event, last active within 7d, but NOT marked retention (e.g. no retention_active / sparse)
# PRD: retention = 在观察窗内仍有活跃事件 (default 14d)
# So anyone with reuse + activity in 14d could be retention...
# Looking at stage derivation "取该客户当前最高达成":
# installed < first_value < reuse < retention
# at_risk/churned override when silent
# So if they have reuse and activity in 14d window → retention
# If they have reuse but silent 1-7 days? Still active within 7d means last event within 7d
# Actually: if last event within 14d and had reuse → retention
# Then pure "reuse" stage might only exist briefly, or when last event >0 but the rule is...
# PRD table: reuse = 首次价值之后至少1次复用; retention = 观察窗内仍有活跃
# Highest stage: if both apply, retention wins.
# So customers with reuse + last_active within 14d → retention
# Customers with reuse + last_active 8-14? 8-14 days silent after first_value+ → at_risk (risk silent 7d)
# So pure "reuse" current stage is hard: only if somehow reuse but not in retention window and not at_risk
# That would be last_active between... at_risk starts at 7d silent. retention needs activity in 14d.
# If last_active = 5 days ago and had reuse → both reuse achieved and retention (active in window) → stage retention
# Pure reuse might mean: had reuse historically but... always retention if active in 14d.
# For funnel: retention柱 = current stage == retention
# reuse funnel count = had reuse event (cumulative)
# List stage can be reuse only in edge cases - perhaps last_active exactly when retention window uses retention_active event?
# Practical approach for V1 synthetic:
# - Label intended_stage for seed script
# - retention customers: reuse + recent activity (0-3d)
# - "reuse" list stage: give them reuse, last activity 4-6 days ago - STILL within 14d so PRD says retention
# I'll follow PRD strictly: if active in 14d and reached reuse → retention
# For list diversity of "reuse" stage, use customers whose HIGHEST is reuse but last event >14d would be at_risk/churned
# Re-read: "reuse | 复用 | 在首次价值之后，存在至少 1 次同类型或约定的回访/复用事件"
# "retention | 留存 | 在观察窗内（默认 14 天）仍有活跃事件"
# And "取该客户当前最高达成" with at_risk/churned as special.
# Order of evaluation typically: check churned/at_risk first if silent, else highest of installed/fv/reuse/retention
# So: silent 8 days → at_risk (not reuse)
# Active 3 days + reuse → retention (because 观察窗内仍有活跃 AND 曾 reuse)
# Then when is stage exactly `reuse`? When they have reuse event but are NOT "仍有活跃" in window?
# That contradicts having recent events.
# Perhaps retention requires specifically retention_active or activity AFTER entering reuse within window, while stage stays reuse until retention criteria met more strictly.
# PRD 6.2: 留存档 = 当前 stage == retention 的客户数
# I'll define for synthetic clarity (and document in METRICS):
# - stage reuse: has reuse; last_active within 7 days; NO event in last 3 days labeled retention pattern — OR we use: reuse customers have last_active 1-6d but we set intended stage reuse for seed that backend may recompute to retention
# Better: document expected AFTER backend scoring:
# Funnel cumulative counts from events; list stage from engine.
# Provide `seed_manifest.json` with expected funnel counts from events, and expected stage distribution after applying PRD rules as we interpret:
#
# Stage algorithm (荀彧口径锁定):
# 1. If no events → new
# 2. Determine max milestone: install/first_value/reuse from events
# 3. days_silent = now - last_active
# 4. If max milestone >= first_value:
#      if days_silent > 30 → churned
#      elif days_silent > 7 → at_risk
# 5. Elif max milestone >= reuse and days_silent <= 14 → retention
# 6. Else stage = max milestone (installed/first_value/reuse)
#
# Wait step 5: if reuse and silent<=14 → retention. Then reuse as current stage only if silent>14 which would already be at_risk if >= first_value.
# So current stage `reuse` is unreachable if at_risk threshold is 7d and retention window is 14d!
# This is a PRD ambiguity. For synthetic data I'll still CREATE customers with reuse events for funnel "复用" cumulative, and set their last_active so they become retention or at_risk.
# For list "reuse" stage diversity: propose in field doc that V1 engine should use:
#   retention if (had reuse) AND (days_silent <= retention_window)
#   else if had reuse → would be at_risk/churned when silent>7
# And note 口径异议: `reuse` as *current* stage is transient/unreachable under default 7/14 — suggest either lower risk days for demo OR treat reuse as current when had reuse and silent<=7 but not "深度留存" (e.g. need 2+ distinct days of activity in window for retention).
#
# Practical V1 rule I'll lock in METRICS-FIELDS.md (提口径异议):
# retention: had reuse AND at least 2 active calendar days in last retention_window_days
# reuse: had reuse AND only 1 active day in window AND silent <= risk days
# This makes both stages appear.

    pass

# Rebuild CUSTOMERS cleanly with the 2-active-days retention rule documented.

CUSTOMERS.clear()

for i in range(1, 9):
    CUSTOMERS.append((f"CUST-NEW-{i:02d}", f"新客客户{i:02d}", "new", []))

for i in range(1, 13):
    CUSTOMERS.append(
        (
            f"CUST-INS-{i:02d}",
            f"已安装客户{i:02d}",
            "installed",
            [("install", 2 + i * 0.3, None)],
        )
    )

for i in range(1, 16):
    b = 1 + i * 0.3  # last active <=5.5d, stays under 7d risk
    CUSTOMERS.append(
        (
            f"CUST-FV-{i:02d}",
            f"首次价值客户{i:02d}",
            "first_value",
            [
                ("install", b + 3, None),
                ("first_value", b, "dashboard"),
                ("feature_use", b - 0.1, FEATURES[i % 3]),
            ],
        )
    )

# reuse: one active day in window (reuse day), last_active ~2-5 days
for i in range(1, 16):
    reuse_day = 2 + (i % 4)  # 2..5 days ago
    fv_day = 16 + (i % 4)  # outside 14d window -> only 1 active day in window
    ins_day = fv_day + 2
    CUSTOMERS.append(
        (
            f"CUST-REU-{i:02d}",
            f"复用客户{i:02d}",
            "reuse",
            [
                ("install", ins_day, None),
                ("first_value", fv_day, "dashboard"),
                ("reuse", reuse_day, "funnel"),
                ("feature_use", reuse_day, FEATURES[i % len(FEATURES)]),
            ],
        )
    )

# retention: >=2 distinct active days in last 14d, including recent
for i in range(1, 13):
    d1 = 1 + (i % 3) * 0.1  # ~1 day ago
    d2 = 4 + (i % 5)  # second active day
    fv = d2 + 6
    ins = fv + 2
    feats = [FEATURES[i % 7], FEATURES[(i + 2) % 7], FEATURES[(i + 4) % 7]]
    CUSTOMERS.append(
        (
            f"CUST-RET-{i:02d}",
            f"留存客户{i:02d}",
            "retention",
            [
                ("install", ins, None),
                ("first_value", fv, "dashboard"),
                ("reuse", d2, "funnel"),
                ("feature_use", d2, feats[0]),
                ("feature_use", d2 - 0.05, feats[1]),
                ("retention_active", d1, None),
                ("feature_use", d1, feats[2]),
            ],
        )
    )

# at_risk: had first_value+, last event 8-20 days ago
for i in range(1, 11):
    silent = 8 + i  # 9..18
    CUSTOMERS.append(
        (
            f"CUST-RSK-{i:02d}",
            f"风险客户{i:02d}",
            "at_risk",
            [
                ("install", silent + 10, None),
                ("first_value", silent + 7, "dashboard"),
                ("reuse", silent + 3, "funnel") if i % 2 == 0 else ("feature_use", silent + 5, "import_csv"),
                ("feature_use", silent, FEATURES[i % 7]),
            ],
        )
    )

# churned: silent > 30
for i in range(1, 9):
    silent = 31 + i * 3
    CUSTOMERS.append(
        (
            f"CUST-CHU-{i:02d}",
            f"流失客户{i:02d}",
            "churned",
            [
                ("install", silent + 20, None),
                ("first_value", silent + 15, "dashboard"),
                ("reuse", silent + 10, "funnel") if i % 2 else ("feature_use", silent + 12, "score_view"),
                ("feature_use", silent, "analysis"),
            ],
        )
    )

# Flatten at_risk events (ternary in list was messy)
fixed = []
for ext, name, stage, evs in CUSTOMERS:
    clean = []
    for item in evs:
        if item is None:
            continue
        clean.append(item)
    fixed.append((ext, name, stage, clean))
CUSTOMERS = fixed

# Write customers.csv
with (OUT / "customers.csv").open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["external_id", "name"])
    for ext, name, _, _ in CUSTOMERS:
        w.writerow([ext, name])

# Write events.csv
with (OUT / "events.csv").open("w", encoding="utf-8", newline="") as f:
    w = csv.writer(f)
    w.writerow(["external_customer_id", "event_type", "occurred_at", "feature_key"])
    for ext, _, _, evs in CUSTOMERS:
        for et, ago, fk in evs:
            w.writerow([ext, et, iso(days_ago(ago)), fk or ""])

# Manifest for funnel / stage expectations
from collections import Counter

stage_counts = Counter(s for _, _, s, _ in CUSTOMERS)
# Funnel cumulative by events
def has_event(evs, t):
    return any(e[0] == t for e in evs)

funnel = {
    "installed": sum(1 for *_, evs in CUSTOMERS if has_event(evs, "install")),
    "first_value": sum(1 for *_, evs in CUSTOMERS if has_event(evs, "first_value")),
    "reuse": sum(1 for *_, evs in CUSTOMERS if has_event(evs, "reuse")),
    "retention_stage_count": stage_counts["retention"],
}

manifest = {
    "generated_at_utc": iso(NOW),
    "customer_count": len(CUSTOMERS),
    "event_count": sum(len(evs) for *_, evs in CUSTOMERS),
    "intended_stage_distribution": dict(stage_counts),
    "funnel_cumulative_from_events": {
        "installed": funnel["installed"],
        "first_value": funnel["first_value"],
        "reuse": funnel["reuse"],
    },
    "funnel_retention_bar_prd": "count where current stage == retention",
    "expected_retention_bar": funnel["retention_stage_count"],
    "notes": "Stage engine should apply METRICS-FIELDS.md section 阶段判定补充；CSV 可直接给 /data/csv 上传，也可作合成种子对照。",
}

import json

(OUT / "seed_manifest.json").write_text(
    json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
)

print("customers", len(CUSTOMERS))
print("events", manifest["event_count"])
print("stages", dict(stage_counts))
print("funnel", manifest["funnel_cumulative_from_events"], "retention_bar", funnel["retention_stage_count"])
print("wrote", OUT)
