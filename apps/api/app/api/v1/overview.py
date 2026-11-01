from fastapi import APIRouter, Depends
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.schemas import FunnelResponse
from app.core.db import get_db
from app.models import Customer, Event, Score, User

router = APIRouter(tags=["overview"])


@router.get("/overview/funnel", response_model=FunnelResponse)
def funnel(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> FunnelResponse:
    tid = user.tenant_id

    def ever_had(event_type: str) -> int:
        return (
            db.query(func.count(func.distinct(Event.customer_id)))
            .filter(Event.tenant_id == tid, Event.event_type == event_type)
            .scalar()
            or 0
        )

    installed = ever_had("install")
    first_value = ever_had("first_value")
    reuse = ever_had("reuse")
    retention = (
        db.query(func.count(Customer.id))
        .filter(Customer.tenant_id == tid, Customer.stage == "retention")
        .scalar()
        or 0
    )
    customer_total = db.query(func.count(Customer.id)).filter(Customer.tenant_id == tid).scalar() or 0
    pql_count = (
        db.query(func.count(Customer.id))
        .join(Score, and_(Score.tenant_id == tid, Score.customer_id == Customer.id))
        .filter(Customer.tenant_id == tid, Score.is_pql.is_(True))
        .scalar()
        or 0
    )
    at_risk_count = (
        db.query(func.count(Customer.id)).filter(Customer.tenant_id == tid, Customer.stage == "at_risk").scalar()
        or 0
    )
    churned_count = (
        db.query(func.count(Customer.id)).filter(Customer.tenant_id == tid, Customer.stage == "churned").scalar()
        or 0
    )

    def rate(a: int, b: int) -> float | None:
        if a == 0:
            return None
        return round(b / a, 4)

    return FunnelResponse(
        installed=installed,
        first_value=first_value,
        reuse=reuse,
        retention=retention,
        customer_total=customer_total,
        pql_count=pql_count,
        at_risk_count=at_risk_count,
        churned_count=churned_count,
        conversion_rates={
            "installed_to_first_value": rate(installed, first_value),
            "first_value_to_reuse": rate(first_value, reuse),
            "reuse_to_retention": rate(reuse, retention),
        },
    )
