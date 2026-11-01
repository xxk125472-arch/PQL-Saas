from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    identifier: str = Field(..., description="email if contains @, else username")
    password: str = Field(..., min_length=6)


class LoginRequest(BaseModel):
    identifier: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class MeResponse(BaseModel):
    id: str
    tenant_id: str
    email: str | None
    username: str | None
    tenant_name: str


class FunnelResponse(BaseModel):
    installed: int
    first_value: int
    reuse: int
    retention: int
    customer_total: int
    pql_count: int
    at_risk_count: int
    churned_count: int
    conversion_rates: dict[str, float | None]


class CustomerListItem(BaseModel):
    id: str
    external_id: str
    name: str
    stage: str
    health_score: int
    pql_score: int
    is_pql: bool
    suggested_action: str
    last_active_at: datetime | None
    score_stale: bool = False


class CustomerListResponse(BaseModel):
    items: list[CustomerListItem]
    total: int
    page: int
    page_size: int


class SettingsResponse(BaseModel):
    health_weights: dict[str, float]
    pql_weights: dict[str, float]
    pql_threshold: int
    silent_risk_days: int
    silent_churn_days: int
    retention_window_days: int
    feishu_app_id: str | None = None
    feishu_mapping_json: dict[str, Any] | None = None
    llm_base_url: str | None = None
    llm_model: str | None = None
    llm_timeout_sec: int = 60
    llm_api_key_masked: str | None = None
    feishu_app_secret_masked: str | None = None


class SettingsUpdate(BaseModel):
    health_weights: dict[str, float] | None = None
    pql_weights: dict[str, float] | None = None
    pql_threshold: int | None = None
    silent_risk_days: int | None = None
    silent_churn_days: int | None = None
    retention_window_days: int | None = None
    feishu_app_id: str | None = None
    feishu_app_secret: str | None = None
    feishu_mapping_json: dict[str, Any] | None = None
    llm_base_url: str | None = None
    llm_api_key: str | None = None
    llm_model: str | None = None
    llm_timeout_sec: int | None = None


class AnalysisRunCreate(BaseModel):
    skill_id: str = "weekly_focus_v1"
    params: dict[str, Any] = Field(default_factory=dict)


class AnalysisRunResponse(BaseModel):
    id: str
    skill_id: str
    params_json: dict[str, Any] | None
    mode: str
    status: str
    report_md: str | None
    error: str | None
    latency_ms: int | None
    created_at: datetime


class SkillItem(BaseModel):
    id: str
    name: str
    description: str
    enabled: bool = True
