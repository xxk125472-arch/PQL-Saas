from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.core.timeutil import utcnow
from app.main import app
from app.models import Customer, Event, Score, TenantSettings, User
from app.services.defaults import DEFAULT_HEALTH_WEIGHTS, DEFAULT_PQL_WEIGHTS
from app.services.scoring import compute_health, compute_pql, recalculate_tenant


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


def weighted_total(parts: dict[str, float], weights: dict[str, float]) -> float:
    return sum(parts[key] * weights[key] for key in weights)


def test_default_weights_and_breakdown_totals():
    assert DEFAULT_HEALTH_WEIGHTS == {
        "recency": 0.30,
        "frequency": 0.25,
        "depth": 0.20,
        "stage_progress": 0.25,
    }
    assert DEFAULT_PQL_WEIGHTS == {
        "activation": 0.35,
        "engagement": 0.30,
        "health": 0.20,
        "recency_boost": 0.15,
    }
    assert sum(DEFAULT_HEALTH_WEIGHTS.values()) == pytest.approx(1.0)
    assert sum(DEFAULT_PQL_WEIGHTS.values()) == pytest.approx(1.0)

    now = datetime(2026, 11, 1, 12, 0, 0)
    health, health_parts = compute_health(
        stage="reuse",
        last_active_at=now - timedelta(days=3, hours=6),
        event_count_14d=7,
        feature_count_14d=3,
        weights=DEFAULT_HEALTH_WEIGHTS,
        now=now,
    )
    pql, pql_parts = compute_pql(
        stage="reuse",
        health=health,
        frequency=health_parts["frequency"],
        last_active_at=now - timedelta(days=3, hours=6),
        weights=DEFAULT_PQL_WEIGHTS,
        now=now,
    )

    assert set(health_parts) == set(DEFAULT_HEALTH_WEIGHTS)
    assert set(pql_parts) == set(DEFAULT_PQL_WEIGHTS)
    assert health == pytest.approx(weighted_total(health_parts, DEFAULT_HEALTH_WEIGHTS), abs=0.01)
    assert pql == pytest.approx(weighted_total(pql_parts, DEFAULT_PQL_WEIGHTS), abs=0.01)
    assert pql_parts["engagement"] == pytest.approx((75 + 70) / 2)


def test_first_value_engagement_uses_stage_progress():
    _, parts = compute_pql(
        stage="first_value",
        health=60,
        frequency=40,
        last_active_at=None,
        weights=DEFAULT_PQL_WEIGHTS,
    )
    assert parts["engagement"] == pytest.approx((55 + 40) / 2)


def test_settings_threshold_and_weights_recalculate_customer_score(
    db_session: Session,
    client: TestClient,
):
    headers = register(client, "weights@example.com")
    user = db_session.query(User).filter(User.email == "weights@example.com").one()
    settings = db_session.query(TenantSettings).filter(TenantSettings.tenant_id == user.tenant_id).one()
    customer = Customer(
        id="weighted-customer",
        tenant_id=user.tenant_id,
        external_id="WEIGHTED-1",
        name="权重客户",
        source="csv",
    )
    db_session.add(customer)
    now = utcnow()
    milestones = [("install", 5), ("first_value", 4), ("reuse", 3)]
    for index, (event_type, days_ago) in enumerate(milestones):
        db_session.add(Event(
            id=f"milestone-{index}",
            tenant_id=user.tenant_id,
            customer_id=customer.id,
            event_type=event_type,
            occurred_at=now - timedelta(days=days_ago),
        ))
    for index in range(4):
        db_session.add(Event(
            id=f"feature-{index}",
            tenant_id=user.tenant_id,
            customer_id=customer.id,
            event_type="feature_use",
            feature_key=f"feature-{index % 3}",
            occurred_at=now - timedelta(days=3 + index % 2, hours=index + 1),
        ))
    db_session.flush()
    assert recalculate_tenant(db_session, user.tenant_id, settings, now) == 1
    db_session.commit()

    detail_response = client.get(f"/api/v1/customers/{customer.id}", headers=headers)
    assert detail_response.status_code == 200, detail_response.text
    initial_score = detail_response.json()["score"]
    assert initial_score["is_pql"] is True
    assert initial_score["health_score"] == pytest.approx(
        weighted_total(initial_score["health_breakdown"], DEFAULT_HEALTH_WEIGHTS), abs=0.01
    )
    assert initial_score["pql_score"] == pytest.approx(
        weighted_total(initial_score["pql_breakdown"], DEFAULT_PQL_WEIGHTS), abs=0.01
    )

    threshold_response = client.put("/api/v1/settings", json={"pql_threshold": 92}, headers=headers)
    assert threshold_response.status_code == 200, threshold_response.text
    threshold_detail = client.get(f"/api/v1/customers/{customer.id}", headers=headers).json()["score"]
    assert threshold_detail["pql_score"] < 92
    assert threshold_detail["is_pql"] is False

    invalid_weights = {"recency": 0.9, "frequency": 0.0, "depth": 0.0, "stage_progress": 0.0}
    invalid_response = client.put(
        "/api/v1/settings",
        json={"health_weights": invalid_weights},
        headers=headers,
    )
    assert invalid_response.status_code == 400

    stage_only_weights = {"recency": 0.0, "frequency": 0.0, "depth": 0.0, "stage_progress": 1.0}
    weights_response = client.put(
        "/api/v1/settings",
        json={"health_weights": stage_only_weights},
        headers=headers,
    )
    assert weights_response.status_code == 200, weights_response.text
    recalculated = client.get(f"/api/v1/customers/{customer.id}", headers=headers).json()["score"]
    assert recalculated["health_score"] == 100
    assert recalculated["health_breakdown"]["stage_progress"] == 100


def test_customer_filters_total_sort_and_query_count(db_session: Session, client: TestClient):
    headers = register(client, "filters@example.com")
    user = db_session.query(User).filter(User.email == "filters@example.com").one()
    now = utcnow()
    for index in range(12):
        customer = Customer(
            id=f"matching-{index}",
            tenant_id=user.tenant_id,
            external_id=f"ALPHA-{index:02}",
            name=f"Alpha {index:02}",
            stage="retention",
            source="csv",
            created_at=now - timedelta(minutes=index),
            last_active_at=now - timedelta(days=index),
        )
        db_session.add(customer)
        db_session.add(Score(
            id=f"matching-score-{index}",
            tenant_id=user.tenant_id,
            customer_id=customer.id,
            health_score=80 + index,
            pql_score=90,
            is_pql=True,
            suggested_action="maintain",
        ))
    for index in range(8):
        customer = Customer(
            id=f"other-{index}",
            tenant_id=user.tenant_id,
            external_id=f"ALPHA-OTHER-{index}",
            name=f"Alpha Other {index}",
            stage="reuse" if index < 4 else "retention",
            source="synthetic" if index >= 4 else "csv",
            last_active_at=now,
        )
        db_session.add(customer)
        db_session.add(Score(
            id=f"other-score-{index}",
            tenant_id=user.tenant_id,
            customer_id=customer.id,
            health_score=90 if index < 6 else 40,
            pql_score=90,
            is_pql=index < 6,
            suggested_action="maintain",
        ))
    db_session.commit()

    statements = []

    def count_statement(_conn, _cursor, statement, _parameters, _context, _executemany):
        normalized = " ".join(statement.split()).lower()
        if "from customers" in normalized:
            statements.append(normalized)

    bind = db_session.get_bind()
    event.listen(bind, "before_cursor_execute", count_statement)
    try:
        response = client.get(
            "/api/v1/customers",
            params={
                "stage": "retention",
                "is_pql": "true",
                "health": "healthy",
                "source": "csv",
                "q": "alpha",
                "page": 1,
                "page_size": 5,
                "sort_by": "health_score",
                "sort_order": "desc",
            },
            headers=headers,
        )
    finally:
        event.remove(bind, "before_cursor_execute", count_statement)

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["total"] == 12
    assert len(payload["items"]) == 5
    assert all(item["source"] == "csv" for item in payload["items"])
    assert [item["health_score"] for item in payload["items"]] == sorted(
        [item["health_score"] for item in payload["items"]], reverse=True
    )
    assert len(statements) == 2

    all_pql = client.get("/api/v1/customers", params={"is_pql": "true", "page_size": 100}, headers=headers)
    funnel = client.get("/api/v1/overview/funnel", headers=headers)
    assert all_pql.json()["total"] == 18
    assert funnel.json()["pql_count"] == all_pql.json()["total"]
