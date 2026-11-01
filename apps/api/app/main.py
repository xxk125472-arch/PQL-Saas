import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.db import init_db

app = FastAPI(title=settings.app_name)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def on_startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict:
    return {"ok": True, "service": "pql-health-api"}


app.include_router(api_router, prefix=settings.api_prefix)

web_dist = Path(os.environ.get("WEB_DIST_DIR", Path(__file__).resolve().parents[3] / "apps" / "web" / "dist"))
if web_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=web_dist / "assets", check_dir=False), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa_fallback(full_path: str) -> FileResponse:
        path = f"/{full_path}"
        if path == "/api" or path.startswith("/api/") or path in {"/health", "/docs", "/openapi.json"}:
            raise HTTPException(status_code=404, detail="Not Found")
        return FileResponse(web_dist / "index.html")
