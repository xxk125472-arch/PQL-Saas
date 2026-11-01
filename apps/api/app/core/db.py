import logging
from collections.abc import Generator
from pathlib import Path

from sqlalchemy import create_engine, event, inspect
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings

logger = logging.getLogger(__name__)

API_DIR = Path(__file__).resolve().parents[2]  # apps/api

IS_SQLITE = settings.database_url.startswith("sqlite")
connect_args = {"check_same_thread": False} if IS_SQLITE else {}
engine = create_engine(settings.database_url, connect_args=connect_args)


if IS_SQLITE:

    @event.listens_for(engine, "connect")
    def _sqlite_fk_on(dbapi_connection, _record) -> None:  # pragma: no cover - trivial
        cur = dbapi_connection.cursor()
        cur.execute("PRAGMA foreign_keys=ON")
        cur.close()


SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _alembic_config():
    from alembic.config import Config

    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.database_url)
    cfg.attributes["skip_logging_config"] = True
    return cfg


def init_db() -> None:
    """Bring the schema to Alembic head. Alembic is the single source of schema truth."""
    from alembic import command

    from app import models  # noqa: F401

    if IS_SQLITE:
        db_path = settings.database_url.replace("sqlite:///", "")
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    cfg = _alembic_config()
    tables = set(inspect(engine).get_table_names())
    if "tenants" in tables and "alembic_version" not in tables:
        # Legacy DB from the old create_all path: adopt it without recreating tables.
        logger.warning("Legacy DB without alembic_version; stamping head. Delete the DB to get new constraints.")
        command.stamp(cfg, "head")
        return
    command.upgrade(cfg, "head")
