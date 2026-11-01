import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

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

HTTP_ERROR_DETAILS = {
    401: ("未登录或登录已过期", "UNAUTHORIZED"),
    403: ("无权访问", "FORBIDDEN"),
    404: ("资源不存在", "NOT_FOUND"),
    405: ("请求方法不被允许", "METHOD_NOT_ALLOWED"),
}


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request: Request, exc: StarletteHTTPException) -> JSONResponse:
    if isinstance(exc.detail, dict) and "code" in exc.detail:
        return JSONResponse(status_code=exc.status_code, content=jsonable_encoder(exc.detail), headers=exc.headers)

    detail, code = HTTP_ERROR_DETAILS.get(exc.status_code, ("请求失败", "HTTP_ERROR"))
    if isinstance(exc.detail, str) and any("\u4e00" <= char <= "\u9fff" for char in exc.detail):
        detail = exc.detail
    return JSONResponse(status_code=exc.status_code, content={"detail": detail, "code": code}, headers=exc.headers)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={
            "detail": "请求参数校验失败",
            "code": "VALIDATION_ERROR",
            "errors": jsonable_encoder(exc.errors()),
        },
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
