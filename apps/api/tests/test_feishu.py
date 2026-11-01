import logging
from datetime import datetime

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings as app_settings
from app.core.db import Base, get_db
from app.main import app
from app.models import Customer, Event, ImportJob, TenantSettings, User
from app.services.crypto import decrypt_secret

SECRET = "feishu-test-secret-never-expose"
ENV_SECRET = "feishu-env-secret-never-expose"
ENV_CONFIG = {
    "FEISHU_APP_ID": "cli_env_app",
    "FEISHU_APP_SECRET": ENV_SECRET,
    "FEISHU_APP_TOKEN": "base_env_token",
    "FEISHU_CUSTOMERS_TABLE_ID": "tbl_env_customers",
    "FEISHU_EVENTS_TABLE_ID": "tbl_env_events",
}
CONFIG = {
    "app_id": "cli_test_app",
    "app_secret": SECRET,
    "app_token": "base_test_token",
    "customers_table_id": "tbl_customers",
    "events_table_id": "tbl_events",
    "field_mapping": {
        "external_id": "客户ID",
        "name": "客户名称",
        "external_customer_id": "关联客户",
        "event_type": "事件类型",
        "occurred_at": "发生时间",
        "feature_key": "功能",
        "event_type_values": {"安装": "install"},
    },
}


@pytest.fixture(autouse=True)
def isolate_feishu_env(monkeypatch: pytest.MonkeyPatch):
    for name in ENV_CONFIG:
        monkeypatch.setenv(name, "")


def set_env_config(monkeypatch: pytest.MonkeyPatch):
    for name, value in ENV_CONFIG.items():
        monkeypatch.setenv(name, value)


@pytest.fixture()
def db_session():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_session = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = testing_session()
    yield db
    db.close()
    engine.dispose()


@pytest.fixture()
def client(db_session: Session):
    def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def register(client: TestClient, identifier: str) -> dict[str, str]:
    response = client.post("/api/v1/auth/register", json={"identifier": identifier, "password": "secret12"})
    assert response.status_code == 200, response.text
    return {"Authorization": f"Bearer {response.json()['access_token']}"}


def save_config(client: TestClient, headers: dict[str, str]):
    response = client.put("/api/v1/integrations/feishu/config", json=CONFIG, headers=headers)
    assert response.status_code == 200, response.text
    return response


def json_response(method: str, url: str, payload: dict, status_code: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code=status_code,
        json=payload,
        request=httpx.Request(method, f"https://open.feishu.cn{url}"),
    )


def install_http_mock(monkeypatch: pytest.MonkeyPatch, handler):
    original_request = httpx.Client.request

    def request(self, method, url, **kwargs):
        if str(self.base_url).rstrip("/") == "https://open.feishu.cn":
            return handler(self, method, str(url), **kwargs)
        return original_request(self, method, url, **kwargs)

    monkeypatch.setattr(httpx.Client, "request", request)


def test_config_encrypts_secret_and_connection_reads_one_page(
    db_session: Session,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    set_env_config(monkeypatch)
    headers = register(client, "feishu-config@example.com")
    saved = save_config(client, headers)
    assert saved.json()["app_secret_masked"] == f"****{SECRET[-4:]}"
    assert SECRET not in saved.text

    user = db_session.query(User).filter(User.email == "feishu-config@example.com").one()
    settings = db_session.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).one()
    assert settings.feishu_app_secret_enc != SECRET
    assert SECRET not in settings.feishu_app_secret_enc
    assert decrypt_secret(settings.feishu_app_secret_enc) == SECRET

    calls = []

    def mock_request(self, method, url, **kwargs):
        calls.append((method, url, kwargs))
        if "tenant_access_token/internal" in url:
            assert kwargs["json"]["app_id"] == "cli_test_app"
            assert kwargs["json"]["app_secret"] == SECRET
            return json_response(method, url, {"code": 0, "tenant_access_token": "tenant-token", "expire": 7200})
        assert "/tables/tbl_customers/" in url
        assert "/records/search" in url
        return json_response(method, url, {
            "code": 0,
            "data": {
                "items": [{"record_id": "rec1", "fields": {"客户ID": "C001", "客户名称": "客户一"}}],
                "has_more": True,
                "page_token": "must-not-be-requested",
            },
        })

    install_http_mock(monkeypatch, mock_request)
    with caplog.at_level(logging.DEBUG):
        tested = client.post("/api/v1/integrations/feishu/test", headers=headers)
        fetched = client.get("/api/v1/integrations/feishu/config", headers=headers)
        updated = client.put(
            "/api/v1/integrations/feishu/config",
            json={**CONFIG, "app_secret": "****do-not-change"},
            headers=headers,
        )

    assert tested.status_code == 200, tested.text
    assert tested.json() == {"ok": True, "message": "连接成功，已读取客户表 1 条记录", "records_read": 1}
    assert fetched.status_code == 200
    assert fetched.json()["source"] == "database"
    assert fetched.json()["app_id"] == "cli_test_app"
    assert fetched.json()["app_secret_masked"] == f"****{SECRET[-4:]}"
    assert updated.status_code == 200, updated.text
    assert updated.json()["app_secret_masked"] == f"****{SECRET[-4:]}"
    db_session.refresh(settings)
    assert decrypt_secret(settings.feishu_app_secret_enc) == SECRET
    assert SECRET not in tested.text
    assert SECRET not in fetched.text
    assert SECRET not in updated.text
    assert SECRET not in caplog.text
    assert ENV_SECRET not in tested.text
    assert ENV_SECRET not in fetched.text
    assert ENV_SECRET not in caplog.text
    assert sum("/records/search" in url for _, url, _ in calls) == 1
    assert all(call[2].get("params", {}).get("page_token") != "must-not-be-requested" for call in calls)


def test_short_secret_is_fully_masked(
    db_session: Session,
    client: TestClient,
    caplog: pytest.LogCaptureFixture,
):
    short_secret = "abcd"
    headers = register(client, "feishu-short-secret@example.com")

    with caplog.at_level(logging.DEBUG):
        saved = client.put(
            "/api/v1/integrations/feishu/config",
            json={**CONFIG, "app_secret": short_secret},
            headers=headers,
        )
        fetched = client.get("/api/v1/integrations/feishu/config", headers=headers)

    assert saved.status_code == 200, saved.text
    assert saved.json()["app_secret_masked"] == "****"
    assert fetched.status_code == 200, fetched.text
    assert fetched.json()["app_secret_masked"] == "****"
    user = db_session.query(User).filter(User.email == "feishu-short-secret@example.com").one()
    settings = db_session.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).one()
    assert decrypt_secret(settings.feishu_app_secret_enc) == short_secret
    assert short_secret not in saved.text
    assert short_secret not in fetched.text
    assert short_secret not in caplog.text


def test_env_config_fallback_supports_get_test_and_sync(
    db_session: Session,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
):
    set_env_config(monkeypatch)
    headers = register(client, "feishu-env@example.com")

    def mock_request(self, method, url, **kwargs):
        if "tenant_access_token/internal" in url:
            assert kwargs["json"] == {"app_id": "cli_env_app", "app_secret": ENV_SECRET}
            return json_response(method, url, {"code": 0, "tenant_access_token": "tenant-token"})
        assert "/apps/base_env_token/" in url
        if "/tables/tbl_env_customers/" in url:
            return json_response(method, url, {
                "code": 0,
                "data": {
                    "items": [{"record_id": "c1", "fields": {"external_id": "CENV", "name": "环境客户"}}],
                    "has_more": False,
                },
            })
        assert "/tables/tbl_env_events/" in url
        return json_response(method, url, {
            "code": 0,
            "data": {
                "items": [{
                    "record_id": "e1",
                    "fields": {
                        "external_customer_id": "CENV",
                        "event_type": "install",
                        "occurred_at": 1767225600000,
                        "feature_key": "env-feature",
                    },
                }],
                "has_more": False,
            },
        })

    install_http_mock(monkeypatch, mock_request)
    with caplog.at_level(logging.DEBUG):
        fetched = client.get("/api/v1/integrations/feishu/config", headers=headers)
        tested = client.post("/api/v1/integrations/feishu/test", headers=headers)
        synced = client.post("/api/v1/integrations/feishu/sync", headers=headers)

    assert fetched.status_code == 200, fetched.text
    assert fetched.json() == {
        "configured": True,
        "app_id": "cli_env_app",
        "app_secret_masked": f"****{ENV_SECRET[-4:]}",
        "app_token": "base_env_token",
        "customers_table_id": "tbl_env_customers",
        "events_table_id": "tbl_env_events",
        "field_mapping": {
            "external_id": "external_id",
            "name": "name",
            "external_customer_id": "external_customer_id",
            "event_type": "event_type",
            "occurred_at": "occurred_at",
            "feature_key": "feature_key",
            "event_type_values": {},
        },
        "source": "env",
    }
    assert tested.status_code == 200, tested.text
    assert tested.json()["records_read"] == 1
    assert synced.status_code == 200, synced.text
    assert synced.json()["customers_inserted"] == 1
    assert synced.json()["events_inserted"] == 1
    assert synced.json()["errors"] == []
    customer = db_session.query(Customer).one()
    assert (customer.external_id, customer.name) == ("CENV", "环境客户")
    event = db_session.query(Event).one()
    assert (event.event_type, event.feature_key) == ("install", "env-feature")
    assert ENV_SECRET not in fetched.text
    assert ENV_SECRET not in tested.text
    assert ENV_SECRET not in synced.text
    assert ENV_SECRET not in caplog.text


def test_sync_paginates_maps_and_is_idempotent(
    db_session: Session,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = register(client, "feishu-sync@example.com")
    save_config(client, headers)
    calls = []

    def mock_request(self, method, url, **kwargs):
        calls.append((method, url, kwargs))
        if "tenant_access_token/internal" in url:
            return json_response(method, url, {"code": 0, "tenant_access_token": "tenant-token"})
        if "/tables/tbl_customers/" in url:
            if kwargs["params"].get("page_token") == "customers-page-2":
                data = {
                    "items": [{"record_id": "c2", "fields": {"客户ID": "C002", "客户名称": ["客户", "二"]}}],
                    "has_more": False,
                }
            else:
                data = {
                    "items": [{"record_id": "c1", "fields": {"客户ID": "C001", "客户名称": "客户一"}}],
                    "has_more": True,
                    "page_token": "customers-page-2",
                }
            return json_response(method, url, {"code": 0, "data": data})
        assert "/tables/tbl_events/" in url
        event = {
            "record_id": "e1",
            "fields": {"关联客户": "C001", "事件类型": "安装", "发生时间": 1767225600000, "功能": " onboarding "},
        }
        return json_response(method, url, {
            "code": 0,
            "data": {"items": [event, {**event, "record_id": "e1-duplicate"}], "has_more": False},
        })

    install_http_mock(monkeypatch, mock_request)
    first = client.post("/api/v1/integrations/feishu/sync", headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["customers_read"] == 2
    assert first.json()["customers_inserted"] == 2
    assert first.json()["customers_updated"] == 0
    assert first.json()["events_inserted"] == 1
    assert first.json()["events_skipped"] == 1
    assert first.json()["customers_recomputed"] == 2
    assert first.json()["errors"] == []

    customers = db_session.query(Customer).order_by(Customer.external_id).all()
    assert [(item.external_id, item.name, item.source) for item in customers] == [
        ("C001", "客户一", "feishu"),
        ("C002", "客户二", "feishu"),
    ]
    event = db_session.query(Event).one()
    assert event.event_type == "install"
    assert event.feature_key == "onboarding"
    assert event.occurred_at == datetime(2026, 1, 1, 0, 0, 0)
    assert event.raw_payload["source"] == "feishu"
    assert db_session.query(ImportJob).one().status == "success"

    second = client.post("/api/v1/integrations/feishu/sync", headers=headers)
    assert second.status_code == 200, second.text
    assert second.json()["customers_inserted"] == 0
    assert second.json()["customers_updated"] == 2
    assert second.json()["events_inserted"] == 0
    assert second.json()["events_skipped"] == 2
    assert db_session.query(Customer).count() == 2
    assert db_session.query(Event).count() == 1
    assert db_session.query(ImportJob).count() == 2
    assert all("/records/search" in url for method, url, _ in calls if "/open-apis/bitable/" in url)
    assert any(
        "/tables/tbl_customers/" in url and kwargs["params"].get("page_token") == "customers-page-2"
        for _, url, kwargs in calls
    )


def test_feishu_error_is_chinese_and_marks_import_failed(
    db_session: Session,
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = register(client, "feishu-error@example.com")
    save_config(client, headers)

    def mock_request(self, method, url, **kwargs):
        if "tenant_access_token/internal" in url:
            return json_response(method, url, {"code": 0, "tenant_access_token": "tenant-token"})
        return json_response(method, url, {"code": 1254003, "msg": "WrongBaseToken"})

    install_http_mock(monkeypatch, mock_request)
    response = client.post("/api/v1/integrations/feishu/sync", headers=headers)

    assert response.status_code == 502
    assert response.json() == {
        "detail": "多维表格 app_token 错误，请检查配置",
        "code": "FEISHU_INVALID_APP_TOKEN",
    }
    assert SECRET not in response.text
    job = db_session.query(ImportJob).one()
    assert job.status == "failed"
    assert job.error == "多维表格 app_token 错误，请检查配置"
    assert db_session.query(Customer).count() == 0


def test_feishu_timeout_is_chinese(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    headers = register(client, "feishu-timeout@example.com")
    save_config(client, headers)

    def mock_request(self, method, url, **kwargs):
        raise httpx.TimeoutException("timeout", request=httpx.Request(method, f"https://open.feishu.cn{url}"))

    install_http_mock(monkeypatch, mock_request)
    response = client.post("/api/v1/integrations/feishu/test", headers=headers)

    assert response.status_code == 504
    assert response.json() == {"detail": "连接飞书超时，请稍后重试", "code": "FEISHU_TIMEOUT"}
    assert SECRET not in response.text


def test_config_without_credentials_returns_empty_config_but_actions_fail(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
):
    for name in ENV_CONFIG:
        monkeypatch.setenv(name, "")
        monkeypatch.setattr(app_settings, name.lower(), None)
    headers = register(client, "feishu-empty@example.com")

    response = client.get("/api/v1/integrations/feishu/config", headers=headers)

    assert response.status_code == 200, response.text
    assert response.json() == {
        "configured": False,
        "app_id": "",
        "app_secret_masked": None,
        "app_token": "",
        "customers_table_id": "",
        "events_table_id": "",
        "field_mapping": {},
        "source": "none",
    }
    for action in ("test", "sync"):
        action_response = client.post(f"/api/v1/integrations/feishu/{action}", headers=headers)
        assert action_response.status_code == 400
        assert action_response.json() == {
            "detail": "请先配置飞书 App ID 和 App Secret",
            "code": "FEISHU_CREDENTIALS_MISSING",
        }


def test_sync_without_config_returns_unified_chinese_error(client: TestClient):
    headers = register(client, "feishu-missing@example.com")
    response = client.post("/api/v1/integrations/feishu/sync", headers=headers)

    assert response.status_code == 400
    assert response.json() == {
        "detail": "请先配置飞书 App ID 和 App Secret",
        "code": "FEISHU_CREDENTIALS_MISSING",
    }
