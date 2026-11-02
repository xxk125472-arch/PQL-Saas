from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.api.deps import bearer, get_current_user
from app.api.v1.schemas import LoginRequest, MeResponse, RegisterRequest, TokenResponse
from app.core.db import get_db
from app.core.security import create_access_token, hash_password, safe_decode, verify_password
from app.models import RevokedToken, Tenant, TenantSettings, User
from app.services.defaults import DEFAULT_HEALTH_WEIGHTS, DEFAULT_PQL_WEIGHTS

router = APIRouter(tags=["auth"])


def _split_identifier(identifier: str) -> tuple[str | None, str | None]:
    identifier = identifier.strip()
    if "@" in identifier:
        return identifier.lower(), None
    return None, identifier


@router.post("/auth/register", response_model=TokenResponse)
def register(body: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email, username = _split_identifier(body.identifier)
    if not email and not username:
        raise HTTPException(status_code=400, detail="identifier required")
    if email and db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "该用户名已注册", "code": "IDENTIFIER_TAKEN"},
        )
    if username and db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "该用户名已注册", "code": "IDENTIFIER_TAKEN"},
        )

    tenant = Tenant(name=f"{(username or email or 'user')}的租户")
    db.add(tenant)
    db.flush()
    user = User(
        tenant_id=tenant.id,
        email=email,
        username=username,
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.add(
        TenantSettings(
            tenant_id=tenant.id,
            health_weights=dict(DEFAULT_HEALTH_WEIGHTS),
            pql_weights=dict(DEFAULT_PQL_WEIGHTS),
        )
    )
    db.commit()
    token = create_access_token(user.id, {"tenant_id": tenant.id})
    return TokenResponse(access_token=token)


@router.post("/auth/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    email, username = _split_identifier(body.identifier)
    user = None
    if email:
        user = db.query(User).filter(User.email == email).first()
    elif username:
        user = db.query(User).filter(User.username == username).first()
    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"detail": "账号或密码错误", "code": "INVALID_CREDENTIALS"},
        )
    token = create_access_token(user.id, {"tenant_id": user.tenant_id})
    return TokenResponse(access_token=token)


@router.post("/auth/logout")
def logout(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    payload = safe_decode(creds.credentials)
    db.add(
        RevokedToken(
            jti=payload["jti"],
            expires_at=datetime.fromtimestamp(payload["exp"], timezone.utc).replace(tzinfo=None),
        )
    )
    db.commit()
    return {"ok": True, "user_id": user.id}


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    tenant = db.get(Tenant, user.tenant_id)
    return MeResponse(
        id=user.id,
        tenant_id=user.tenant_id,
        email=user.email,
        username=user.username,
        tenant_name=tenant.name if tenant else "",
    )
