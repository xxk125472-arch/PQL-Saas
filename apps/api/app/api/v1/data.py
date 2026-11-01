"""Synthetic / CSV / Feishu sync endpoints."""

import csv
import io
import json
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse
from sqlalchemy import delete, select
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.core.timeutil import parse_ts, utcnow
from app.models import Customer, Event, ImportJob, Score, TenantSettings, User
from app.models.entities import _uuid
from app.services.scoring import compute_health, compute_pql, derive_stage, suggest_action

router = APIRouter(tags=["data"])

SAMPLE_DIR = Path(__file__).resolve().parents[5] / "data" / "sample"


def _recompute_customer(db: Session, customer: Customer, settings: TenantSettings, now: datetime | None = None) -> None:
    now = now or utcnow()
    events = db.query(Event).filter(Event.tenant_id == customer.tenant_id, Event.customer_id == customer.id).all()
    types = {e.event_type for e in events}
    last_active = max((e.occurred_at for e in events), default=None)
    customer.last_active_at = last_active
    # METRICS-FIELDS §3.2: distinct calendar days with events within window (floor days)
    active_dates = {
        e.occurred_at.date() for e in events if 0 <= (now - e.occurred_at).days <= settings.retention_window_days
    }
    customer.stage = derive_stage(
        types,
        last_active,
        silent_risk_days=settings.silent_risk_days,
        silent_churn_days=settings.silent_churn_days,
        retention_window_days=settings.retention_window_days,
        now=now,
        active_dates_in_window=len(active_dates),
    )
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


def recompute_tenant(db: Session, tenant_id: str, settings: TenantSettings, now: datetime | None = None) -> int:
    now = now or utcnow()
    customers = db.query(Customer).filter(Customer.tenant_id == tenant_id).all()
    for c in customers:
        _recompute_customer(db, c, settings, now)
    return len(customers)


def _tenant_settings(db: Session, tid: str) -> TenantSettings:
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tid).first()
    if not settings:
        raise HTTPException(status_code=500, detail="settings missing")
    return settings


def _delete_synthetic(db: Session, tid: str) -> int:
    """Remove only source=synthetic customers; events/scores go via ON DELETE CASCADE."""
    res = db.execute(delete(Customer).where(Customer.tenant_id == tid, Customer.source == "synthetic"))
    return res.rowcount or 0


@router.post("/data/synthetic")
def generate_synthetic(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Load data/sample as source=synthetic, time-shifted to now. Idempotent (duplicates skipped)."""
    tid = user.tenant_id
    settings = _tenant_settings(db, tid)
    manifest = json.loads((SAMPLE_DIR / "seed_manifest.json").read_text(encoding="utf-8"))
    now = utcnow()
    shift = now - parse_ts(manifest["generated_at_utc"])
    # Idempotency: while synthetic customers still exist, reuse the shift of the last synthetic
    # load so the same CSV rows map to the same occurred_at and are skipped as duplicates.
    has_synthetic = db.query(Customer.id).filter(Customer.tenant_id == tid, Customer.source == "synthetic").first()
    if has_synthetic:
        prev = (
            db.query(ImportJob)
            .filter(ImportJob.tenant_id == tid, ImportJob.type == "synthetic", ImportJob.status == "success")
            .order_by(ImportJob.created_at.desc())
            .first()
        )
        if prev and prev.stats_json and "shift_microseconds" in prev.stats_json:
            shift = timedelta(microseconds=prev.stats_json["shift_microseconds"])

    job = ImportJob(tenant_id=tid, type="synthetic", status="pending")
    db.add(job)
    db.flush()

    with (SAMPLE_DIR / "customers.csv").open(encoding="utf-8-sig", newline="") as f:
        cust_rows = [
            {"id": _uuid(), "tenant_id": tid, "external_id": r["external_id"].strip(), "name": r["name"].strip(),
             "stage": "new", "source": "synthetic", "created_at": now, "updated_at": now}
            for r in csv.DictReader(f)
        ]
    res = db.execute(
        sqlite_insert(Customer).values(cust_rows).on_conflict_do_nothing(index_elements=["tenant_id", "external_id"])
    )
    customers_inserted = res.rowcount or 0
    id_by_ext = dict(
        db.execute(select(Customer.external_id, Customer.id).where(Customer.tenant_id == tid, Customer.source == "synthetic")).all()
    )

    ev_rows, skipped_unknown = [], 0
    with (SAMPLE_DIR / "events.csv").open(encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            cid = id_by_ext.get(r["external_customer_id"].strip())
            if not cid:
                skipped_unknown += 1
                continue
            ev_rows.append({
                "id": _uuid(), "tenant_id": tid, "customer_id": cid, "event_type": r["event_type"].strip(),
                "feature_key": (r.get("feature_key") or "").strip() or None,
                "occurred_at": parse_ts(r["occurred_at"]) + shift, "created_at": now,
            })
    events_inserted = 0
    if ev_rows:
        res = db.execute(
            sqlite_insert(Event).values(ev_rows).on_conflict_do_nothing(
                index_elements=["tenant_id", "customer_id", "event_type", "occurred_at"]
            )
        )
        events_inserted = res.rowcount or 0
    db.flush()
    total = recompute_tenant(db, tid, settings, now)

    stats = {
        "customers_in_file": len(cust_rows), "customers_inserted": customers_inserted,
        "events_in_file": len(ev_rows) + skipped_unknown, "events_inserted": events_inserted,
        "events_skipped_unknown_customer": skipped_unknown, "shift_seconds": int(shift.total_seconds()),
        "shift_microseconds": shift // timedelta(microseconds=1),
        "customers_recomputed": total,
    }
    job.status = "success"
    job.stats_json = stats
    db.commit()
    return {"ok": True, "import_id": job.id, "customers": len(cust_rows), **stats}


@router.delete("/data/synthetic")
def delete_synthetic(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tid = user.tenant_id
    settings = _tenant_settings(db, tid)
    deleted = _delete_synthetic(db, tid)
    db.flush()
    recompute_tenant(db, tid, settings)
    db.commit()
    return {"ok": True, "deleted_customers": deleted}


MAX_CSV_BYTES = 10 * 1024 * 1024
MAX_CSV_ERRORS = 50
CSV_EVENT_TYPES = {"install", "first_value", "reuse", "retention_active", "feature_use", "other"}


class CsvFormatError(ValueError):
    def __init__(self, detail: str, code: str = "CSV_INVALID_FORMAT"):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def _parse_csv_rows(content: bytes, required_columns: tuple[str, ...]) -> list[tuple[int, dict]]:
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        raise CsvFormatError("文件必须使用 UTF-8 或 UTF-8-BOM 编码", "CSV_INVALID_ENCODING") from exc

    reader = csv.DictReader(io.StringIO(text, newline=""))
    if reader.fieldnames is None:
        raise CsvFormatError("CSV 文件为空或缺少表头", "CSV_INVALID_HEADER")
    reader.fieldnames = [(field or "").strip() for field in reader.fieldnames]
    missing = [column for column in required_columns if column not in reader.fieldnames]
    if missing:
        raise CsvFormatError("缺少必填列：" + "、".join(missing), "CSV_MISSING_COLUMNS")
    try:
        return [(reader.line_num, row) for row in reader]
    except csv.Error as exc:
        raise CsvFormatError("CSV 格式错误，请检查引号和分隔符") from exc


def _failed_csv_import(
    db: Session,
    job: ImportJob,
    status_code: int,
    detail: str,
    code: str,
    byte_count: int,
) -> JSONResponse:
    job.status = "failed"
    job.stats_json = {"rows": 0, "inserted": 0, "updated": 0, "skipped": 0, "errors": 1, "bytes": byte_count}
    job.error = detail
    db.commit()
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


@router.post("/data/csv/customers")
async def upload_customers_csv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tid = user.tenant_id
    job = ImportJob(tenant_id=tid, type="csv_customers", status="pending")
    db.add(job)
    db.flush()

    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        return _failed_csv_import(db, job, 413, "CSV 文件不能超过 10MB", "CSV_FILE_TOO_LARGE", len(content))
    try:
        rows = _parse_csv_rows(content, ("external_id", "name"))
    except CsvFormatError as exc:
        return _failed_csv_import(db, job, 400, exc.detail, exc.code, len(content))

    now = utcnow()
    errors = []
    customer_rows = []
    known_external_ids = set(db.scalars(select(Customer.external_id).where(Customer.tenant_id == tid)).all())
    inserted = 0
    updated = 0
    for line, row in rows:
        if None in row:
            errors.append({"line": line, "reason": "该行的列数多于表头"})
            continue
        external_id = (row.get("external_id") or "").strip()
        name = (row.get("name") or "").strip()
        if not external_id:
            errors.append({"line": line, "reason": "external_id 不能为空"})
            continue
        if not name:
            errors.append({"line": line, "reason": "name 不能为空"})
            continue
        if external_id in known_external_ids:
            updated += 1
        else:
            inserted += 1
        known_external_ids.add(external_id)
        customer_rows.append({
            "id": _uuid(), "tenant_id": tid, "external_id": external_id, "name": name,
            "stage": "new", "source": "csv", "created_at": now, "updated_at": now,
        })

    if customer_rows:
        statement = sqlite_insert(Customer).values(customer_rows)
        db.execute(statement.on_conflict_do_update(
            index_elements=["tenant_id", "external_id"],
            set_={"name": statement.excluded.name, "source": "csv", "updated_at": now},
        ))
    db.flush()
    recompute_tenant(db, tid, _tenant_settings(db, tid), now)

    job.status = "success"
    job.stats_json = {
        "rows": len(rows), "inserted": inserted, "updated": updated, "skipped": 0,
        "errors": len(errors), "bytes": len(content),
    }
    db.commit()
    return {
        "ok": True, "import_id": job.id, "inserted": inserted, "updated": updated,
        "skipped": 0, "errors": errors[:MAX_CSV_ERRORS],
    }


@router.post("/data/csv/events")
async def upload_events_csv(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    tid = user.tenant_id
    job = ImportJob(tenant_id=tid, type="csv_events", status="pending")
    db.add(job)
    db.flush()

    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        return _failed_csv_import(db, job, 413, "CSV 文件不能超过 10MB", "CSV_FILE_TOO_LARGE", len(content))
    try:
        rows = _parse_csv_rows(content, ("external_customer_id", "event_type", "occurred_at"))
    except CsvFormatError as exc:
        return _failed_csv_import(db, job, 400, exc.detail, exc.code, len(content))

    now = utcnow()
    errors = []
    event_rows = []
    id_by_external = dict(db.execute(
        select(Customer.external_id, Customer.id).where(Customer.tenant_id == tid)
    ).all())
    for line, row in rows:
        if None in row:
            errors.append({"line": line, "reason": "该行的列数多于表头"})
            continue
        external_id = (row.get("external_customer_id") or "").strip()
        event_type = (row.get("event_type") or "").strip()
        occurred_at_value = (row.get("occurred_at") or "").strip()
        feature_key = (row.get("feature_key") or "").strip() or None
        if not external_id:
            errors.append({"line": line, "reason": "external_customer_id 不能为空"})
            continue
        customer_id = id_by_external.get(external_id)
        if not customer_id:
            errors.append({"line": line, "reason": f"客户不存在：{external_id}"})
            continue
        if event_type not in CSV_EVENT_TYPES:
            errors.append({"line": line, "reason": f"未知事件类型：{event_type or '（空）'}"})
            continue
        if not occurred_at_value:
            errors.append({"line": line, "reason": "occurred_at 不能为空"})
            continue
        try:
            occurred_at = parse_ts(occurred_at_value)
        except ValueError:
            errors.append({"line": line, "reason": f"时间格式无效：{occurred_at_value}"})
            continue
        event_rows.append({
            "id": _uuid(), "tenant_id": tid, "customer_id": customer_id, "event_type": event_type,
            "feature_key": feature_key, "occurred_at": occurred_at, "raw_payload": dict(row), "created_at": now,
        })

    inserted = 0
    if event_rows:
        result = db.execute(sqlite_insert(Event).values(event_rows).on_conflict_do_nothing(
            index_elements=["tenant_id", "customer_id", "event_type", "occurred_at"]
        ))
        inserted = result.rowcount or 0
    skipped = len(event_rows) - inserted
    db.flush()
    recompute_tenant(db, tid, _tenant_settings(db, tid), now)

    job.status = "success"
    job.stats_json = {
        "rows": len(rows), "inserted": inserted, "updated": 0, "skipped": skipped,
        "errors": len(errors), "bytes": len(content),
    }
    db.commit()
    return {
        "ok": True, "import_id": job.id, "inserted": inserted, "skipped": skipped,
        "errors": errors[:MAX_CSV_ERRORS],
    }
