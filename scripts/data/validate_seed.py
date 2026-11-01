#!/usr/bin/env python3
"""荀彧：样例数据 SQL 校验（只读）。

用法：
  python scripts/data/validate_seed.py --selftest            # 内存库载入 data/sample，自证 manifest
  python scripts/data/validate_seed.py [--db data/app.db] [--tenant <id>]  # 默认根目录库；单租户自动选
                                                            # 对后端真实库断言漏斗与阶段分布
口径：docs PRD-v1 §4/§6.2 + data/sample/METRICS-FIELDS.md §3.2。
"""
from __future__ import annotations

import argparse
import csv
import json
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SAMPLE = ROOT / "data" / "sample"
NOW = datetime(2026, 11, 1, 6, 0, 0)  # 与 manifest 一致的基准时间（UTC, naive）

FUNNEL_SQL = """
SELECT
  (SELECT COUNT(DISTINCT customer_id) FROM events WHERE tenant_id=:t AND event_type='install')     AS installed,
  (SELECT COUNT(DISTINCT customer_id) FROM events WHERE tenant_id=:t AND event_type='first_value') AS first_value,
  (SELECT COUNT(DISTINCT customer_id) FROM events WHERE tenant_id=:t AND event_type='reuse')       AS reuse,
  (SELECT COUNT(*) FROM customers WHERE tenant_id=:t AND stage='retention')                        AS retention
"""
STAGE_SQL = "SELECT stage, COUNT(*) FROM customers WHERE tenant_id=:t GROUP BY stage"
DUP_SQL = """
SELECT COUNT(*) FROM (SELECT 1 FROM events WHERE tenant_id=:t
  GROUP BY customer_id, event_type, occurred_at HAVING COUNT(*)>1)
"""
ORPHAN_SQL = """
SELECT COUNT(*) FROM events e LEFT JOIN customers c ON c.id=e.customer_id
WHERE e.tenant_id=:t AND (c.id IS NULL OR c.tenant_id<>e.tenant_id)
"""


def parse_ts(s: str) -> datetime:
    s = s.strip().replace("Z", "+00:00")
    dt = datetime.fromisoformat(s) if "T" in s or "+" in s else datetime.strptime(s, "%Y-%m-%d %H:%M:%S")
    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def derive_stage(evs: list[tuple[str, datetime]], now: datetime,
                 risk=7, churn=30, window=14) -> str:
    """METRICS-FIELDS §3.2 参考实现。"""
    if not evs:
        return "new"
    types = {t for t, _ in evs}
    last = max(d for _, d in evs)
    silent = (now - last).days  # 向下取整
    if "first_value" in types:
        if silent > churn:
            return "churned"
        if silent > risk:
            return "at_risk"
    if "reuse" in types:
        days = {d.date() for _, d in evs if (now - d).days <= window}
        return "retention" if len(days) >= 2 else "reuse"
    if "first_value" in types:
        return "first_value"
    if "install" in types:
        return "installed"
    return "new"


def build_selftest_db() -> tuple[sqlite3.Connection, str]:
    con = sqlite3.connect(":memory:")
    con.executescript("""
      CREATE TABLE customers(id TEXT PRIMARY KEY, tenant_id TEXT, external_id TEXT, name TEXT,
        stage TEXT, source TEXT, UNIQUE(tenant_id, external_id));
      CREATE TABLE events(id INTEGER PRIMARY KEY, tenant_id TEXT, customer_id TEXT, event_type TEXT,
        feature_key TEXT, occurred_at TEXT, UNIQUE(tenant_id, customer_id, event_type, occurred_at));
    """)
    t = "selftest"
    with (SAMPLE / "customers.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            con.execute("INSERT INTO customers VALUES(?,?,?,?,?,?)",
                        (r["external_id"], t, r["external_id"], r["name"], "new", "synthetic"))
    evmap: dict[str, list[tuple[str, datetime]]] = {}
    with (SAMPLE / "events.csv").open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            dt = parse_ts(r["occurred_at"])
            con.execute("INSERT OR IGNORE INTO events(tenant_id,customer_id,event_type,feature_key,occurred_at)"
                        " VALUES(?,?,?,?,?)",
                        (t, r["external_customer_id"], r["event_type"], r["feature_key"] or None,
                         dt.isoformat(sep=" ")))
            evmap.setdefault(r["external_customer_id"], []).append((r["event_type"], dt))
    for (cid,) in con.execute("SELECT id FROM customers").fetchall():
        con.execute("UPDATE customers SET stage=? WHERE id=?", (derive_stage(evmap.get(cid, []), NOW), cid))
    return con, t


def check(con: sqlite3.Connection, tenant: str) -> int:
    m = json.loads((SAMPLE / "seed_manifest.json").read_text(encoding="utf-8"))
    p = {"t": tenant}
    fails = 0

    got = dict(zip(["installed", "first_value", "reuse", "retention"], con.execute(FUNNEL_SQL, p).fetchone()))
    exp = {**m["funnel_cumulative_from_events"], "retention": m["expected_retention_bar"]}
    for k in exp:
        ok = got[k] == exp[k]
        fails += not ok
        print(f"[{'OK ' if ok else 'FAIL'}] funnel.{k}: got {got[k]} expect {exp[k]}")

    stages = dict(con.execute(STAGE_SQL, p).fetchall())
    for k, v in m["intended_stage_distribution"].items():
        ok = stages.get(k, 0) == v
        fails += not ok
        print(f"[{'OK ' if ok else 'FAIL'}] stage.{k}: got {stages.get(k, 0)} expect {v}")

    for name, sql in (("duplicate_events", DUP_SQL), ("orphan_or_cross_tenant_events", ORPHAN_SQL)):
        n = con.execute(sql, p).fetchone()[0]
        fails += n != 0
        print(f"[{'OK ' if n == 0 else 'FAIL'}] {name}: {n}")

    print(f"\n{'PASS' if fails == 0 else f'{fails} FAILED'}")
    return 1 if fails else 0


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--selftest", action="store_true")
    ap.add_argument("--db", default=str(ROOT / "data" / "app.db"))
    ap.add_argument("--tenant")
    a = ap.parse_args()
    if a.selftest:
        con, t = build_selftest_db()
        return check(con, t)
    if not Path(a.db).exists():
        ap.error(f"找不到数据库：{a.db}")
    con = sqlite3.connect(f"file:{a.db}?mode=ro", uri=True)
    tenant = a.tenant
    if not tenant:
        ts = [r[0] for r in con.execute("SELECT DISTINCT tenant_id FROM customers")]
        if len(ts) != 1:
            ap.error(f"库里有 {len(ts)} 个租户，请用 --tenant 指定")
        tenant = ts[0]
    print(f"db={a.db} tenant={tenant}")
    return check(con, tenant)


if __name__ == "__main__":
    sys.exit(main())
