from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.db import Base, get_db
from app.main import app
from app.models import Customer, Event, ImportJob


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


def upload(client: TestClient, kind: str, content: str, headers: dict[str, str]):
    return client.post(
        f"/api/v1/data/csv/{kind}",
        files={"file": (f"{kind}.csv", content.encode("utf-8"), "text/csv")},
        headers=headers,
    )


CUSTOMERS_CSV = "external_id,name\nC001,客户一\nC002,客户二\n"
EVENTS_CSV = (
    "external_customer_id,event_type,occurred_at,feature_key\n"
    "C001,install,2026-01-01T08:00:00+08:00,\n"
    "C001,first_value,2026-01-02 03:04:05,activation\n"
)


def test_csv_import_success(db_session: Session, client: TestClient):
    headers = register(client, "success@example.com")

    customers_response = upload(client, "customers", "\ufeff" + CUSTOMERS_CSV, headers)
    assert customers_response.status_code == 200, customers_response.text
    assert customers_response.json()["inserted"] == 2
    assert customers_response.json()["updated"] == 0
    assert customers_response.json()["errors"] == []

    events_response = upload(client, "events", EVENTS_CSV, headers)
    assert events_response.status_code == 200, events_response.text
    assert events_response.json()["inserted"] == 2
    assert events_response.json()["skipped"] == 0
    assert events_response.json()["errors"] == []

    customer = db_session.query(Customer).filter(Customer.external_id == "C001").one()
    assert customer.source == "csv"
    assert customer.stage == "churned"
    assert customer.last_active_at == datetime(2026, 1, 2, 3, 4, 5)
    first_event = db_session.query(Event).filter(Event.event_type == "install").one()
    assert first_event.occurred_at == datetime(2026, 1, 1, 0, 0, 0)
    assert first_event.occurred_at.tzinfo is None
    assert db_session.query(ImportJob).count() == 2
    assert {job.status for job in db_session.query(ImportJob)} == {"success"}


def test_csv_reimport_is_idempotent(db_session: Session, client: TestClient):
    headers = register(client, "idempotent@example.com")
    upload(client, "customers", CUSTOMERS_CSV, headers)
    upload(client, "events", EVENTS_CSV, headers)

    customers_response = upload(client, "customers", CUSTOMERS_CSV, headers)
    assert customers_response.status_code == 200
    assert customers_response.json()["inserted"] == 0
    assert customers_response.json()["updated"] == 2

    events_response = upload(client, "events", EVENTS_CSV, headers)
    assert events_response.status_code == 200
    assert events_response.json()["inserted"] == 0
    assert events_response.json()["skipped"] == 2
    assert events_response.json()["errors"] == []
    assert db_session.query(Customer).count() == 2
    assert db_session.query(Event).count() == 2


def test_csv_missing_required_column_returns_chinese_error(db_session: Session, client: TestClient):
    headers = register(client, "missing-column@example.com")

    response = upload(client, "customers", "external_id\nC001\n", headers)

    assert response.status_code == 400
    assert response.json() == {"detail": "缺少必填列：name", "code": "CSV_MISSING_COLUMNS"}
    job = db_session.query(ImportJob).one()
    assert job.status == "failed"
    assert job.stats_json["rows"] == 0
    assert job.stats_json["errors"] == 1
    assert db_session.query(Customer).count() == 0


def test_event_with_unknown_customer_returns_row_error(db_session: Session, client: TestClient):
    headers = register(client, "unknown-customer@example.com")
    upload(client, "customers", CUSTOMERS_CSV, headers)

    response = upload(
        client,
        "events",
        "external_customer_id,event_type,occurred_at\nMISSING,install,2026-01-01T00:00:00Z\n",
        headers,
    )

    assert response.status_code == 200
    assert response.json()["inserted"] == 0
    assert response.json()["errors"] == [{"line": 2, "reason": "客户不存在：MISSING"}]
    job = db_session.query(ImportJob).filter(ImportJob.type == "csv_events").one()
    assert job.status == "success"
    assert job.stats_json["errors"] == 1
    assert db_session.query(Event).count() == 0


def test_csv_import_is_tenant_isolated(db_session: Session, client: TestClient):
    headers_a = register(client, "tenant-a@example.com")
    headers_b = register(client, "tenant-b@example.com")
    upload(client, "customers", "external_id,name\nSHARED,租户 A 客户\nA-ONLY,A 专属客户\n", headers_a)
    upload(client, "customers", "external_id,name\nSHARED,租户 B 客户\n", headers_b)

    response = upload(
        client,
        "events",
        "external_customer_id,event_type,occurred_at\n"
        "A-ONLY,install,2026-01-01T00:00:00Z\n"
        "SHARED,install,2026-01-01T00:00:00Z\n",
        headers_b,
    )

    assert response.status_code == 200
    assert response.json()["inserted"] == 1
    assert response.json()["errors"] == [{"line": 2, "reason": "客户不存在：A-ONLY"}]
    shared_customers = db_session.query(Customer).filter(Customer.external_id == "SHARED").all()
    assert len(shared_customers) == 2
    assert {customer.name for customer in shared_customers} == {"租户 A 客户", "租户 B 客户"}
    tenant_a = db_session.query(Customer).filter(Customer.name == "租户 A 客户").one()
    tenant_b = db_session.query(Customer).filter(Customer.name == "租户 B 客户").one()
    assert tenant_a.tenant_id != tenant_b.tenant_id
    assert db_session.query(Event).filter(Event.tenant_id == tenant_a.tenant_id).count() == 0
    assert db_session.query(Event).filter(Event.tenant_id == tenant_b.tenant_id).count() == 1
