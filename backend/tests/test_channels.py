"""GET /channels — the sidebar's data source (T-43.4 gap-fill).

The behaviours worth pinning are the ones a naive rewrite would break: an
empty channel still appears (the deleted_at filter lives in the JOIN, not a
WHERE), soft-deleted meetings never count anywhere, and the counts arrive in
one query because the rail renders on every page.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.models import Channel
from tests.factories import make_meeting, make_user

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session


def _make_channel(db: Session, *, name: str, slug: str, is_private: bool = False) -> Channel:
    channel = Channel(name=name, slug=slug, is_private=is_private)
    db.add(channel)
    db.flush()
    return channel


def test_channels_carry_live_counts_and_builtin_totals(client: TestClient, db: Session) -> None:
    host = make_user(db)
    other = make_user(db, name="Priya Sharma", email="priya@example.com")
    product = _make_channel(db, name="Product", slug="product")
    make_meeting(db, host=host, title="Sync A", channel_id=product.id)
    make_meeting(db, host=other, title="Sync B", channel_id=product.id)
    make_meeting(db, host=host, title="Unfiled")
    db.commit()

    body = client.get("/api/v1/channels").json()

    by_slug = {channel["slug"]: channel for channel in body["channels"]}
    assert by_slug["product"]["meeting_count"] == 2
    assert body["all_meetings"] == 3
    # "My Meetings" is the current user's hosted count — the seeded default
    # user (lowest id) hosts two of the three.
    assert body["my_meetings"] == 2


def test_an_empty_channel_still_appears_with_zero(client: TestClient, db: Session) -> None:
    """The deleted_at condition lives in the JOIN precisely so this holds."""
    make_user(db)
    _make_channel(db, name="Dormant", slug="dormant")
    db.commit()

    body = client.get("/api/v1/channels").json()

    by_slug = {channel["slug"]: channel for channel in body["channels"]}
    assert by_slug["dormant"]["meeting_count"] == 0


def test_soft_deleted_meetings_count_nowhere(client: TestClient, db: Session) -> None:
    host = make_user(db)
    product = _make_channel(db, name="Product", slug="product")
    make_meeting(db, host=host, title="Kept", channel_id=product.id)
    gone = make_meeting(db, host=host, title="Gone", channel_id=product.id)
    gone.deleted_at = datetime.now(UTC)
    db.commit()

    body = client.get("/api/v1/channels").json()

    by_slug = {channel["slug"]: channel for channel in body["channels"]}
    assert by_slug["product"]["meeting_count"] == 1
    assert body["all_meetings"] == 1
    assert body["my_meetings"] == 1


def test_private_channels_sort_after_public_ones(client: TestClient, db: Session) -> None:
    make_user(db)
    _make_channel(db, name="Aardvark", slug="aardvark", is_private=True)
    _make_channel(db, name="Zebra", slug="zebra")
    db.commit()

    slugs = [channel["slug"] for channel in client.get("/api/v1/channels").json()["channels"]]

    # Alphabetically Aardvark wins, but private rows sink below public ones.
    assert slugs.index("zebra") < slugs.index("aardvark")
