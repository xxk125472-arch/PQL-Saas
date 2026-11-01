import importlib

from fastapi.testclient import TestClient

import app.main as main


def test_unauthorized_returns_chinese_error_and_challenge():
    response = TestClient(main.app).get("/api/v1/me")

    assert response.status_code == 401
    assert response.json() == {"detail": "未登录或登录已过期", "code": "UNAUTHORIZED"}
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_unknown_api_path_returns_chinese_404():
    response = TestClient(main.app).get("/api/v1/not-found")

    assert response.status_code == 404
    assert response.json() == {"detail": "资源不存在", "code": "NOT_FOUND"}


def test_validation_error_returns_chinese_error_and_field_details():
    response = TestClient(main.app).post("/api/v1/auth/register", json={})

    assert response.status_code == 422
    body = response.json()
    assert body["detail"] == "请求参数校验失败"
    assert body["code"] == "VALIDATION_ERROR"
    assert {tuple(error["loc"]) for error in body["errors"]} == {
        ("body", "identifier"),
        ("body", "password"),
    }
    assert all(error["msg"] for error in body["errors"])


def test_spa_fallback_still_returns_index(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("<html><body>pql</body></html>", encoding="utf-8")
    monkeypatch.setenv("WEB_DIST_DIR", str(dist))
    test_app = importlib.reload(main).app

    response = TestClient(test_app).get("/customers/123")

    assert response.status_code == 200
    assert response.text == "<html><body>pql</body></html>"
