"""Tags API (T-36, cases T36-A → T36-J on the backend half).

Structured like the feature: CRUD and validation first (T-36.1, T-36.10),
then the meeting side (PUT set-semantics and the 10-tag cap), then
merge-on-delete (T-36.6), then AI proposals (T-36.4). The or/and filter
semantics (T-36.8) live in test_meetings_list.py with the other filters.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from fastapi import status

from app.models import Meeting, Tag
from tests.factories import make_meeting, make_segments, make_speaker, make_user

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager

    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    QueryGuard = Callable[[int], AbstractContextManager[list[str]]]


def _make_tag(db: Session, name: str, *, color_index: int | None = None) -> Tag:
    tag = Tag(name=name, color_index=color_index)
    db.add(tag)
    db.flush()
    return tag


def _tagged_meeting(db: Session, *tags: Tag, title: str = "Q3 Product Roadmap Sync") -> Meeting:
    # One host per meeting, named after it: `make_meeting`'s default host has a
    # fixed email, so two calls in one test would trip the unique constraint.
    host = make_user(db, name=f"Host {title}")
    meeting = make_meeting(db, host=host, title=title)
    meeting.tags = list(tags)
    db.commit()
    return meeting


# ── Listing (T-36.1, T-36.6 settings page) ──────────────────────────────────


def test_tags_list_carries_live_usage_counts_sorted_by_name(
    client: TestClient, db: Session
) -> None:
    zebra = _make_tag(db, "Zebra", color_index=2)
    apple = _make_tag(db, "apple")
    _tagged_meeting(db, zebra, apple)
    _tagged_meeting(db, zebra, title="Weekly Engineering Standup")

    body = client.get("/api/v1/tags").json()

    # Case-insensitive order: `apple` before `Zebra`, not after it.
    assert [t["name"] for t in body["items"]] == ["apple", "Zebra"]
    by_name = {t["name"]: t for t in body["items"]}
    assert by_name["Zebra"]["usage_count"] == 2
    assert by_name["apple"]["usage_count"] == 1
    assert by_name["Zebra"]["color_index"] == 2
    assert by_name["apple"]["color_index"] is None


def test_an_unused_tag_still_appears_showing_zero(client: TestClient, db: Session) -> None:
    """The settings page must list a tag nobody uses — that is the one most
    worth deleting. A WHERE instead of the JOIN condition would drop it."""
    _make_tag(db, "dormant")
    db.commit()

    body = client.get("/api/v1/tags").json()
    assert body["items"] == [
        {"id": body["items"][0]["id"], "name": "dormant", "color_index": None, "usage_count": 0}
    ]


def test_usage_counts_exclude_soft_deleted_meetings(client: TestClient, db: Session) -> None:
    """The delete confirm names this number (T36-H); counting ghosts would
    overstate the blast radius."""
    tag = _make_tag(db, "urgent")
    _tagged_meeting(db, tag)
    doomed = _tagged_meeting(db, tag, title="Acme Corp — Discovery Call")
    doomed.deleted_at = datetime.now(UTC)
    db.commit()

    body = client.get("/api/v1/tags").json()
    assert body["items"][0]["usage_count"] == 1


def test_the_tag_list_costs_one_query_however_many_tags_exist(
    client: TestClient, db: Session, assert_max_queries: QueryGuard
) -> None:
    """Counts come from ONE grouped outer join, not a count per tag."""
    for index in range(12):
        _make_tag(db, f"tag-{index:02d}")
    db.commit()

    # Floor is 1 (the aggregate); +1 headroom, same policy as the big budgets.
    with assert_max_queries(2):
        response = client.get("/api/v1/tags")
    assert len(response.json()["items"]) == 12


# ── Create (T-36.1, T-36.10) ────────────────────────────────────────────────


def test_t36_b_a_created_tag_is_available_to_other_meetings(
    client: TestClient, db: Session
) -> None:
    host = make_user(db)
    meeting_a = make_meeting(db, host=host, title="Design Review")
    meeting_b = make_meeting(db, host=host, title="Bug Triage")
    db.commit()

    created = client.post("/api/v1/tags", json={"name": "launch"})
    assert created.status_code == status.HTTP_201_CREATED
    tag = created.json()
    assert tag["name"] == "launch"
    assert tag["color_index"] is None
    assert tag["usage_count"] == 0

    for meeting_id in (meeting_a.id, meeting_b.id):
        applied = client.put(f"/api/v1/meetings/{meeting_id}/tags", json={"tag_ids": [tag["id"]]})
        assert applied.status_code == status.HTTP_200_OK

    body = client.get("/api/v1/tags").json()
    assert body["items"][0]["usage_count"] == 2


def test_a_leading_hash_is_stripped_before_validation(client: TestClient, db: Session) -> None:
    """`#sales` is the same tag as `sales` (T-36.10) — the glyph is added at
    render time, never stored, and never counts against the 24 characters."""
    created = client.post("/api/v1/tags", json={"name": "# sales"}).json()
    assert created["name"] == "sales"

    # A 24-character name with a hash in front is still 24 characters.
    long_name = "x" * 24
    response = client.post("/api/v1/tags", json={"name": f"#{long_name}"})
    assert response.status_code == status.HTTP_201_CREATED
    assert response.json()["name"] == long_name


def test_t36_j_a_duplicate_name_in_a_different_case_is_blocked(
    client: TestClient, db: Session
) -> None:
    _make_tag(db, "sales")
    db.commit()

    for spelling in ("Sales", "SALES", "#sales"):
        response = client.post("/api/v1/tags", json={"name": spelling})
        assert response.status_code == status.HTTP_409_CONFLICT, spelling
        error = response.json()["error"]
        assert error["code"] == "DUPLICATE_TAG"
        # The message NAMES the existing tag so the editor can offer it.
        assert "sales" in error["message"]
        assert error["details"]["existing_name"] == "sales"


def test_name_validation_rejects_blank_and_overlong(client: TestClient, db: Session) -> None:
    for bad in ("", "   ", "#", "##", "x" * 25):
        response = client.post("/api/v1/tags", json={"name": bad})
        assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT, repr(bad)


def test_color_index_must_be_a_palette_slot(client: TestClient, db: Session) -> None:
    assert client.post("/api/v1/tags", json={"name": "a", "color_index": 8}).status_code == 422
    assert client.post("/api/v1/tags", json={"name": "b", "color_index": -1}).status_code == 422
    ok = client.post("/api/v1/tags", json={"name": "c", "color_index": 7})
    assert ok.status_code == status.HTTP_201_CREATED
    assert ok.json()["color_index"] == 7


# ── Rename / recolour (T-36.6) ──────────────────────────────────────────────


def test_t36_f_a_rename_propagates_to_every_meeting(client: TestClient, db: Session) -> None:
    """Meetings hold the tag by id, so the new name shows everywhere on the
    next read — nothing to cascade, nothing to forget."""
    tag = _make_tag(db, "q3-planing")  # typo: the whole point of renaming
    meeting = _tagged_meeting(db, tag)

    renamed = client.patch(f"/api/v1/tags/{tag.id}", json={"name": "q3-planning"})
    assert renamed.status_code == status.HTTP_200_OK
    assert renamed.json()["name"] == "q3-planning"
    assert renamed.json()["usage_count"] == 1

    detail = client.get(f"/api/v1/meetings/{meeting.id}").json()
    assert detail["tags"] == [{"id": tag.id, "name": "q3-planning", "color_index": None}]

    row = client.get("/api/v1/meetings").json()["items"][0]
    assert [t["name"] for t in row["tags"]] == ["q3-planning"]


def test_renaming_a_tag_to_its_own_casing_is_allowed(client: TestClient, db: Session) -> None:
    tag = _make_tag(db, "sales")
    db.commit()
    response = client.patch(f"/api/v1/tags/{tag.id}", json={"name": "Sales"})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["name"] == "Sales"


def test_renaming_onto_another_tag_is_a_409(client: TestClient, db: Session) -> None:
    _make_tag(db, "sales")
    other = _make_tag(db, "marketing")
    db.commit()
    response = client.patch(f"/api/v1/tags/{other.id}", json={"name": "SALES"})
    assert response.status_code == status.HTTP_409_CONFLICT
    assert response.json()["error"]["code"] == "DUPLICATE_TAG"


def test_recolour_pins_and_null_unpins(client: TestClient, db: Session) -> None:
    """`color_index: null` is a real edit — back to the hash-derived colour —
    not an omission. The two must behave differently (exclude_unset)."""
    tag = _make_tag(db, "sales", color_index=3)
    db.commit()

    # A rename that never mentions colour leaves the pin alone.
    body = client.patch(f"/api/v1/tags/{tag.id}", json={"name": "Sales"}).json()
    assert body["color_index"] == 3

    body = client.patch(f"/api/v1/tags/{tag.id}", json={"color_index": 5}).json()
    assert body["color_index"] == 5

    body = client.patch(f"/api/v1/tags/{tag.id}", json={"color_index": None}).json()
    assert body["color_index"] is None


def test_updating_an_unknown_tag_is_404(client: TestClient, db: Session) -> None:
    response = client.patch("/api/v1/tags/9999", json={"name": "ghost"})
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "TAG_NOT_FOUND"


# ── Setting a meeting's tags (T-36.1, T-36.10) ──────────────────────────────


def test_t36_a_an_applied_tag_appears_on_the_row_and_the_detail(
    client: TestClient, db: Session
) -> None:
    tag = _make_tag(db, "customer", color_index=5)
    meeting = make_meeting(db)
    db.commit()

    body = client.put(f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": [tag.id]}).json()
    assert [t["name"] for t in body["items"]] == ["customer"]
    assert body["items"][0]["usage_count"] == 1

    assert [t["name"] for t in client.get(f"/api/v1/meetings/{meeting.id}").json()["tags"]] == [
        "customer"
    ]
    assert [t["name"] for t in client.get("/api/v1/meetings").json()["items"][0]["tags"]] == [
        "customer"
    ]


def test_put_replaces_the_full_list_and_empty_clears(client: TestClient, db: Session) -> None:
    a, b, c = _make_tag(db, "a"), _make_tag(db, "b"), _make_tag(db, "c")
    meeting = _tagged_meeting(db, a, b)

    body = client.put(f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": [c.id]}).json()
    assert [t["name"] for t in body["items"]] == ["c"]

    body = client.put(f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": []}).json()
    assert body["items"] == []
    assert client.get(f"/api/v1/meetings/{meeting.id}").json()["tags"] == []


def test_t36_i_an_eleventh_tag_is_blocked_with_tag_limit(client: TestClient, db: Session) -> None:
    tags = [_make_tag(db, f"tag-{index:02d}") for index in range(11)]
    meeting = make_meeting(db)
    db.commit()

    ok = client.put(
        f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": [t.id for t in tags[:10]]}
    )
    assert ok.status_code == status.HTTP_200_OK

    over = client.put(f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": [t.id for t in tags]})
    assert over.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert over.json()["error"]["code"] == "TAG_LIMIT"

    # The failed request changed nothing.
    assert len(client.get(f"/api/v1/meetings/{meeting.id}").json()["tags"]) == 10


def test_duplicate_ids_collapse_before_the_cap_applies(client: TestClient, db: Session) -> None:
    """Set semantics: eleven ids naming ten distinct tags are ten tags."""
    tags = [_make_tag(db, f"tag-{index:02d}") for index in range(10)]
    meeting = make_meeting(db)
    db.commit()

    ids = [t.id for t in tags] + [tags[0].id]
    body = client.put(f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": ids})
    assert body.status_code == status.HTTP_200_OK
    assert len(body.json()["items"]) == 10


def test_put_with_unknown_ids_is_404_listing_every_missing_one(
    client: TestClient, db: Session
) -> None:
    tag = _make_tag(db, "real")
    meeting = make_meeting(db)
    db.commit()

    response = client.put(
        f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": [tag.id, 9998, 9999]}
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    error = response.json()["error"]
    assert error["code"] == "TAG_NOT_FOUND"
    assert error["details"]["missing_tag_ids"] == [9998, 9999]


def test_put_on_a_deleted_meeting_is_410(client: TestClient, db: Session) -> None:
    tag = _make_tag(db, "urgent")
    meeting = make_meeting(db)
    meeting.deleted_at = datetime.now(UTC)
    db.commit()

    response = client.put(f"/api/v1/meetings/{meeting.id}/tags", json={"tag_ids": [tag.id]})
    assert response.status_code == status.HTTP_410_GONE


# ── Delete and merge (T-36.6) ───────────────────────────────────────────────


def test_t36_h_delete_removes_the_tag_from_every_meeting(client: TestClient, db: Session) -> None:
    tag = _make_tag(db, "obsolete")
    keeper = _make_tag(db, "keeper")
    meeting = _tagged_meeting(db, tag, keeper)

    response = client.delete(f"/api/v1/tags/{tag.id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT

    assert [t["name"] for t in client.get("/api/v1/tags").json()["items"]] == ["keeper"]
    # No orphaned reference on the meeting — the ❌ case in the plan.
    assert [t["name"] for t in client.get(f"/api/v1/meetings/{meeting.id}").json()["tags"]] == [
        "keeper"
    ]


def test_t36_g_merge_unions_meetings_without_duplicates(client: TestClient, db: Session) -> None:
    """`q3` absorbs `q3-old`: meetings from both carry the survivor, the
    overlap does not double up, and the doomed tag is gone."""
    survivor = _make_tag(db, "q3")
    doomed = _make_tag(db, "q3-old")
    overlap = _tagged_meeting(db, survivor, doomed, title="Overlap")
    only_doomed = _tagged_meeting(db, doomed, title="Only old")
    only_survivor = _tagged_meeting(db, survivor, title="Only new")

    response = client.delete(f"/api/v1/tags/{doomed.id}", params={"merge_into": survivor.id})
    assert response.status_code == status.HTTP_204_NO_CONTENT

    body = client.get("/api/v1/tags").json()
    assert [t["name"] for t in body["items"]] == ["q3"]
    assert body["items"][0]["usage_count"] == 3

    for meeting in (overlap, only_doomed, only_survivor):
        tags = client.get(f"/api/v1/meetings/{meeting.id}").json()["tags"]
        assert [t["name"] for t in tags] == ["q3"], meeting.title


def test_merging_a_tag_into_itself_is_422(client: TestClient, db: Session) -> None:
    tag = _make_tag(db, "sales")
    db.commit()
    response = client.delete(f"/api/v1/tags/{tag.id}", params={"merge_into": tag.id})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_merging_into_an_unknown_tag_is_404_and_deletes_nothing(
    client: TestClient, db: Session
) -> None:
    tag = _make_tag(db, "sales")
    db.commit()

    response = client.delete(f"/api/v1/tags/{tag.id}", params={"merge_into": 9999})
    assert response.status_code == status.HTTP_404_NOT_FOUND

    # A failed merge must not half-run: the doomed tag survives untouched.
    assert [t["name"] for t in client.get("/api/v1/tags").json()["items"]] == ["sales"]


def test_deleting_an_unknown_tag_is_404(client: TestClient, db: Session) -> None:
    response = client.delete("/api/v1/tags/9999")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "TAG_NOT_FOUND"


# ── Proposals (T-36.4) ──────────────────────────────────────────────────────


def _transcribed_meeting(db: Session) -> Meeting:
    meeting = make_meeting(db, host=make_user(db))
    speakers = [make_speaker(db, meeting, label="Speaker 1")]
    make_segments(db, meeting, speakers, count=6)
    db.commit()
    return meeting


def test_proposals_are_deterministic_and_capped_at_five(client: TestClient, db: Session) -> None:
    """Same transcript in, same proposals out — what keeps the Suggested chips
    still between refreshes (the mock's TF-IDF has a stable tie-break)."""
    meeting = _transcribed_meeting(db)

    first = client.get(f"/api/v1/meetings/{meeting.id}/tags/proposals").json()
    second = client.get(f"/api/v1/meetings/{meeting.id}/tags/proposals").json()

    assert first == second
    assert 0 < len(first["items"]) <= 5
    # Fresh database: nothing to link against, so every proposal is a create.
    assert all(item["tag_id"] is None for item in first["items"])


def test_proposals_link_existing_tags_case_insensitively(client: TestClient, db: Session) -> None:
    """A proposal matching an existing tag carries its id, so accepting it is
    a plain PUT rather than a duplicate-creating POST."""
    meeting = _transcribed_meeting(db)
    existing = _make_tag(db, "Pricing")  # the transcript says "pricing"
    db.commit()

    items = client.get(f"/api/v1/meetings/{meeting.id}/tags/proposals").json()["items"]
    by_name = {item["name"]: item for item in items}

    assert "pricing" in by_name
    assert by_name["pricing"]["tag_id"] == existing.id


def test_proposals_exclude_tags_the_meeting_already_carries(
    client: TestClient, db: Session
) -> None:
    """Suggesting what is already applied is noise, and the comparison is
    case-insensitive — `Pricing` applied blocks proposing `pricing`."""
    meeting = _transcribed_meeting(db)
    applied = _make_tag(db, "Pricing")
    meeting.tags = [applied]
    db.commit()

    items = client.get(f"/api/v1/meetings/{meeting.id}/tags/proposals").json()["items"]
    assert all(item["name"].lower() != "pricing" for item in items)


def test_proposals_for_a_meeting_with_no_transcript_are_empty_not_an_error(
    client: TestClient, db: Session
) -> None:
    meeting = make_meeting(db)
    db.commit()
    response = client.get(f"/api/v1/meetings/{meeting.id}/tags/proposals")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"] == []


def test_proposals_for_a_deleted_meeting_are_410(client: TestClient, db: Session) -> None:
    meeting = make_meeting(db)
    meeting.deleted_at = datetime.now(UTC)
    db.commit()
    assert client.get(f"/api/v1/meetings/{meeting.id}/tags/proposals").status_code == 410
