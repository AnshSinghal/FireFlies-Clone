"""Highlights & bookmarks (T-32): offsets, invalidation, idempotent stars."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Highlight, TranscriptSegment
from tests.factories import make_meeting, make_speaker, make_user

LINE = "The top accounts use four times the API volume of the median account."


@pytest.fixture()
def meeting_with_lines(db: Session):
    meeting = make_meeting(db, title="Highlight fixture")
    speaker = make_speaker(db, meeting, label="Aisha Khan", color_index=0)
    for index, text in enumerate([LINE, "Grandfather existing contracts through renewal."]):
        db.add(
            TranscriptSegment(
                meeting_id=meeting.id,
                speaker_id=speaker.id,
                sequence=index,
                start_ms=index * 30_000,
                end_ms=index * 30_000 + 20_000,
                text=text,
            )
        )
    db.commit()
    return meeting


def _segments(db: Session, meeting) -> list[TranscriptSegment]:
    return list(
        db.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.meeting_id == meeting.id)
            .order_by(TranscriptSegment.sequence)
        ).scalars()
    )


def _create(client: TestClient, meeting_id: int, segment_id: int, **overrides):
    payload = {
        "segment_id": segment_id,
        "start_offset": LINE.index("four times"),
        "end_offset": LINE.index("four times") + len("four times the API volume"),
        "color": "amber",
    }
    payload.update(overrides)
    return client.post(f"/api/v1/meetings/{meeting_id}/highlights", json=payload)


class TestHighlights:
    def test_create_slices_exactly_the_selected_characters(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        response = _create(client, meeting_with_lines.id, segment.id)

        assert response.status_code == 201
        body = response.json()
        assert body["text"] == "four times the API volume"
        assert body["speaker"] == "Aisha Khan"
        assert body["start_ms"] == segment.start_ms

    def test_list_is_transcript_ordered(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        first, second = _segments(db, meeting_with_lines)
        # Created out of order on purpose; the list must not care.
        _create(client, meeting_with_lines.id, second.id, start_offset=0, end_offset=11)
        _create(client, meeting_with_lines.id, first.id)

        listed = client.get(f"/api/v1/meetings/{meeting_with_lines.id}/highlights").json()
        assert [h["segment_id"] for h in listed] == [first.id, second.id]

    def test_a_range_past_the_text_is_refused(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        response = _create(
            client, meeting_with_lines.id, segment.id, start_offset=0, end_offset=len(LINE) + 5
        )
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"

    def test_a_foreign_segment_is_refused(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        other = make_meeting(db, host=make_user(db, name="Nadia Osei"), title="Another meeting")
        speaker = make_speaker(db, other, label="Nadia", color_index=1)
        foreign = TranscriptSegment(
            meeting_id=other.id,
            speaker_id=speaker.id,
            sequence=0,
            start_ms=0,
            end_ms=1_000,
            text="Not this meeting's line.",
        )
        db.add(foreign)
        db.commit()

        response = _create(client, meeting_with_lines.id, foreign.id, start_offset=0, end_offset=3)
        assert response.status_code == 422

    def test_patch_color_and_explicit_null_note(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        created = _create(
            client, meeting_with_lines.id, segment.id, note="Keep this number handy."
        ).json()

        # Colour changes; the ABSENT note field leaves the note alone.
        recoloured = client.patch(
            f"/api/v1/highlights/{created['id']}", json={"color": "pink"}
        ).json()
        assert recoloured["color"] == "pink"
        assert recoloured["note"] == "Keep this number handy."

        # An EXPLICIT null clears it — the standard PATCH distinction.
        cleared = client.patch(f"/api/v1/highlights/{created['id']}", json={"note": None}).json()
        assert cleared["note"] is None

    def test_delete_removes_the_row(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        created = _create(client, meeting_with_lines.id, segment.id).json()

        assert client.delete(f"/api/v1/highlights/{created['id']}").status_code == 204
        assert client.get(f"/api/v1/meetings/{meeting_with_lines.id}/highlights").json() == []
        assert client.delete(f"/api/v1/highlights/{created['id']}").status_code == 404

    def test_editing_the_text_invalidates_its_highlights_only(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        first, second = _segments(db, meeting_with_lines)
        _create(client, meeting_with_lines.id, first.id)
        kept = _create(
            client, meeting_with_lines.id, second.id, start_offset=0, end_offset=11
        ).json()

        response = client.patch(
            f"/api/v1/meetings/segments/{first.id}",
            json={"text": "A completely rewritten line."},
        )
        assert response.status_code == 200

        remaining = db.execute(select(Highlight)).scalars().all()
        assert [h.id for h in remaining] == [kept["id"]]

    def test_deleted_meeting_is_gone(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        client.delete(f"/api/v1/meetings/{meeting_with_lines.id}")
        response = client.get(f"/api/v1/meetings/{meeting_with_lines.id}/highlights")
        assert response.status_code == 410


class TestBookmarks:
    def test_put_stars_and_is_idempotent(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        url = f"/api/v1/meetings/{meeting_with_lines.id}/bookmarks/{segment.id}"

        first = client.put(url)
        second = client.put(url)
        assert first.status_code == 200
        # Pressing the star twice returns the SAME row, not a duplicate.
        assert second.json()["id"] == first.json()["id"]

        listed = client.get(f"/api/v1/meetings/{meeting_with_lines.id}/bookmarks").json()
        assert len(listed) == 1
        assert listed[0]["segment_id"] == segment.id
        assert listed[0]["speaker"] == "Aisha Khan"
        assert listed[0]["snippet"].startswith("The top accounts")

    def test_delete_unstars_and_is_idempotent(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        url = f"/api/v1/meetings/{meeting_with_lines.id}/bookmarks/{segment.id}"
        client.put(url)

        assert client.delete(url).status_code == 204
        assert client.get(f"/api/v1/meetings/{meeting_with_lines.id}/bookmarks").json() == []
        # Un-starring a plain segment is a no-op, not an error.
        assert client.delete(url).status_code == 204

    def test_restarring_reactivates_the_same_row(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        segment = _segments(db, meeting_with_lines)[0]
        url = f"/api/v1/meetings/{meeting_with_lines.id}/bookmarks/{segment.id}"

        original = client.put(url).json()
        client.delete(url)
        revived = client.put(url).json()

        # The unique (segment, user) row toggles rather than accumulating.
        assert revived["id"] == original["id"]

    def test_a_foreign_segment_cannot_be_bookmarked(
        self, client: TestClient, db: Session, meeting_with_lines
    ) -> None:
        other = make_meeting(db, host=make_user(db, name="Omar Haddad"), title="Elsewhere")
        speaker = make_speaker(db, other, label="Nadia", color_index=1)
        foreign = TranscriptSegment(
            meeting_id=other.id,
            speaker_id=speaker.id,
            sequence=0,
            start_ms=0,
            end_ms=1_000,
            text="Elsewhere's line.",
        )
        db.add(foreign)
        db.commit()

        response = client.put(f"/api/v1/meetings/{meeting_with_lines.id}/bookmarks/{foreign.id}")
        assert response.status_code == 422
