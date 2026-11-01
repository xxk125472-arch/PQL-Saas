from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.data import recompute_tenant
from app.api.v1.schemas import (
    FeishuConfigResponse,
    FeishuConfigUpdate,
    FeishuFieldMapping,
    FeishuSyncResponse,
    FeishuTestResponse,
)
from app.core.db import get_db
from app.core.timeutil import parse_ts, utcnow
from app.models import Customer, Event, ImportJob, TenantSettings, User
from app.models.entities import _uuid
from app.services.crypto import SecretDecryptionError, decrypt_secret, encrypt_secret
from app.services.feishu import FeishuClient, FeishuError, load_env_config

router = APIRouter(tags=["integrations"])

EVENT_TYPES = {"install", "first_value", "reuse", "retention_active", "feature_use", "other"}
MAX_ROW_ERRORS = 50


class FeishuConfigWithSourceResponse(FeishuConfigResponse):
    source: str


class FeishuConfigError(Exception):
    def __init__(self, detail: str, code: str):
        super().__init__(detail)
        self.detail = detail
        self.code = code


def _error(status_code: int, detail: str, code: str) -> JSONResponse:
    return JSONResponse(status_code=status_code, content={"detail": detail, "code": code})


def _settings(db: Session, tenant_id: str) -> TenantSettings:
    settings = db.query(TenantSettings).filter(TenantSettings.tenant_id == tenant_id).first()
    if not settings:
        raise FeishuConfigError("租户设置不存在，请重新登录后重试", "SETTINGS_NOT_FOUND")
    return settings


def _stored_config(settings: TenantSettings) -> dict[str, Any]:
    stored = settings.feishu_mapping_json or {}
    if not settings.feishu_app_id or not settings.feishu_app_secret_enc:
        raise FeishuConfigError("请先配置飞书 App ID 和 App Secret", "FEISHU_CREDENTIALS_MISSING")
    required = ("app_token", "customers_table_id", "events_table_id", "field_mapping")
    if any(not stored.get(key) for key in required):
        raise FeishuConfigError("飞书表格或字段映射配置不完整", "FEISHU_CONFIG_INCOMPLETE")
    return stored


def _mask_secret(secret: str | None) -> str:
    if not secret or len(secret) <= 4:
        return "****"
    return f"****{secret[-4:]}"


def _config_response(config: dict[str, Any]) -> FeishuConfigWithSourceResponse:
    stored = config["stored"]
    return FeishuConfigWithSourceResponse(
        app_id=config["app_id"],
        app_secret_masked=_mask_secret(config.get("app_secret")),
        app_token=stored["app_token"],
        customers_table_id=stored["customers_table_id"],
        events_table_id=stored["events_table_id"],
        field_mapping=stored["field_mapping"],
        source=config["source"],
    )


def _resolved_config(settings: TenantSettings) -> dict[str, Any]:
    if settings.feishu_app_id or settings.feishu_app_secret_enc or settings.feishu_mapping_json:
        return {
            "app_id": settings.feishu_app_id or "",
            "app_secret": _secret(settings),
            "stored": _stored_config(settings),
            "source": "database",
        }
    env_config = load_env_config()
    if env_config:
        return {**env_config, "source": "env"}
    return {
        "app_id": "",
        "app_secret": None,
        "stored": _stored_config(settings),
        "source": "database",
    }


def _secret(settings: TenantSettings) -> str:
    try:
        return decrypt_secret(settings.feishu_app_secret_enc or "")
    except SecretDecryptionError as exc:
        raise FeishuConfigError("飞书密钥无法解密，请重新保存 App Secret", "FEISHU_SECRET_INVALID") from exc


def _mapping(body: FeishuFieldMapping) -> dict[str, Any]:
    mapping = body.model_dump(exclude_none=True)
    for key in ("external_id", "name", "event_type", "occurred_at"):
        value = mapping.get(key, "").strip()
        if not value:
            raise FeishuConfigError(f"字段映射 {key} 不能为空", "FEISHU_MAPPING_INVALID")
        mapping[key] = value
    for key in ("external_customer_id", "feature_key"):
        if key in mapping:
            mapping[key] = mapping[key].strip()
    mapping["external_customer_id"] = mapping.get("external_customer_id") or mapping["external_id"]
    for source, target in mapping["event_type_values"].items():
        if not source.strip() or target not in EVENT_TYPES:
            raise FeishuConfigError(f"事件类型映射无效：{source or '（空）'}", "FEISHU_EVENT_TYPE_MAPPING_INVALID")
    return mapping


def _text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return str(value)
    if isinstance(value, list):
        return "".join(_text(item) for item in value).strip()
    if isinstance(value, dict):
        for key in ("text", "name", "value", "timestamp", "id"):
            if key in value:
                return _text(value[key])
    return str(value).strip()


def _occurred_at(value: Any) -> datetime:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        timestamp = float(value)
    else:
        text = _text(value)
        try:
            timestamp = float(text)
        except ValueError:
            return parse_ts(text)
    if abs(timestamp) >= 100_000_000_000:
        timestamp /= 1000
    return datetime.fromtimestamp(timestamp, timezone.utc).replace(tzinfo=None)


def _record_id(record: Any, index: int) -> Any:
    if isinstance(record, dict):
        return record.get("record_id") or index
    return index


def _fields(record: Any) -> dict[str, Any]:
    if isinstance(record, dict) and isinstance(record.get("fields"), dict):
        return record["fields"]
    return {}


def _failed_sync(db: Session, job_id: str, exc: FeishuError, stats: dict[str, int]) -> JSONResponse:
    db.rollback()
    job = db.get(ImportJob, job_id)
    if job:
        job.status = "failed"
        job.stats_json = stats
        job.error = exc.detail
        db.commit()
    return _error(exc.status_code, exc.detail, exc.code)


@router.get("/integrations/feishu/config", response_model=FeishuConfigWithSourceResponse)
def get_feishu_config(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        settings = _settings(db, user.tenant_id)
        return _config_response(_resolved_config(settings))
    except FeishuConfigError as exc:
        return _error(400, exc.detail, exc.code)


@router.put("/integrations/feishu/config", response_model=FeishuConfigResponse)
def put_feishu_config(
    body: FeishuConfigUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        settings = _settings(db, user.tenant_id)
        mapping = _mapping(body.field_mapping)
        if body.app_secret is not None and not body.app_secret.startswith("****"):
            if not body.app_secret:
                raise FeishuConfigError("App Secret 不能为空", "FEISHU_SECRET_EMPTY")
            settings.feishu_app_secret_enc = encrypt_secret(body.app_secret)
        if not settings.feishu_app_secret_enc:
            raise FeishuConfigError("首次保存必须提供 App Secret", "FEISHU_SECRET_REQUIRED")
        settings.feishu_app_id = body.app_id.strip()
        stored = {
            "app_token": body.app_token.strip(),
            "customers_table_id": body.customers_table_id.strip(),
            "events_table_id": body.events_table_id.strip(),
            "field_mapping": mapping,
        }
        settings.feishu_mapping_json = stored
        db.commit()
        return _config_response({
            "app_id": settings.feishu_app_id or "",
            "app_secret": _secret(settings),
            "stored": stored,
            "source": "database",
        })
    except FeishuConfigError as exc:
        db.rollback()
        return _error(400, exc.detail, exc.code)


@router.post("/integrations/feishu/test", response_model=FeishuTestResponse)
def test_feishu_connection(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        settings = _settings(db, user.tenant_id)
        config = _resolved_config(settings)
        stored = config["stored"]
        secret = config["app_secret"] if config["source"] == "env" else _secret(settings)
    except FeishuConfigError as exc:
        return _error(400, exc.detail, exc.code)
    try:
        with FeishuClient() as client:
            token = client.get_tenant_access_token(config["app_id"], secret)
            data = client.list_records_page(
                app_token=stored["app_token"],
                table_id=stored["customers_table_id"],
                access_token=token,
            )
        count = len(data["items"])
        return FeishuTestResponse(ok=True, message=f"连接成功，已读取客户表 {count} 条记录", records_read=count)
    except FeishuError as exc:
        return _error(exc.status_code, exc.detail, exc.code)


@router.post("/integrations/feishu/sync", response_model=FeishuSyncResponse)
def feishu_sync(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        settings = _settings(db, user.tenant_id)
        config = _resolved_config(settings)
        stored = config["stored"]
        secret = config["app_secret"] if config["source"] == "env" else _secret(settings)
    except FeishuConfigError as exc:
        return _error(400, exc.detail, exc.code)

    tenant_id = user.tenant_id
    job = ImportJob(tenant_id=tenant_id, type="feishu", status="pending")
    db.add(job)
    db.commit()
    db.refresh(job)
    stats = {
        "customers_read": 0,
        "customers_inserted": 0,
        "customers_updated": 0,
        "events_read": 0,
        "events_inserted": 0,
        "events_skipped": 0,
        "errors": 0,
    }

    try:
        with FeishuClient() as client:
            token = client.get_tenant_access_token(config["app_id"], secret)
            customer_records = list(client.iter_records(
                app_token=stored["app_token"],
                table_id=stored["customers_table_id"],
                access_token=token,
            ))
            stats["customers_read"] = len(customer_records)
            event_records = list(client.iter_records(
                app_token=stored["app_token"],
                table_id=stored["events_table_id"],
                access_token=token,
            ))
            stats["events_read"] = len(event_records)
    except FeishuError as exc:
        return _failed_sync(db, job.id, exc, stats)

    mapping = stored["field_mapping"]
    now = utcnow()
    errors: list[dict[str, Any]] = []
    customer_rows = []
    known_external_ids = set(
        row[0] for row in db.query(Customer.external_id).filter(Customer.tenant_id == tenant_id).all()
    )
    for index, record in enumerate(customer_records, start=1):
        fields = _fields(record)
        external_id = _text(fields.get(mapping["external_id"]))
        name = _text(fields.get(mapping["name"]))
        if not external_id or not name:
            errors.append({"record": _record_id(record, index), "reason": "客户 ID 和客户名称不能为空"})
            continue
        if external_id in known_external_ids:
            stats["customers_updated"] += 1
        else:
            stats["customers_inserted"] += 1
            known_external_ids.add(external_id)
        customer_rows.append({
            "id": _uuid(),
            "tenant_id": tenant_id,
            "external_id": external_id,
            "name": name,
            "stage": "new",
            "source": "feishu",
            "created_at": now,
            "updated_at": now,
        })

    if customer_rows:
        statement = sqlite_insert(Customer).values(customer_rows)
        db.execute(statement.on_conflict_do_update(
            index_elements=["tenant_id", "external_id"],
            set_={"name": statement.excluded.name, "source": "feishu", "updated_at": now},
        ))
    db.flush()
    id_by_external = dict(
        db.query(Customer.external_id, Customer.id).filter(Customer.tenant_id == tenant_id).all()
    )

    event_rows = []
    for index, record in enumerate(event_records, start=1):
        fields = _fields(record)
        external_id = _text(fields.get(mapping["external_customer_id"]))
        raw_event_type = _text(fields.get(mapping["event_type"]))
        event_type = mapping["event_type_values"].get(raw_event_type, raw_event_type)
        customer_id = id_by_external.get(external_id)
        if not customer_id:
            errors.append({"record": _record_id(record, index), "reason": f"客户不存在：{external_id or '（空）'}"})
            continue
        if event_type not in EVENT_TYPES:
            errors.append({"record": _record_id(record, index), "reason": f"未知事件类型：{raw_event_type or '（空）'}"})
            continue
        try:
            occurred_at = _occurred_at(fields.get(mapping["occurred_at"]))
        except (ValueError, TypeError, OverflowError, OSError):
            errors.append({"record": _record_id(record, index), "reason": "事件时间格式无效"})
            continue
        feature_key = _text(fields.get(mapping["feature_key"])) or None if mapping.get("feature_key") else None
        event_rows.append({
            "id": _uuid(),
            "tenant_id": tenant_id,
            "customer_id": customer_id,
            "event_type": event_type,
            "feature_key": feature_key,
            "occurred_at": occurred_at,
            "raw_payload": {"source": "feishu", "record": record},
            "created_at": now,
        })

    if event_rows:
        result = db.execute(sqlite_insert(Event).values(event_rows).on_conflict_do_nothing(
            index_elements=["tenant_id", "customer_id", "event_type", "occurred_at"]
        ))
        stats["events_inserted"] = result.rowcount or 0
    stats["events_skipped"] = len(event_rows) - stats["events_inserted"]
    stats["errors"] = len(errors)
    db.flush()
    stats["customers_recomputed"] = recompute_tenant(db, tenant_id, settings, now)
    job.status = "success"
    job.stats_json = stats
    db.commit()
    response_stats = {key: value for key, value in stats.items() if key != "errors"}
    return FeishuSyncResponse(
        ok=True,
        import_id=job.id,
        message="飞书只读同步完成",
        errors=errors[:MAX_ROW_ERRORS],
        **response_stats,
    )
