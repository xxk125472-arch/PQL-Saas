from fastapi import APIRouter

from app.api.v1 import analysis, auth, customers, data, integrations, overview, settings

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(overview.router)
api_router.include_router(customers.router)
api_router.include_router(data.router)
api_router.include_router(settings.router)
api_router.include_router(analysis.router)
api_router.include_router(integrations.router)
