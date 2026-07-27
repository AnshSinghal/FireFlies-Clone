"""Comment API (T-31.1/31.4/31.7/31.9/31.10).

The client-facing invariants: threads are one level deep, anchored to real
segments of the right meeting, mentions are stored rows, tombstones preserve
replies, and only the author mutates. XSS safety at the API level means the
body round-trips as literal text — rendering safety is the Highlighter's job.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from tests.factories import (
    make_full_meeting,
    make_meeting,
    make_participant,
    make_segments,
    make_speaker,
    make_user,
)

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session


def _meeting_with_transcript(db: Session):  # type: ignore[no-untyped-def]
    user = make_user(db)
    meeting = make_meeting(db, host=user)
    speaker = make_speaker(db, meeting)
    segments = make_segments(db, meeting, [speaker], count=5)
    participant = make_participant(db, meeting, display_name="Priya Sharma")
    db.commit()
    return meeting, segments, participant


def test_t31_a_anchored_comment_persists_with_the_segment_timestamp(
    client: TestClient, db: Session
) -> None:
    meeting, segments, _ = _meeting_with_transcript(db)
    target = segments[2]

    created = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Great point here.", "segment_id": target.id},
    ).json()

    assert created["segment_id"] == target.id
    # start_ms is denormalised from the segment at write time.
    assert created["start_ms"] == target.start_ms

    listed = client.get(f"/api/v1/meetings/{meeting.id}/comments").json()
    assert set(listed) == {"items", "page", "page_size", "total", "total_pages", "has_next"}
    assert [item["id"] for item in listed["items"]] == [created["id"]]


def test_t31_b_replies_nest_exactly_one_level(client: TestClient, db: Session) -> None:
    meeting, segments, _ = _meeting_with_transcript(db)
    seg = segments[0]
    parent = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Parent", "segment_id": seg.id},
    ).json()

    reply = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Reply", "parent_id": parent["id"]},
    ).json()
    # The reply inherits its parent's anchor so the thread sits together.
    assert reply["segment_id"] == seg.id

    nested = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Too deep", "parent_id": reply["id"]},
    )
    assert nested.status_code == 422

    thread = client.get(f"/api/v1/meetings/{meeting.id}/comments").json()["items"][0]
    assert [r["body"] for r in thread["replies"]] == ["Reply"]


def test_t31_d_mentions_are_stored_and_validated(client: TestClient, db: Session) -> None:
    meeting, _, participant = _meeting_with_transcript(db)
    other_meeting = make_full_meeting(
        db, host=make_user(db, name="Other Host", email="other.host@example.com")
    )
    outsider = make_participant(db, other_meeting, display_name="Outsider")
    db.commit()

    created = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "@Priya thoughts?", "mentions": [participant.id]},
    ).json()
    assert created["mentions"] == [
        {"participant_id": participant.id, "display_name": "Priya Sharma"}
    ]

    rejected = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "@Outsider?", "mentions": [outsider.id]},
    )
    assert rejected.status_code == 422


def test_t31_e_editing_marks_edited_but_resolving_does_not(client: TestClient, db: Session) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    created = client.post(
        f"/api/v1/meetings/{meeting.id}/comments", json={"body": "Original"}
    ).json()

    resolved = client.patch(f"/api/v1/comments/{created['id']}", json={"is_resolved": True}).json()
    assert resolved["is_resolved"] is True
    assert resolved["is_edited"] is False, "resolve is not an edit"

    edited = client.patch(f"/api/v1/comments/{created['id']}", json={"body": "Rewritten"}).json()
    assert edited["body"] == "Rewritten"
    assert edited["is_edited"] is True


def test_resolve_applies_to_threads_not_replies(client: TestClient, db: Session) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    parent = client.post(f"/api/v1/meetings/{meeting.id}/comments", json={"body": "Parent"}).json()
    reply = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Reply", "parent_id": parent["id"]},
    ).json()

    assert (
        client.patch(f"/api/v1/comments/{reply['id']}", json={"is_resolved": True}).status_code
        == 422
    )


def test_t31_f_deleting_a_parent_with_replies_leaves_a_tombstone(
    client: TestClient, db: Session
) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    parent = client.post(f"/api/v1/meetings/{meeting.id}/comments", json={"body": "Parent"}).json()
    client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Reply survives", "parent_id": parent["id"]},
    )

    assert client.delete(f"/api/v1/comments/{parent['id']}").status_code == 204

    thread = client.get(f"/api/v1/meetings/{meeting.id}/comments").json()["items"][0]
    assert thread["is_deleted"] is True
    assert thread["body"] == ""
    assert [r["body"] for r in thread["replies"]] == ["Reply survives"]


def test_a_childless_deleted_comment_disappears_entirely(client: TestClient, db: Session) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    created = client.post(
        f"/api/v1/meetings/{meeting.id}/comments", json={"body": "Ephemeral"}
    ).json()

    client.delete(f"/api/v1/comments/{created['id']}")

    assert client.get(f"/api/v1/meetings/{meeting.id}/comments").json()["total"] == 0


def test_only_the_author_can_mutate(client: TestClient, db: Session) -> None:
    """Single-user build, but the check is server-side anyway (T-31.7)."""
    from app.models import Comment

    meeting, _, _ = _meeting_with_transcript(db)
    stranger = make_user(db, name="Marcus Lee", email="marcus@example.com")
    foreign = Comment(meeting_id=meeting.id, author_id=stranger.id, body="Not yours")
    db.add(foreign)
    db.commit()

    assert (
        client.patch(f"/api/v1/comments/{foreign.id}", json={"body": "hijack"}).status_code == 403
    )
    assert client.delete(f"/api/v1/comments/{foreign.id}").status_code == 403


def test_t31_k_script_tags_round_trip_as_literal_text(client: TestClient, db: Session) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    payload = "<script>alert(1)</script>"

    created = client.post(f"/api/v1/meetings/{meeting.id}/comments", json={"body": payload}).json()

    assert created["body"] == payload, "stored verbatim; escaping is the renderer's job"


def test_t31_j_cross_meeting_anchors_are_rejected(client: TestClient, db: Session) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    other = make_full_meeting(
        db, host=make_user(db, name="Other Host", email="other.host@example.com")
    )
    other_segment = other.segments[0]
    db.commit()

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Wrong room", "segment_id": other_segment.id},
    )
    assert response.status_code == 422


def test_t31_10_detail_carries_the_live_comment_count(client: TestClient, db: Session) -> None:
    meeting, _, _ = _meeting_with_transcript(db)
    parent = client.post(f"/api/v1/meetings/{meeting.id}/comments", json={"body": "One"}).json()
    client.post(
        f"/api/v1/meetings/{meeting.id}/comments",
        json={"body": "Two", "parent_id": parent["id"]},
    )
    deleted = client.post(f"/api/v1/meetings/{meeting.id}/comments", json={"body": "Gone"}).json()
    client.delete(f"/api/v1/comments/{deleted['id']}")

    detail = client.get(f"/api/v1/meetings/{meeting.id}").json()
    assert detail["comment_count"] == 2, "replies count, deleted don't"
