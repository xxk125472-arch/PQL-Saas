import importlib

from fastapi.testclient import TestClient

import app.main as main


def test_static_files_and_spa_fallback(tmp_path, monkeypatch):
    dist = tmp_path / "dist"
    assets = dist / "assets"
    assets.mkdir(parents=True)
    (dist / "index.html").write_text("<html><body>pql</body></html>", encoding="utf-8")
    (assets / "a.js").write_text("console.log('pql');", encoding="utf-8")
    monkeypatch.setenv("WEB_DIST_DIR", str(dist))
    app = importlib.reload(main).app

    with TestClient(app) as client:
        asset_response = client.get("/assets/a.js")
        assert asset_response.status_code == 200
        assert asset_response.text == "console.log('pql');"

        spa_response = client.get("/customers/123")
        assert spa_response.status_code == 200
        assert spa_response.text == "<html><body>pql</body></html>"

        api_response = client.get("/api/v1/not-found")
        assert api_response.status_code == 404
        assert api_response.json() == {"detail": "Not Found"}

        health_response = client.get("/health")
        assert health_response.status_code == 200
        assert health_response.json() == {"ok": True, "service": "pql-health-api"}


def test_missing_dist_starts_normally(tmp_path, monkeypatch):
    monkeypatch.setenv("WEB_DIST_DIR", str(tmp_path / "missing"))
    app = importlib.reload(main).app

    with TestClient(app) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {"ok": True, "service": "pql-health-api"}
