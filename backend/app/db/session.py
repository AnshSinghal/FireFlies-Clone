"""Engine, session factory, and the SQLite pragmas that make the schema behave."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings

if TYPE_CHECKING:
    from collections.abc import Generator


@event.listens_for(Engine, "connect")
def _set_sqlite_pragmas(dbapi_connection: Any, _connection_record: Any) -> None:
    """Apply per-connection SQLite pragmas (T-03.8).

    These are per-CONNECTION, not per-database, so they must be set on every
    connect — hence an event hook rather than a one-off at startup.

    `foreign_keys=ON` is the important one. SQLite ships with foreign key
    enforcement OFF by default, which means every `ondelete="CASCADE"` in this
    codebase silently does nothing and orphan rows accumulate invisibly. The
    cascade tests in tests/test_schema.py would pass while deleting nothing.

    Registration happens on import, which is why `app/db/__init__.py` imports
    this module unconditionally — see the note there.
    """
    # Fires for every engine, including a non-SQLite one later. Matched loosely
    # because the DBAPI module name varies across drivers and Python builds
    # (`sqlite3`, `_sqlite3`, `pysqlite3.dbapi2`); an exact-match guard here
    # silently skipped the pragmas once already.
    if "sqlite" not in (type(dbapi_connection).__module__ or "").lower():
        return

    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        # WAL lets readers proceed during a write. Silently a no-op for
        # in-memory databases, which is fine — nothing concurrent runs there.
        cursor.execute("PRAGMA journal_mode=WAL")
        # NORMAL trades an fsync per commit for durability only against OS
        # crash, not process crash. Correct for a demo; revisit for real money.
        cursor.execute("PRAGMA synchronous=NORMAL")
        # Wait rather than raising "database is locked" the instant two writers
        # collide — the seeder and a request can overlap.
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


def create_db_engine(database_url: str | None = None) -> Engine:
    settings = get_settings()
    url = database_url or settings.database_url

    connect_args: dict[str, Any] = {}
    if url.startswith("sqlite"):
        # FastAPI serves a request on a threadpool thread, which is not the one
        # that created the connection. SQLite objects to that unless told not to.
        connect_args["check_same_thread"] = False

    return create_engine(url, connect_args=connect_args, future=True)


engine = create_db_engine()

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """FastAPI dependency. Closes the session even when the handler raises."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
