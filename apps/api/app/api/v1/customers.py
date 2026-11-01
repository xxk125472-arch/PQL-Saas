from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
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
    q: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> CustomerListResponse:
    tid = user.tenant_id
    query = db.query(Customer).filter(Customer.tenant_id == tid)
    if stage:
        query = query.filter(Customer.stage == stage)
    if q:
        like = f"%{q}%"
        query = query.filter((Customer.name.ilike(like)) | (Customer.external_id.ilike(like)))
    total = query.count()
    rows = (
        query.order_by(Customer.last_active_at.desc().nullslast(), Customer.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )
    items: list[CustomerListItem] = []
    for c in rows:
        score = (
            db.query(Score)
            .filter(Score.tenant_id == tid, Score.customer_id == c.id)
            .order_by(Score.calculated_at.desc())
            .first()
        )
        if is_pql is True and (not score or not score.is_pql):
            continue
        if is_pql is False and score and score.is_pql:
            continue
        items.append(
            CustomerListItem(
                id=c.id,
                external_id=c.external_id,
                name=c.name,
                stage=c.stage,
                health_score=score.health_score if score else 0,
                pql_score=score.pql_score if score else 0,
                is_pql=bool(score.is_pql) if score else False,
                suggested_action=score.suggested_action if score else "maintain",
                last_active_at=c.last_active_at,
                score_stale=score is None,
            )
        )
    # is_pql filter applied after score join changes total; recompute when filtering
    if is_pql is not None:
        total = len(items)
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
