from pathlib import Path
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "PQL Health API"
    api_prefix: str = "/api/v1"
    secret_key: str = "dev-only-change-me-pql-health"
    access_token_expire_minutes: int = 60 * 24 * 7
    database_url: str = f"sqlite:///{(Path(__file__).resolve().parents[3] / 'data' / 'app.db').as_posix()}"
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
