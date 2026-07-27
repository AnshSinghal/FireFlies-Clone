"""Transcript, speaker and media endpoints (T-17, cases T17-A → T17-K)."""

from __future__ import annotations

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Meeting, Speaker, TranscriptSegment
from app.services.media import RangeNotSatisfiable, parse_range
from tests.factories import make_meeting, make_segments, make_speaker, make_summary, make_user


@pytest.fixture
def long_meeting(db: Session) -> Meeting:
    """A meeting with more segments than one page holds."""
    user = make_user(db, name="Host Person")
    meeting = make_meeting(db, host=user, title="Long One")
    speakers = [make_speaker(db, meeting, label=f"Speaker {i + 1}") for i in range(3)]
    make_segments(db, meeting, speakers, count=250, text="the pricing model needs revisiting")
    make_summary(db, meeting)
    db.commit()
    return meeting


# ── Pagination (T17-A, T17-B) ───────────────────────────────────────────────


def test_t17_a_the_first_page_is_capped_and_offers_a_cursor(
    client: TestClient, long_meeting: Meeting
):
    body = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript").json()

    assert len(body["segments"]) == 200
    assert body["next_cursor"] is not None
    assert body["total"] == 250


def test_t17_b_following_cursors_yields_every_segment_exactly_once(
    client: TestClient, long_meeting: Meeting
):
    """No duplicates, no gaps, strictly ordered.

    The property cursor pagination exists for: an offset would re-scan and, on
    a concurrent insert, would skip or repeat a row.
    """
    sequences: list[int] = []
    cursor: int | None = None

    for _ in range(10):  # A bound, so a broken cursor cannot loop forever.
        params = {"limit": 100}
        if cursor is not None:
            params["cursor"] = cursor
        body = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript", params=params).json()

        sequences.extend(s["sequence"] for s in body["segments"])
        cursor = body["next_cursor"]
        if cursor is None:
            break

    assert cursor is None, "cursors never terminated"
    assert len(sequences) == 250
    assert len(set(sequences)) == 250
    assert sequences == sorted(sequences)


def test_speakers_are_sent_by_reference_not_per_segment(client: TestClient, long_meeting: Meeting):
    """Inlining the speaker would repeat one label and colour ~70 times."""
    body = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript").json()

    assert len(body["speakers"]) == 3
    for segment in body["segments"]:
        assert "speaker_id" in segment
        assert "speaker" not in segment

    ids = {s["id"] for s in body["speakers"]}
    assert {s["speaker_id"] for s in body["segments"]} <= ids


def test_a_page_size_over_the_maximum_is_clamped(client: TestClient, long_meeting: Meeting):
    response = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript", params={"limit": 5000})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_transcript_for_a_deleted_meeting_is_410(
    client: TestClient, long_meeting: Meeting, db: Session
):
    from datetime import UTC, datetime

    long_meeting.deleted_at = datetime.now(UTC)
    db.commit()

    response = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript")
    assert response.status_code == status.HTTP_410_GONE
    assert response.json()["error"]["code"] == "MEETING_DELETED"


# ── Search (T-17.3) ─────────────────────────────────────────────────────────


def test_a_query_filters_segments_and_returns_match_offsets(
    client: TestClient, long_meeting: Meeting
):
    body = client.get(
        f"/api/v1/meetings/{long_meeting.id}/transcript", params={"q": "pricing"}
    ).json()

    assert body["total"] == 250, "the total describes the search"
    for segment in body["segments"]:
        assert segment["matches"], "a matching segment must say WHERE it matched"
        start, end = segment["matches"][0]["start"], segment["matches"][0]["end"]
        assert segment["text"][start:end].lower() == "pricing"


def test_matches_are_absent_when_there_is_no_query(client: TestClient, long_meeting: Meeting):
    body = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript").json()
    assert body["segments"][0]["matches"] is None


def test_a_regex_metacharacter_query_is_literal(client: TestClient, long_meeting: Meeting):
    # `c++` typed into a find bar means those characters.
    body = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript", params={"q": "a.*b"}).json()
    assert body["segments"] == []


# ── Editing (T17-C, T17-D) ──────────────────────────────────────────────────


def test_t17_c_editing_a_segment_marks_it_and_stales_the_summary(
    client: TestClient, long_meeting: Meeting, db: Session
):
    segment = db.execute(TranscriptSegment.__table__.select().limit(1)).mappings().one()

    body = client.patch(
        f"/api/v1/meetings/segments/{segment['id']}", json={"text": "corrected text"}
    ).json()

    assert body["text"] == "corrected text"
    assert body["is_edited"] is True

    db.expire_all()
    stored = db.get(TranscriptSegment, segment["id"])
    assert stored is not None
    # Captured once, so the edit is reversible.
    assert stored.original_text == segment["text"]

    meeting = db.get(Meeting, long_meeting.id)
    assert meeting is not None and meeting.summary is not None
    # A summary derived from text that has since changed is confidently wrong.
    assert meeting.summary.is_stale is True


def test_a_second_edit_does_not_overwrite_the_original(
    client: TestClient, long_meeting: Meeting, db: Session
):
    segment = db.execute(TranscriptSegment.__table__.select().limit(1)).mappings().one()
    original = segment["text"]

    client.patch(f"/api/v1/meetings/segments/{segment['id']}", json={"text": "first"})
    client.patch(f"/api/v1/meetings/segments/{segment['id']}", json={"text": "second"})

    db.expire_all()
    stored = db.get(TranscriptSegment, segment["id"])
    assert stored is not None
    assert stored.text == "second"
    assert stored.original_text == original


def test_an_edit_is_searchable_immediately(client: TestClient, long_meeting: Meeting, db: Session):
    """The FTS index is kept by triggers, so an edit needs no explicit reindex."""
    segment = db.execute(TranscriptSegment.__table__.select().limit(1)).mappings().one()

    client.patch(
        f"/api/v1/meetings/segments/{segment['id']}", json={"text": "quokka appeared here"}
    )

    hits = client.get("/api/v1/search", params={"q": "quokka"}).json()
    assert hits["transcripts"], "the FTS index did not follow the edit"


def test_a_segment_cannot_be_reassigned_to_another_meetings_speaker(
    client: TestClient, long_meeting: Meeting, db: Session
):
    """Client-supplied ids; cross-meeting reassignment would corrupt both."""
    other = make_meeting(db, host=make_user(db, name="Other Host"), title="Other")
    intruder = make_speaker(db, other, label="Intruder")
    db.commit()

    segment = db.execute(TranscriptSegment.__table__.select().limit(1)).mappings().one()
    response = client.patch(
        f"/api/v1/meetings/segments/{segment['id']}", json={"speaker_id": intruder.id}
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_t17_d_renaming_a_speaker_takes_one_statement(
    client: TestClient, long_meeting: Meeting, db: Session, query_counter: list[str]
):
    speaker = (
        db.execute(
            Speaker.__table__.select()
            .where(Speaker.__table__.c.meeting_id == long_meeting.id)
            .limit(1)
        )
        .mappings()
        .one()
    )

    query_counter.clear()
    body = client.patch(
        f"/api/v1/meetings/speakers/{speaker['id']}", json={"label": "Priya Raghunathan"}
    ).json()

    assert body["label"] == "Priya Raghunathan"

    # ONE update, however long the transcript is: the label lives on `speakers`
    # and segments reference it.
    updates = [s for s in query_counter if s.strip().upper().startswith("UPDATE")]
    assert len(updates) == 1, "\n".join(updates)

    # And every segment reflects it, because none of them stored a copy.
    page = client.get(f"/api/v1/meetings/{long_meeting.id}/transcript").json()
    labels = {s["label"] for s in page["speakers"]}
    assert "Priya Raghunathan" in labels


def test_editing_an_unknown_segment_is_404(client: TestClient, long_meeting: Meeting):
    response = client.patch("/api/v1/meetings/segments/999999", json={"text": "x"})
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "SEGMENT_NOT_FOUND"


# ── Range requests (T17-E, T17-F) ───────────────────────────────────────────


class TestRangeParsing:
    """Unit-level, because the off-by-one here is the classic range bug."""

    def test_an_inclusive_range_has_the_length_it_claims(self):
        rng = parse_range("bytes=1000-2000", size=5000)
        assert rng is not None
        # 2000 - 1000 + 1. Both ends INCLUSIVE, per RFC 9110.
        assert rng.length == 1001
        assert rng.content_range == "bytes 1000-2000/5000"

    def test_a_single_byte_range_is_one_byte(self):
        rng = parse_range("bytes=0-0", size=5000)
        assert rng is not None and rng.length == 1

    def test_a_suffix_range_means_the_LAST_n_bytes(self):
        # `bytes=-500` is the last 500 bytes, not the first 500. Reading it the
        # obvious way returns the wrong end of the file.
        rng = parse_range("bytes=-500", size=5000)
        assert rng is not None
        assert (rng.start, rng.end) == (4500, 4999)

    def test_an_open_ended_range_is_capped_to_a_chunk(self):
        # Browsers open one to start playback; serving the whole file each time
        # defeats the point of ranges.
        rng = parse_range("bytes=0-", size=10_000_000, chunk=1024)
        assert rng is not None and rng.length == 1024

    def test_an_end_past_the_file_is_clamped(self):
        rng = parse_range("bytes=4000-99999", size=5000)
        assert rng is not None and rng.end == 4999

    @pytest.mark.parametrize("header", [None, "", "items=0-100", "bytes=abc", "bytes=-"])
    def test_a_missing_or_malformed_range_falls_back_to_the_whole_file(self, header):
        # A malformed Range must be IGNORED rather than rejected, so a client
        # sending nonsense still gets its file.
        assert parse_range(header, size=5000) is None

    @pytest.mark.parametrize("header", ["bytes=9999-", "bytes=-0"])
    def test_an_unsatisfiable_range_raises(self, header):
        with pytest.raises(RangeNotSatisfiable):
            parse_range(header, size=5000)


def test_t17_e_a_range_request_returns_206_with_exactly_the_bytes_asked_for(
    client: TestClient, db: Session
):
    meeting = make_meeting(db, host=make_user(db, name="Media Host"), media_url="/media/x.m4a")
    db.commit()

    response = client.get(
        f"/api/v1/meetings/{meeting.id}/media", headers={"Range": "bytes=1000-2000"}
    )

    assert response.status_code == status.HTTP_206_PARTIAL_CONTENT
    assert len(response.content) == 1001
    assert response.headers["content-range"].startswith("bytes 1000-2000/")
    assert response.headers["accept-ranges"] == "bytes"


def test_t17_f_a_plain_request_advertises_range_support(client: TestClient, db: Session):
    """Without `Accept-Ranges`, a browser will not even try to seek."""
    meeting = make_meeting(db, host=make_user(db, name="Media Host 2"), media_url="/media/x.m4a")
    db.commit()

    response = client.get(f"/api/v1/meetings/{meeting.id}/media")

    assert response.status_code == status.HTTP_200_OK
    assert response.headers["accept-ranges"] == "bytes"
    assert int(response.headers["content-length"]) > 0


def test_an_unsatisfiable_range_is_416_with_the_real_size(client: TestClient, db: Session):
    meeting = make_meeting(db, host=make_user(db, name="Media Host 3"), media_url="/media/x.m4a")
    db.commit()

    response = client.get(
        f"/api/v1/meetings/{meeting.id}/media", headers={"Range": "bytes=99999999999-"}
    )

    assert response.status_code == status.HTTP_416_RANGE_NOT_SATISFIABLE
    # So the client can learn the length and retry sensibly.
    assert response.headers["content-range"].startswith("bytes */")


def test_a_meeting_without_media_is_404(client: TestClient, db: Session):
    meeting = make_meeting(db, host=make_user(db, name="No Media"))
    db.commit()

    response = client.get(f"/api/v1/meetings/{meeting.id}/media")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "MEDIA_NOT_FOUND"


# ── Summary composition and regeneration (T17-J, T17-K) ─────────────────────


def test_t17_k_the_summary_composes_its_sections_in_order(
    client: TestClient, long_meeting: Meeting, db: Session
):
    """Five sections from four sources, assembled by the API (ADR-015).

    A client stitching four responses together is a client that will eventually
    stitch them differently from the next one.
    """
    body = client.get(f"/api/v1/meetings/{long_meeting.id}/summary").json()

    assert body["overview"]
    assert body["outline"], "the outline is what makes timestamps clickable"
    assert body["outline"] == sorted(body["outline"], key=lambda e: e["sequence"])


def test_every_outline_timestamp_lands_inside_the_meeting(
    client: TestClient, long_meeting: Meeting, db: Session
):
    """An outline entry that seeks past the end is worse than no entry."""
    body = client.get(f"/api/v1/meetings/{long_meeting.id}/summary").json()

    last = (
        db.execute(
            TranscriptSegment.__table__.select()
            .where(TranscriptSegment.__table__.c.meeting_id == long_meeting.id)
            .order_by(TranscriptSegment.__table__.c.sequence.desc())
            .limit(1)
        )
        .mappings()
        .one()
    )

    for entry in body["outline"]:
        assert 0 <= entry["start_ms"] <= last["end_ms"]


def test_a_meeting_with_no_summary_is_200_not_404(client: TestClient, db: Session):
    """ "Not summarised yet" is a state of the meeting, not a missing
    resource — a 404 would make every client treat it as an error (ADR-046)."""
    meeting = make_meeting(db, host=make_user(db, name="Unsummarised"))
    db.commit()

    response = client.get(f"/api/v1/meetings/{meeting.id}/summary")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["overview"] is None


def test_t17_j_concurrent_regenerations_produce_one_generation(
    client: TestClient, long_meeting: Meeting, db: Session
):
    """Two clicks on Regenerate must not run it twice.

    The claim is a conditional UPDATE, so exactly one caller wins; the loser
    gets the current summary rather than an error, because from the user's
    point of view a regeneration is already happening.
    """
    from app.models import Summary

    first = client.post(f"/api/v1/meetings/{long_meeting.id}/summary/regenerate")
    second = client.post(f"/api/v1/meetings/{long_meeting.id}/summary/regenerate")

    assert first.status_code == status.HTTP_200_OK
    assert second.status_code == status.HTTP_200_OK
    # Both callers get a usable summary either way.
    assert first.json()["meeting_id"] == second.json()["meeting_id"] == long_meeting.id

    db.expire_all()
    summary = (
        db.execute(
            Summary.__table__.select().where(Summary.__table__.c.meeting_id == long_meeting.id)
        )
        .mappings()
        .one()
    )
    # And the flag is RELEASED, so Regenerate is not permanently stuck.
    assert summary["is_generating"] == 0


def test_regenerating_clears_the_stale_flag(client: TestClient, long_meeting: Meeting, db: Session):
    segment = db.execute(TranscriptSegment.__table__.select().limit(1)).mappings().one()
    client.patch(f"/api/v1/meetings/segments/{segment['id']}", json={"text": "changed"})

    assert client.get(f"/api/v1/meetings/{long_meeting.id}/summary").json()["is_stale"] is True

    client.post(f"/api/v1/meetings/{long_meeting.id}/summary/regenerate")
    assert client.get(f"/api/v1/meetings/{long_meeting.id}/summary").json()["is_stale"] is False


class TestSpeakerStats:
    """The legend's shares and the rename popover's count (T-25.7, T-25.8)."""

    def test_a_speaker_carries_its_segment_count_and_talk_time(
        self, client: TestClient, db: Session
    ) -> None:
        meeting = make_meeting(db)
        alice = make_speaker(db, meeting, label="Alice", color_index=0)
        bob = make_speaker(db, meeting, label="Bob", color_index=1)

        for index in range(3):
            db.add(
                TranscriptSegment(
                    meeting_id=meeting.id,
                    speaker_id=alice.id,
                    sequence=index,
                    start_ms=index * 10_000,
                    end_ms=index * 10_000 + 4_000,
                    text=f"Alice line {index}",
                )
            )
        db.add(
            TranscriptSegment(
                meeting_id=meeting.id,
                speaker_id=bob.id,
                sequence=3,
                start_ms=40_000,
                end_ms=41_000,
                text="Bob line",
            )
        )
        db.commit()

        speakers = client.get(f"/api/v1/meetings/{meeting.id}/speakers").json()
        by_label = {speaker["label"]: speaker for speaker in speakers}

        assert by_label["Alice"]["segment_count"] == 3
        # Three four-second lines.
        assert by_label["Alice"]["talk_ms"] == 12_000
        assert by_label["Bob"]["segment_count"] == 1
        assert by_label["Bob"]["talk_ms"] == 1_000

    def test_a_new_speaker_gets_the_next_colour(self, client: TestClient, db: Session) -> None:
        """Distinct from the ones already on screen — the point of the index."""
        meeting = make_meeting(db)
        make_speaker(db, meeting, label="Alice", color_index=0)
        make_speaker(db, meeting, label="Bob", color_index=1)
        db.commit()

        response = client.post(
            f"/api/v1/meetings/{meeting.id}/speakers", json={"label": "Priya Raman"}
        )

        assert response.status_code == 201
        assert response.json()["color_index"] == 2
        assert response.json()["segment_count"] == 0

    def test_an_edited_segment_reports_its_original_text(
        self, client: TestClient, db: Session
    ) -> None:
        """So "Revert to original" is exact rather than remembered."""
        meeting = make_meeting(db)
        speaker = make_speaker(db, meeting)
        segment = TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speaker.id,
            sequence=0,
            start_ms=0,
            end_ms=1_000,
            text="As it was said",
        )
        db.add(segment)
        db.commit()

        client.patch(
            f"/api/v1/meetings/segments/{segment.id}", json={"text": "As it was corrected"}
        )

        page = client.get(f"/api/v1/meetings/{meeting.id}/transcript").json()
        assert page["segments"][0]["original_text"] == "As it was said"
        assert page["segments"][0]["is_edited"] is True

    def test_segment_text_is_trimmed_and_bounded(self, client: TestClient, db: Session) -> None:
        meeting = make_meeting(db)
        speaker = make_speaker(db, meeting)
        segment = TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speaker.id,
            sequence=0,
            start_ms=0,
            end_ms=1_000,
            text="Original",
        )
        db.add(segment)
        db.commit()

        trimmed = client.patch(
            f"/api/v1/meetings/segments/{segment.id}", json={"text": "  padded  "}
        )
        assert trimmed.json()["text"] == "padded"

        # A paste accident, not a transcript line.
        too_long = client.patch(
            f"/api/v1/meetings/segments/{segment.id}", json={"text": "x" * 5001}
        )
        assert too_long.status_code == 422
