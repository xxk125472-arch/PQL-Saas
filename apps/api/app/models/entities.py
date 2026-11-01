import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import JSON

from app.core.db import Base
from app.core.timeutil import utcnow


def _uuid() -> str:
    return str(uuid.uuid4())


def _utcnow() -> datetime:
    return utcnow()


class Tenant(Base):
    __tablename__ = "tenants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    users = relationship("User", back_populates="tenant", passive_deletes=True)


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        UniqueConstraint("username", name="uq_users_username"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    username: Mapped[str | None] = mapped_column(String(255), nullable=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)

    tenant = relationship("Tenant", back_populates="users")


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"

    jti: Mapped[str] = mapped_column(String(36), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class Customer(Base):
    __tablename__ = "customers"
    __table_args__ = (
        UniqueConstraint("tenant_id", "external_id", name="uq_customer_external"),
        Index("ix_customers_tenant_stage", "tenant_id", "stage"),
        Index("ix_customers_tenant_source", "tenant_id", "source"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    external_id: Mapped[str] = mapped_column(String(255))
    name: Mapped[str] = mapped_column(String(255))
    stage: Mapped[str] = mapped_column(String(64), default="new")
    source: Mapped[str] = mapped_column(String(32), default="manual")
    last_active_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Event(Base):
    __tablename__ = "events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "customer_id", "event_type", "occurred_at", name="uq_event_dedup"),
        Index("ix_events_tenant_customer_occurred", "tenant_id", "customer_id", "occurred_at"),
    )

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    event_type: Mapped[str] = mapped_column(String(64))
    feature_key: Mapped[str | None] = mapped_column(String(255), nullable=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime)
    raw_payload: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class Score(Base):
    __tablename__ = "scores"
    __table_args__ = (UniqueConstraint("tenant_id", "customer_id", name="uq_score_customer"),)

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    customer_id: Mapped[str] = mapped_column(String(36), ForeignKey("customers.id", ondelete="CASCADE"), index=True)
    health_score: Mapped[int] = mapped_column(Integer, default=0)
    pql_score: Mapped[int] = mapped_column(Integer, default=0)
    is_pql: Mapped[bool] = mapped_column(Boolean, default=False)
    health_breakdown: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    pql_breakdown: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    suggested_action: Mapped[str] = mapped_column(String(64), default="maintain")
    action_reason: Mapped[str] = mapped_column(String(512), default="")
    calculated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class ImportJob(Base):
    __tablename__ = "imports"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(64))
    status: Mapped[str] = mapped_column(String(32), default="pending")
    stats_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class AnalysisRun(Base):
    __tablename__ = "analysis_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), index=True)
    skill_id: Mapped[str] = mapped_column(String(64))
    params_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    mode: Mapped[str] = mapped_column(String(32))
    status: Mapped[str] = mapped_column(String(32))
    report_md: Mapped[str | None] = mapped_column(Text, nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)


class TenantSettings(Base):
    __tablename__ = "settings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    tenant_id: Mapped[str] = mapped_column(String(36), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, index=True)
    health_weights: Mapped[dict] = mapped_column(JSON)
    pql_weights: Mapped[dict] = mapped_column(JSON)
    pql_threshold: Mapped[int] = mapped_column(Integer, default=70)
    silent_risk_days: Mapped[int] = mapped_column(Integer, default=7)
    silent_churn_days: Mapped[int] = mapped_column(Integer, default=30)
    retention_window_days: Mapped[int] = mapped_column(Integer, default=14)
    feishu_app_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    feishu_app_secret_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    feishu_mapping_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    llm_base_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    llm_api_key_enc: Mapped[str | None] = mapped_column(Text, nullable=True)
    llm_model: Mapped[str | None] = mapped_column(String(255), nullable=True)
    llm_timeout_sec: Mapped[int] = mapped_column(Integer, default=60)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=_utcnow)
