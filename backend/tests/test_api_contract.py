"""API contract (T-04, cases T04-A → T04-I).

These assert the CONVENTIONS rather than any one feature: the error envelope,
the pagination envelope, the light/heavy schema split, and that /docs is
actually usable. They are the tests most likely to catch a regression in an
endpoint written months from now, because every new endpoint inherits them.
"""

from __future__ import annotations

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from tests.factories import make_full_meeting, make_meeting, make_user

PAGINATION_KEYS = {"items", "page", "page_size", "total", "total_pages", "has_next"}


# ── T04-A · error envelope ──────────────────────────────────────────────────


def test_unknown_meeting_returns_the_error_envelope(client: TestClient, db: Session) -> None:
    make_user(db)
    db.commit()

    response = client.get("/api/v1/meetings/99999")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "MEETING_NOT_FOUND"
    assert body["error"]["message"]
    assert body["error"]["details"]["meeting_id"] == 99999


def test_deleted_meeting_returns_410_not_404(client: TestClient, db: Session) -> None:
    """A deleted meeting is restorable; an unknown id is a dead end.

    Collapsing both into 404 throws away the distinction the UI needs to offer
    an undo.
    """
    meeting = make_full_meeting(db)
    client.delete(f"/api/v1/meetings/{meeting.id}")

    response = client.get(f"/api/v1/meetings/{meeting.id}")

    assert response.status_code == status.HTTP_410_GONE
    assert response.json()["error"]["code"] == "MEETING_DELETED"


def test_unknown_route_still_uses_the_envelope(client: TestClient) -> None:
    """Even FastAPI's own 404 is reshaped, so the client has one parsing path."""
    body = client.get("/api/v1/does-not-exist").json()
    assert body["error"]["code"] == "NOT_FOUND"


# ── T04-B · validation ──────────────────────────────────────────────────────


@pytest.mark.parametrize("title", ["", "   "])
def test_creating_a_meeting_without_a_title_is_rejected(
    client: TestClient, db: Session, title: str
) -> None:
    make_user(db)
    db.commit()

    response = client.post("/api/v1/meetings", json={"title": title})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    body = response.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    # Keyed by field path so a form library can attach the message to the input.
    assert "title" in body["error"]["details"]


def test_validation_details_use_dotted_field_paths(client: TestClient, db: Session) -> None:
    make_user(db)
    db.commit()

    response = client.post("/api/v1/meetings", json={"title": "ok", "started_at": "not-a-date"})

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert "started_at" in response.json()["error"]["details"]


# ── T04-C · pagination clamping ─────────────────────────────────────────────


def test_oversized_page_size_is_clamped_not_rejected(client: TestClient, db: Session) -> None:
    """A client asking for 500 gets 100, not a 422 telling them to ask again."""
    make_full_meeting(db)

    response = client.get("/api/v1/meetings", params={"page_size": 500})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["page_size"] == 100


def test_page_beyond_the_end_is_empty_not_an_error(client: TestClient, db: Session) -> None:
    make_full_meeting(db)

    response = client.get("/api/v1/meetings", params={"page": 99})

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"] == []


def test_page_zero_is_a_validation_error(client: TestClient, db: Session) -> None:
    make_full_meeting(db)
    assert client.get("/api/v1/meetings", params={"page": 0}).status_code == 422


# ── T04-D · the light/heavy split ───────────────────────────────────────────


def test_list_rows_never_carry_the_transcript(client: TestClient, db: Session) -> None:
    """The deduction PLAN.md T-04.4 warns about, asserted.

    A list row shipping segments means ~1,200 of them per meeting, twenty
    meetings per page.
    """
    make_full_meeting(db)

    row = client.get("/api/v1/meetings").json()["items"][0]

    for forbidden in ("segments", "transcript", "summary", "action_items"):
        assert forbidden not in row, f"{forbidden!r} leaked into the list row"

    # It should still carry what the Notebook row actually renders.
    for expected in ("title", "started_at", "duration_seconds", "host", "action_item_counts"):
        assert expected in row


def test_detail_carries_metadata_but_not_inline_segments(client: TestClient, db: Session) -> None:
    meeting = make_full_meeting(db)

    body = client.get(f"/api/v1/meetings/{meeting.id}").json()

    assert body["segment_count"] == 50
    # Segments are paginated separately (T-17.2) rather than inlined.
    assert "segments" not in body


# ── T04-E · pagination envelope ─────────────────────────────────────────────


def test_list_endpoints_use_the_full_envelope(client: TestClient, db: Session) -> None:
    make_full_meeting(db)

    body = client.get("/api/v1/meetings").json()

    assert set(body) >= PAGINATION_KEYS
    assert body["page"] == 1
    assert body["total"] == 1
    assert body["total_pages"] == 1
    assert body["has_next"] is False


def test_has_next_is_true_when_more_pages_exist(client: TestClient, db: Session) -> None:
    user = make_user(db)
    for i in range(5):
        make_meeting(db, host=user, title=f"Meeting {i}")
    db.commit()

    body = client.get("/api/v1/meetings", params={"page_size": 2}).json()

    assert body["total"] == 5
    assert body["total_pages"] == 3
    assert body["has_next"] is True
    assert len(body["items"]) == 2


# ── T04-F · unhandled exceptions ────────────────────────────────────────────


def test_unhandled_exception_returns_a_generic_500(client: TestClient, app, db: Session) -> None:
    """No traceback, no table names, no file paths — but a correlatable id."""
    from app.api.v1.routers import meetings as meetings_router

    @app.get("/api/v1/_boom")
    def boom() -> None:
        raise RuntimeError("private detail: connection string is ...")

    response = client.get("/api/v1/_boom")

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    body = response.json()
    assert body["error"]["code"] == "INTERNAL_ERROR"
    assert "private detail" not in response.text
    assert "RuntimeError" not in response.text
    # The request id is how a user's report finds the log line.
    assert body["error"]["details"].get("request_id")
    assert meetings_router  # keep the import meaningful for linters


def test_every_response_carries_a_request_id(client: TestClient, db: Session) -> None:
    make_full_meeting(db)
    response = client.get("/api/v1/meetings")
    assert response.headers.get("X-Request-ID")


def test_an_inbound_request_id_is_preserved(client: TestClient, db: Session) -> None:
    """So a trace survives a proxy or a frontend that already generates one."""
    make_full_meeting(db)
    response = client.get("/api/v1/meetings", headers={"X-Request-ID": "trace-me"})
    assert response.headers["X-Request-ID"] == "trace-me"


# ── T04-G · the docs are the deliverable ────────────────────────────────────


def test_every_operation_is_documented(client: TestClient) -> None:
    """/docs is only usable if operations carry a summary and a tag."""
    schema = client.get("/openapi.json").json()

    assert schema["paths"]
    for path, operations in schema["paths"].items():
        for method, operation in operations.items():
            assert operation.get("summary"), f"{method.upper()} {path} has no summary"
            assert operation.get("tags"), f"{method.upper()} {path} has no tags"


def test_no_endpoint_has_a_verb_in_its_path(client: TestClient) -> None:
    """`/getMeetings` and `/deleteMeeting` are on the do-not-ship list."""
    verbs = ("get", "create", "update", "delete", "fetch", "list", "remove")
    for path in client.get("/openapi.json").json()["paths"]:
        segments = [s for s in path.split("/") if s and not s.startswith("{")]
        for segment in segments:
            lowered = segment.lower().replace("-", "")
            for verb in verbs:
                # `bulk-delete` is a legitimate action resource; a bare verb is not.
                assert not lowered.startswith(verb) or "-" in segment, f"verb in path: {path}"


def test_docs_are_served(client: TestClient) -> None:
    assert client.get("/docs").status_code == 200


# ── T04-H · rate limiting ───────────────────────────────────────────────────


def test_ai_endpoint_is_rate_limited(client: TestClient, db: Session) -> None:
    """The endpoint that costs money refuses the 11th call in a minute."""
    meeting = make_full_meeting(db)
    url = f"/api/v1/meetings/{meeting.id}/summary/regenerate"

    statuses = [client.post(url).status_code for _ in range(11)]

    assert statuses[:10] == [status.HTTP_200_OK] * 10
    assert statuses[10] == status.HTTP_429_TOO_MANY_REQUESTS


def test_rate_limit_response_uses_the_standard_envelope(client: TestClient, db: Session) -> None:
    """slowapi's own body is a different shape; ours is reshaped to match."""
    meeting = make_full_meeting(db)
    url = f"/api/v1/meetings/{meeting.id}/summary/regenerate"

    for _ in range(11):
        response = client.post(url)

    assert response.status_code == status.HTTP_429_TOO_MANY_REQUESTS
    assert response.json()["error"]["code"] == "RATE_LIMITED"


def test_listing_meetings_is_not_rate_limited(client: TestClient, db: Session) -> None:
    """Only the expensive routes are limited — a fast click must not 429."""
    make_full_meeting(db)
    assert all(client.get("/api/v1/meetings").status_code == 200 for _ in range(30))


# ── T04-I · health ──────────────────────────────────────────────────────────


def test_health_reports_the_database(client: TestClient) -> None:
    body = client.get("/api/health").json()
    assert body == {"status": "ok", "db": "up", "version": body["version"], "ai_provider": "mock"}


def test_health_returns_503_when_the_database_is_unreachable(
    client: TestClient, app, db_engine
) -> None:
    """A health check that cannot fail tells the host nothing.

    This is the case that matters: a container whose volume did not mount
    answers HTTP perfectly well while every real request 500s.
    """
    db_engine.dispose()

    def broken_db():  # type: ignore[no-untyped-def]
        from sqlalchemy.exc import OperationalError

        class Broken:
            def execute(self, *args: object, **kwargs: object) -> None:
                raise OperationalError("SELECT 1", {}, Exception("no such table"))

        yield Broken()

    from app.db.session import get_db

    app.dependency_overrides[get_db] = broken_db

    response = client.get("/api/health")

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    body = response.json()
    assert body["db"] == "down"
    assert body["status"] == "degraded"


# ── /me ─────────────────────────────────────────────────────────────────────


def test_me_returns_the_default_user(client: TestClient, db: Session) -> None:
    user = make_user(db, name="Sarah Chen")
    db.commit()

    body = client.get("/api/v1/me").json()

    assert body["id"] == user.id
    assert body["name"] == "Sarah Chen"
    assert body["email"] == user.email


def test_me_gives_an_actionable_error_before_seeding(client: TestClient) -> None:
    """A fresh clone hits this, and the fix is one command."""
    response = client.get("/api/v1/me")

    assert response.status_code == status.HTTP_503_SERVICE_UNAVAILABLE
    body = response.json()
    assert body["error"]["code"] == "NOT_SEEDED"
    assert "make seed" in body["error"]["message"]


# ── Write paths ─────────────────────────────────────────────────────────────


def test_create_then_fetch_round_trips(client: TestClient, db: Session) -> None:
    make_user(db)
    db.commit()

    created = client.post(
        "/api/v1/meetings",
        json={"title": "  Q3 Roadmap Sync  ", "participant_names": ["Sarah Chen", "Marcus Patel"]},
    )

    assert created.status_code == status.HTTP_201_CREATED
    body = created.json()
    # Whitespace is trimmed rather than stored.
    assert body["title"] == "Q3 Roadmap Sync"
    assert len(body["participants"]) == 2

    fetched = client.get(f"/api/v1/meetings/{body['id']}")
    assert fetched.json()["title"] == "Q3 Roadmap Sync"


def test_patch_leaves_unmentioned_fields_alone(client: TestClient, db: Session) -> None:
    """The difference between a real PATCH and an accidental PUT."""
    meeting = make_full_meeting(db)
    original_description = "Original description"
    client.patch(f"/api/v1/meetings/{meeting.id}", json={"description": original_description})

    client.patch(f"/api/v1/meetings/{meeting.id}", json={"title": "Renamed"})

    body = client.get(f"/api/v1/meetings/{meeting.id}").json()
    assert body["title"] == "Renamed"
    assert body["description"] == original_description


def test_delete_then_restore(client: TestClient, db: Session) -> None:
    meeting = make_full_meeting(db)

    assert client.delete(f"/api/v1/meetings/{meeting.id}").status_code == 204
    assert client.get("/api/v1/meetings").json()["total"] == 0

    assert client.post(f"/api/v1/meetings/{meeting.id}/restore").status_code == 200
    assert client.get("/api/v1/meetings").json()["total"] == 1


def test_bulk_delete_reports_partial_failure(client: TestClient, db: Session) -> None:
    """'2 of 3 deleted' beats aborting the batch or lying about success."""
    user = make_user(db)
    first = make_meeting(db, host=user, title="One")
    second = make_meeting(db, host=user, title="Two")
    db.commit()

    response = client.post(
        "/api/v1/meetings/bulk-delete", json={"ids": [first.id, second.id, 99999]}
    )

    body = response.json()
    assert body["deleted"] == 2
    assert body["failed"] == [99999]


def test_sort_is_whitelisted_not_interpolated(client: TestClient, db: Session) -> None:
    """An unknown sort is a 400, and never reaches SQL (T-11.5, T11-I)."""
    make_full_meeting(db)

    response = client.get("/api/v1/meetings", params={"sort": "title; DROP TABLE meetings"})

    # Changed in T-11 from a silent fallback to an explicit rejection. A
    # fallback hides a client bug: the caller believes it sorted by one thing
    # and is looking at another, with nothing to tell them apart.
    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "INVALID_SORT"
    # The allowed set comes back, so the caller can fix it without the docs.
    assert "-started_at" in response.json()["error"]["details"]["allowed"]

    # And the table is still there.
    assert client.get("/api/v1/meetings").status_code == status.HTTP_200_OK
