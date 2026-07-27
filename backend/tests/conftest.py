"""Shared pytest fixtures."""

from __future__ import annotations

import shutil
from collections.abc import Callable, Iterator
from contextlib import AbstractContextManager, contextmanager
from pathlib import Path

import pytest
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from alembic import command
from app.core.config import Settings
from app.db.session import get_db
from app.main import create_app

BACKEND_DIR = Path(__file__).resolve().parents[1]


@pytest.fixture
def settings() -> Settings:
    """Explicit settings so a developer's local .env cannot change outcomes."""
    return Settings(
        database_url="sqlite:///:memory:",
        cors_origins=["http://localhost:3000"],
        ai_provider="mock",
    )


@pytest.fixture
def app(settings: Settings, db: Session) -> FastAPI:
    """An app wired to the per-test database.

    Overriding `get_db` rather than pointing settings at the test file means the
    request handler and the test share ONE session. Without that, a row the test
    just created is invisible to the request — it is still in the test's
    uncommitted transaction — and every assertion fails for reasons that look
    like application bugs.
    """
    application = create_app(settings)
    application.dependency_overrides[get_db] = lambda: db
    return application


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    # `raise_server_exceptions=False` lets the catch-all handler produce a real
    # 500 response instead of re-raising into the test, which is the only way to
    # assert on the error envelope for an unhandled exception (T04-F).
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


# ── Database ────────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def migrated_template(tmp_path_factory: pytest.TempPathFactory) -> Path:
    """A database built by running the real migrations, once per session.

    Deliberately NOT `Base.metadata.create_all()`. That would skip the FTS5
    virtual table and its triggers — which exist only in a hand-written
    migration — so every search test would pass against a schema the deployed
    app never has. Running Alembic means the tests exercise what actually ships.
    """
    template = tmp_path_factory.mktemp("db") / "template.sqlite"

    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{template}")
    command.upgrade(config, "head")

    return template


@pytest.fixture
def db_engine(migrated_template: Path, tmp_path: Path) -> Iterator[Engine]:
    """A fresh copy of the migrated database, per test.

    Copying a file beats re-running migrations for every test, and beats sharing
    one database with rollbacks — DDL, triggers and PRAGMA behaviour do not all
    roll back cleanly in SQLite.
    """
    db_path = tmp_path / "test.sqlite"
    shutil.copy(migrated_template, db_path)

    engine = create_engine(f"sqlite:///{db_path}", connect_args={"check_same_thread": False})
    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture
def db(db_engine: Engine) -> Iterator[Session]:
    session = sessionmaker(bind=db_engine, expire_on_commit=False)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def query_counter(db_engine: Engine) -> Iterator[list[str]]:
    """Records every SQL statement executed on the engine.

    Backs the N+1 assertions. Counting statements is the only way to prove a
    lazy-loading strategy actually works — the results look identical either
    way, which is exactly why the regression goes unnoticed.
    """
    statements: list[str] = []

    def record(conn, cursor, statement, parameters, context, executemany):  # type: ignore[no-untyped-def]
        statements.append(statement)

    event.listen(db_engine, "after_cursor_execute", record)
    try:
        yield statements
    finally:
        event.remove(db_engine, "after_cursor_execute", record)


@pytest.fixture
def assert_max_queries(db_engine: Engine) -> Callable[[int], AbstractContextManager[list[str]]]:
    """`with assert_max_queries(8): client.get(...)` — the N+1 guard (T-43.10).

    Counts SELECTs only: inserts scale with what the test seeds, but reads
    scale with the endpoint's loading strategy, and that is the thing being
    guarded. On violation the failure lists every statement, so the offending
    lazy load is in the log rather than needing a rerun under echo.
    """

    @contextmanager
    def guard(budget: int) -> Iterator[list[str]]:
        statements: list[str] = []

        def record(conn, cursor, statement, parameters, context, executemany):  # type: ignore[no-untyped-def]
            if statement.lstrip().upper().startswith("SELECT"):
                statements.append(statement)

        event.listen(db_engine, "after_cursor_execute", record)
        try:
            yield statements
        finally:
            event.remove(db_engine, "after_cursor_execute", record)

        rendered = "\n".join(f"  {i + 1}. {s.splitlines()[0]}" for i, s in enumerate(statements))
        assert len(statements) <= budget, f"{len(statements)} SELECTs, budget {budget}:\n{rendered}"

    return guard


@pytest.fixture(autouse=True)
def reset_rate_limit() -> Iterator[None]:
    """Empty the rate-limiter between tests.

    The limiter keys on client address and TestClient uses the same one for
    every request, so its counters accumulate across the WHOLE session. Two
    regenerate tests passed alone and 429'd in the full run — a textbook shared
    fixture leaking between tests, and one that would have been blamed on
    concurrency rather than on the limiter.

    Autouse: any test that hits a limited endpoint has this problem, and
    remembering to opt in is exactly what does not happen.
    """
    from app.core.rate_limit import limiter

    limiter.reset()
    yield
    limiter.reset()
