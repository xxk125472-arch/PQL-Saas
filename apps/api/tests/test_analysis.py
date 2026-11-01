import json
import logging

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app
from app.models import TenantSettings, User
from app.services import llm
from app.skills.weekly_focus_v1 import SECTION_TITLES


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


def configure_llm(client: TestClient, headers: dict[str, str], api_key: str = "sk-test-secret"):
    return client.put(
        "/api/v1/settings/llm",
        json={"base_url": "https://llm.example.com/v1", "api_key": api_key, "model": "demo-model"},
        headers=headers,
    )


def valid_llm_report(conclusion: str = "- 优先处理风险客户并持续复查。") -> str:
    return f"""# 本周运营焦点

## 1. 本周结论
{conclusion}

## 2. 漏斗与阶段解读
按事实中的漏斗和阶段分布安排复查。

## 3. 优先处理名单（风险）
优先处理事实名单中的风险客户。

## 4. 可放大名单（PQL）
优先跟进事实名单中的 PQL 客户。

## 5. 建议动作汇总
按 reengage 和 expand_or_advocate 执行跟进。

## 6. 数据缺口与下一步
补齐事实中提示的数据缺口。"""


def assert_six_sections(report: str):
    for index, title in enumerate(SECTION_TITLES, 1):
        assert f"## {index}. {title}" in report


def test_rules_only_without_key_has_six_sections_and_history(client: TestClient, monkeypatch):
    headers = register(client, "rules@example.com")

    def must_not_call(*args, **kwargs):
        raise AssertionError("无 Key 时不应调用 LLM")

    monkeypatch.setattr(llm, "chat_completion", must_not_call)
    synthetic = client.post("/api/v1/data/synthetic", headers=headers)
    assert synthetic.status_code == 200, synthetic.text
    response = client.post("/api/v1/analysis/runs", json={"skill_id": "weekly_focus_v1"}, headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mode"] == "rules_only"
    assert payload["status"] == "success"
    assert payload["error"] is None
    assert payload["latency_ms"] >= 0
    assert_six_sections(payload["report_md"])
    assert "当前为规则回退" in payload["report_md"]

    history = client.get("/api/v1/analysis/runs", headers=headers)
    assert history.status_code == 200
    assert len(history.json()) == 1
    detail = client.get(f"/api/v1/analysis/runs/{payload['id']}", headers=headers)
    assert detail.status_code == 200
    assert detail.json()["report_md"] == payload["report_md"]


def test_mock_llm_success_and_key_never_exposed(
    db_session: Session,
    client: TestClient,
    monkeypatch,
    caplog,
):
    headers = register(client, "llm@example.com")
    api_key = "sk-test-secret"
    saved = configure_llm(client, headers, api_key)
    assert saved.status_code == 200, saved.text
    assert saved.json()["api_key_masked"] == "********"
    assert api_key not in saved.text

    user = db_session.query(User).filter(User.email == "llm@example.com").one()
    settings = db_session.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).one()
    assert settings.llm_api_key_enc != api_key
    assert llm.decrypt_api_key(settings.llm_api_key_enc) == api_key

    captured = {}

    def mock_completion(settings, messages, *, json_mode=False):
        captured["messages"] = messages
        captured["json_mode"] = json_mode
        return json.dumps({"report_md": valid_llm_report()}, ensure_ascii=False)

    monkeypatch.setattr(llm, "chat_completion", mock_completion)
    with caplog.at_level(logging.DEBUG):
        tested = client.post("/api/v1/settings/llm/test", headers=headers)
        response = client.post("/api/v1/analysis/runs", json={}, headers=headers)
    assert tested.status_code == 200, tested.text
    assert tested.json() == {"ok": True, "message": "LLM 连接测试成功。"}
    assert response.status_code == 200, response.text
    assert response.json()["mode"] == "llm"
    assert response.json()["error"] is None
    assert_six_sections(response.json()["report_md"])
    assert captured["json_mode"] is True
    assert '"metrics"' in captured["messages"][1]["content"]
    assert api_key not in json.dumps(captured["messages"], ensure_ascii=False)
    assert api_key not in tested.text + response.text
    assert api_key not in caplog.text


def test_invalid_llm_json_falls_back_to_rules(client: TestClient, monkeypatch):
    headers = register(client, "invalid-json@example.com")
    assert configure_llm(client, headers).status_code == 200
    monkeypatch.setattr(llm, "chat_completion", lambda *args, **kwargs: "这不是 JSON")
    response = client.post("/api/v1/analysis/runs", json={}, headers=headers)
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["mode"] == "rules_only"
    assert payload["status"] == "success"
    assert payload["error"].startswith("parse_error：")
    assert_six_sections(payload["report_md"])


def test_llm_invented_number_falls_back_to_rules(client: TestClient, monkeypatch):
    headers = register(client, "invented-number@example.com")
    assert configure_llm(client, headers).status_code == 200
    report = valid_llm_report("- 客户共 987654321 个。")
    monkeypatch.setattr(
        llm,
        "chat_completion",
        lambda *args, **kwargs: json.dumps({"report_md": report}, ensure_ascii=False),
    )
    response = client.post("/api/v1/analysis/runs", json={}, headers=headers)
    assert response.status_code == 200, response.text
    assert response.json()["mode"] == "rules_only"
    assert "事实集之外的数字" in response.json()["error"]
    assert_six_sections(response.json()["report_md"])


def test_llm_gateway_uses_thirty_second_timeout(db_session: Session, client: TestClient, monkeypatch):
    headers = register(client, "timeout@example.com")
    assert configure_llm(client, headers).status_code == 200
    user = db_session.query(User).filter(User.email == "timeout@example.com").one()
    settings = db_session.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).one()
    captured = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "连接成功"}}]}

    def mock_post(url, **kwargs):
        captured["url"] = url
        captured.update(kwargs)
        return Response()

    monkeypatch.setattr(llm.httpx, "post", mock_post)
    content = llm.chat_completion(settings, [{"role": "user", "content": "测试"}])
    assert content == "连接成功"
    assert captured["url"] == "https://llm.example.com/v1/chat/completions"
    assert captured["timeout"] == 30.0
