from pathlib import Path
from pydantic_settings import BaseSettings


REPO_ROOT = Path(__file__).resolve().parents[4]
DATA_DIR = REPO_ROOT / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)


class Settings(BaseSettings):
    app_name: str = "PQL Health API"
    api_prefix: str = "/api/v1"
    secret_key: str = "dev-only-change-me-pql-health"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}"
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]
    feishu_app_id: str | None = None
    feishu_app_secret: str | None = None
    feishu_app_token: str | None = None
    feishu_customers_table_id: str | None = None
    feishu_events_table_id: str | None = None

    class Config:
        env_file = REPO_ROOT / ".env"
        extra = "ignore"


settings = Settings()
