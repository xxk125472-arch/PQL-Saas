import pytest
from fastapi.testclient import TestClient
from jose import jwt
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.db import Base, get_db
from app.core.security import ALGORITHM, safe_decode
from app.main import app
from app.models import RevokedToken


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


def register(client: TestClient) -> str:
    response = client.post(
        "/api/v1/auth/register",
        json={"identifier": "auth-revocation@example.com", "password": "secret12"},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def test_logout_revokes_old_token_and_new_login_works(db_session: Session, client: TestClient):
    old_token = register(client)
    old_headers = {"Authorization": f"Bearer {old_token}"}

    response = client.post("/api/v1/auth/logout", headers=old_headers)

    assert response.status_code == 200, response.text
    assert db_session.get(RevokedToken, safe_decode(old_token)["jti"]) is not None
    old_token_response = client.get("/api/v1/me", headers=old_headers)
    assert old_token_response.status_code == 401
    assert old_token_response.json() == {"detail": "未登录或登录已过期", "code": "UNAUTHORIZED"}

    login_response = client.post(
        "/api/v1/auth/login",
        json={"identifier": "auth-revocation@example.com", "password": "secret12"},
    )
    assert login_response.status_code == 200, login_response.text
    new_token = login_response.json()["access_token"]
    assert new_token != old_token
    new_token_response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {new_token}"})
    assert new_token_response.status_code == 200, new_token_response.text


def test_token_without_jti_is_rejected(client: TestClient):
    token = register(client)
    payload = safe_decode(token)
    payload.pop("jti")
    legacy_token = jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)

    response = client.get("/api/v1/me", headers={"Authorization": f"Bearer {legacy_token}"})

    assert response.status_code == 401
    assert response.json() == {"detail": "未登录或登录已过期", "code": "UNAUTHORIZED"}
