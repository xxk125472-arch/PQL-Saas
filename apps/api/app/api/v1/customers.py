from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.schemas import CustomerListItem, CustomerListResponse
from app.core.db import get_db
from app.models import Customer, Event, Score, User

router = APIRouter(tags=["customers"])


@router.get("/customers", response_model=CustomerListResponse)
def list_customers(
    stage: str | None = None,
    is_pql: bool | None = None,
    health: Literal["healthy", "fair", "risk"] | None = None,
    source: str | None = None,
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sort_by: Literal["last_active_at", "health_score", "pql_score", "name", "created_at"] = "last_active_at",
    sort_order: Literal["asc", "desc"] = "desc",
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CustomerListResponse:
    tid = user.tenant_id
    health_score = func.coalesce(Score.health_score, 0)
    query = (
        db.query(Customer, Score)
        .outerjoin(Score, and_(Score.tenant_id == tid, Score.customer_id == Customer.id))
        .filter(Customer.tenant_id == tid)
    )
    if stage:
        query = query.filter(Customer.stage == stage)
    if is_pql is not None:
        query = query.filter(func.coalesce(Score.is_pql, False) == is_pql)
    if health == "healthy":
        query = query.filter(health_score >= 80)
    elif health == "fair":
        query = query.filter(health_score >= 50, health_score < 80)
    elif health == "risk":
        query = query.filter(health_score < 50)
    if source:
        query = query.filter(Customer.source == source)
    if q:
        like = f"%{q}%"
        query = query.filter(Customer.name.ilike(like) | Customer.external_id.ilike(like))

    total = query.count()
    sort_columns = {
        "last_active_at": Customer.last_active_at,
        "health_score": health_score,
        "pql_score": func.coalesce(Score.pql_score, 0),
        "name": Customer.name,
        "created_at": Customer.created_at,
    }
    sort_column = sort_columns[sort_by]
    sort_expression = sort_column.asc() if sort_order == "asc" else sort_column.desc()
    rows = (
        query.order_by(sort_expression.nullslast(), Customer.created_at.desc(), Customer.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items = [
        CustomerListItem(
            id=customer.id,
            external_id=customer.external_id,
            name=customer.name,
            stage=customer.stage,
            source=customer.source,
            health_score=round(score.health_score) if score else 0,
            pql_score=round(score.pql_score) if score else 0,
            is_pql=bool(score.is_pql) if score else False,
            suggested_action=score.suggested_action if score else "maintain",
            last_active_at=customer.last_active_at,
            score_stale=score is None,
        )
        for customer, score in rows
    ]
    return CustomerListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/customers/{customer_id}")
def customer_detail(customer_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    tid = user.tenant_id
    c = db.query(Customer).filter(Customer.tenant_id == tid, Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="customer not found")
    events = (
        db.query(Event)
        .filter(Event.tenant_id == tid, Event.customer_id == c.id)
        .order_by(Event.occurred_at.desc())
        .limit(50)
        .all()
    )
    score = (
        db.query(Score)
        .filter(Score.tenant_id == tid, Score.customer_id == c.id)
        .order_by(Score.calculated_at.desc())
        .first()
    )
    return {
        "id": c.id,
        "external_id": c.external_id,
        "name": c.name,
        "stage": c.stage,
        "source": c.source,
        "last_active_at": c.last_active_at,
        "score": None
        if not score
        else {
            "health_score": score.health_score,
            "pql_score": score.pql_score,
            "is_pql": score.is_pql,
            "health_breakdown": score.health_breakdown,
            "pql_breakdown": score.pql_breakdown,
            "suggested_action": score.suggested_action,
            "action_reason": score.action_reason,
            "calculated_at": score.calculated_at,
        },
        "events": [
            {
                "id": e.id,
                "event_type": e.event_type,
                "feature_key": e.feature_key,
                "occurred_at": e.occurred_at,
            }
            for e in events
        ],
    }
