"""GET /users — the Team page's members table (T-30.4)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from tests.factories import make_meeting, make_user

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

ENVELOPE_KEYS = {"items", "page", "page_size", "total", "total_pages", "has_next"}


def test_members_list_uses_the_standard_envelope(client: TestClient, db: Session) -> None:
    make_user(db)
    db.commit()

    body = client.get("/api/v1/users").json()

    assert set(body) == ENVELOPE_KEYS
    assert body["total"] == 1


def test_admin_is_the_seeded_default_user_and_counts_exclude_deleted(
    client: TestClient, db: Session
) -> None:
    admin = make_user(db)
    member = make_user(db, name="Priya Sharma", email="priya@example.com")
    make_meeting(db, host=member)
    deleted = make_meeting(db, host=member, title="Old sync")
    from datetime import UTC, datetime

    deleted.deleted_at = datetime.now(UTC)
    db.commit()

    items = client.get("/api/v1/users").json()["items"]
    by_id = {item["id"]: item for item in items}

    assert by_id[admin.id]["role"] == "Admin"
    assert by_id[member.id]["role"] == "Member"
    # The soft-deleted meeting is gone from the count, same as the Notebook.
    assert by_id[member.id]["meetings_hosted"] == 1


def test_member_rows_never_carry_emails(client: TestClient, db: Session) -> None:
    """`UserOut` promises email is only returned for the current user — the
    members list must not quietly widen that."""
    make_user(db)
    db.commit()

    items = client.get("/api/v1/users").json()["items"]

    assert items and all("email" not in item for item in items)
