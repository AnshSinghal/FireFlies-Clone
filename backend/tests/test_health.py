"""Health endpoint and app-factory smoke tests."""

from __future__ import annotations

from fastapi.testclient import TestClient


def test_health_returns_ok(client: TestClient) -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["ai_provider"] == "mock"
    assert body["version"]


def test_health_sits_outside_the_versioned_prefix(client: TestClient) -> None:
    """Infrastructure endpoints must not move when v2 arrives."""
    assert client.get("/api/v1/health").status_code == 404


def test_openapi_documents_every_operation(client: TestClient) -> None:
    """T-04.3/T04-G in miniature: /docs is only readable if operations are described."""
    schema = client.get("/openapi.json").json()

    assert schema["paths"], "no operations registered"
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            assert operation.get("summary"), f"{method.upper()} {path} has no summary"
            assert operation.get("tags"), f"{method.upper()} {path} has no tags"
