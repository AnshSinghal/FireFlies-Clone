"""Shared pytest fixtures.

T-43.1 grows this into a per-module SQLite engine with a `get_db` override and
factory helpers. For now it provides the app and a client built through the
factory, which is the point of having a factory at all.
"""

from __future__ import annotations

from collections.abc import Iterator

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app


@pytest.fixture
def settings() -> Settings:
    """Explicit settings so a developer's local .env cannot change test outcomes."""
    return Settings(
        database_url="sqlite:///:memory:",
        cors_origins=["http://localhost:3000"],
        ai_provider="mock",
    )


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
def client(app: FastAPI) -> Iterator[TestClient]:
    with TestClient(app) as test_client:
        yield test_client
