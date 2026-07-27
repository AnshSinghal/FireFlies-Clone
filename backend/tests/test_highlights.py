"""Highlights and bookmarks (T-32, cases T32-A → T32-K, backend half).

The Playwright suite owns the rendering assertions. What is provable here is
everything the renderer depends on being true: offsets stored exactly, ranges
that survive an edit or are removed rather than left garbled, and a star that is
genuinely a toggle.
"""

from __future__ import annotations

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Highlight, Meeting, TranscriptSegment
from app.services.highlights import HighlightService
from tests.factories import make_meeting, make_segments, make_speaker, make_user

SENTENCE = "We should revisit the pricing model before the board meeting on Friday"


@pytest.fixture
def meeting(db: Session) -> Meeting:
    user = make_user(db, name="Sarah Chen")
    meeting = make_meeting(db, host=user, title="Q3 Pricing Review")
    speakers = [make_speaker(db, meeting, label=f"Speaker {i + 1}") for i in range(2)]
    make_segments(db, meeting, speakers, count=6, text=SENTENCE)
    db.commit()
    return meeting


@pytest.fixture
def segment(db: Session, meeting: Meeting) -> TranscriptSegment:
    return meeting.segments[0]


def _create(client: TestClient, meeting: Meeting, segment: TranscriptSegment, **kwargs: object):
    payload = {"segment_id": segment.id, "start_offset": 22, "end_offset": 35, **kwargs}
    return client.post(f"/api/v1/meetings/{meeting.id}/highlights", json=payload)


# ── Creating and reading (T32-A) ────────────────────────────────────────────


def test_t32_a_a_highlight_stores_exactly_the_selected_characters(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """The stored range must quote the selection and nothing either side of it.

    The failure this guards against is the whole-segment highlight in T-32's
    ❌ list: offsets that round outward look almost right until you compare them
    to what the user dragged over.
    """
    response = _create(client, meeting, segment)

    assert response.status_code == status.HTTP_201_CREATED
    body = response.json()
    assert body["start_offset"] == 22
    assert body["end_offset"] == 35
    assert body["text"] == segment.text[22:35] == "pricing model"
    assert body["color"] == "amber"


def test_a_highlight_carries_the_context_a_flyout_needs(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """No transcript fetch to render the panel.

    The flyout lists highlights across the whole meeting while the client holds
    one page of segments; without these fields it would have to page the entire
    transcript to label six rows.
    """
    body = _create(client, meeting, segment).json()

    assert body["start_ms"] == segment.start_ms
    assert body["speaker_id"] == segment.speaker_id
    assert body["speaker_label"] == segment.speaker.label


def test_t32_b_two_highlights_in_one_segment_are_both_returned_in_offset_order(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    _create(client, meeting, segment, start_offset=22, end_offset=35)
    _create(client, meeting, segment, start_offset=3, end_offset=9, color="green")

    body = client.get(f"/api/v1/meetings/{meeting.id}/highlights").json()

    assert [h["start_offset"] for h in body] == [3, 22]
    assert [h["text"] for h in body] == ["should", "pricing model"]


def test_highlights_are_ordered_by_reading_position_not_creation_time(
    client: TestClient, meeting: Meeting
):
    later, earlier = meeting.segments[3], meeting.segments[1]
    _create(client, meeting, later)
    _create(client, meeting, earlier)

    body = client.get(f"/api/v1/meetings/{meeting.id}/highlights").json()

    assert [h["segment_id"] for h in body] == [earlier.id, later.id]


# ── Validation ──────────────────────────────────────────────────────────────


def test_an_empty_range_is_rejected_before_it_reaches_the_check_constraint(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """422 naming the field, not a 500 carrying a driver message."""
    response = _create(client, meeting, segment, start_offset=10, end_offset=10)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_offsets_past_the_end_of_the_text_are_clamped_not_stored(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """A client racing an edit gets a short highlight, never one out of bounds."""
    body = _create(client, meeting, segment, start_offset=5, end_offset=9_999).json()

    assert body["end_offset"] == len(segment.text)
    assert body["text"] == segment.text[5:]


def test_a_segment_from_another_meeting_is_refused(
    client: TestClient, db: Session, meeting: Meeting
):
    other = make_meeting(db, host=make_user(db, name="Other Host"), title="Someone Else's Call")
    speaker = make_speaker(db, other, label="Them")
    make_segments(db, other, [speaker], count=2, text="unrelated words entirely")
    db.commit()

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/highlights",
        json={"segment_id": other.segments[0].id, "start_offset": 0, "end_offset": 4},
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "SEGMENT_NOT_FOUND"


# ── Editing a highlight (T32-D, T32-E, T32-F) ───────────────────────────────


def test_t32_e_changing_colour_persists(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    created = _create(client, meeting, segment).json()

    patched = client.patch(
        f"/api/v1/meetings/{meeting.id}/highlights/{created['id']}", json={"color": "blue"}
    )

    assert patched.status_code == status.HTTP_200_OK
    assert patched.json()["color"] == "blue"
    assert client.get(f"/api/v1/meetings/{meeting.id}/highlights").json()[0]["color"] == "blue"


def test_t32_d_a_note_can_be_attached_and_then_cleared(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """`null` clears; omission leaves alone. One endpoint, two intents kept apart."""
    created = _create(client, meeting, segment).json()
    url = f"/api/v1/meetings/{meeting.id}/highlights/{created['id']}"

    assert client.patch(url, json={"note": "Chase this with Finance"}).json()["note"] == (
        "Chase this with Finance"
    )
    # A colour-only patch must not wipe the note.
    assert client.patch(url, json={"color": "pink"}).json()["note"] == "Chase this with Finance"
    assert client.patch(url, json={"note": None}).json()["note"] is None


def test_t32_f_removing_a_highlight_leaves_nothing_behind(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    created = _create(client, meeting, segment).json()

    response = client.delete(f"/api/v1/meetings/{meeting.id}/highlights/{created['id']}")

    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert client.get(f"/api/v1/meetings/{meeting.id}/highlights").json() == []


def test_a_highlight_belonging_to_another_meeting_is_not_patchable_through_this_one(
    client: TestClient, db: Session, meeting: Meeting, segment: TranscriptSegment
):
    created = _create(client, meeting, segment).json()
    other = make_meeting(db, host=make_user(db, name="Other Host"), title="Elsewhere")
    db.commit()

    response = client.patch(
        f"/api/v1/meetings/{other.id}/highlights/{created['id']}", json={"color": "green"}
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


# ── Surviving an edit (T32-J) ───────────────────────────────────────────────


def test_t32_j_an_edit_elsewhere_in_the_line_moves_the_highlight_with_the_text(
    client: TestClient, db: Session, meeting: Meeting, segment: TranscriptSegment
):
    """The common case: fixing a typo before the highlight shifts every offset.

    Leaving the offsets alone would paint the mark thirteen characters early —
    the garbled render T-32.11 forbids.
    """
    created = _create(client, meeting, segment).json()
    assert created["text"] == "pricing model"

    client.patch(
        f"/api/v1/meetings/segments/{segment.id}",
        json={"text": f"Honestly, {segment.text}"},
    )

    body = client.get(f"/api/v1/meetings/{meeting.id}/highlights").json()
    assert len(body) == 1
    assert body[0]["text"] == "pricing model"
    assert body[0]["start_offset"] == 22 + len("Honestly, ")


def test_an_edit_that_removes_the_highlighted_words_drops_the_highlight(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """Gone is a state the user can see. A wrong range is one they cannot."""
    _create(client, meeting, segment)

    client.patch(
        f"/api/v1/meetings/segments/{segment.id}",
        json={"text": "We should revisit the cost structure before the board meeting"},
    )

    assert client.get(f"/api/v1/meetings/{meeting.id}/highlights").json() == []


def test_an_edit_making_the_quote_ambiguous_drops_the_highlight(
    client: TestClient, db: Session, meeting: Meeting
):
    """Two candidate positions is not a relocation, it is a coin toss."""
    segment = meeting.segments[0]
    segment.text = "alpha beta gamma"
    db.commit()

    client.post(
        f"/api/v1/meetings/{meeting.id}/highlights",
        json={"segment_id": segment.id, "start_offset": 6, "end_offset": 10},
    )

    client.patch(f"/api/v1/meetings/segments/{segment.id}", json={"text": "alpha beta gamma beta"})

    assert client.get(f"/api/v1/meetings/{meeting.id}/highlights").json() == []


def test_remapping_leaves_other_segments_highlights_untouched(client: TestClient, meeting: Meeting):
    first, second = meeting.segments[0], meeting.segments[1]
    _create(client, meeting, first)
    _create(client, meeting, second)

    client.patch(f"/api/v1/meetings/segments/{first.id}", json={"text": f"Right. {first.text}"})

    body = client.get(f"/api/v1/meetings/{meeting.id}/highlights").json()
    assert len(body) == 2
    assert {h["text"] for h in body} == {"pricing model"}


def test_a_speaker_reassignment_does_not_disturb_highlights(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """`remap_after_edit` returns early when the text is unchanged."""
    _create(client, meeting, segment)
    other_speaker = meeting.speakers[1]

    client.patch(f"/api/v1/meetings/segments/{segment.id}", json={"speaker_id": other_speaker.id})

    body = client.get(f"/api/v1/meetings/{meeting.id}/highlights").json()
    assert len(body) == 1
    assert body[0]["speaker_id"] == other_speaker.id


# ── Bookmarks (T32-G) ───────────────────────────────────────────────────────


def test_t32_g_starring_a_segment_reports_the_resulting_state(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    response = client.post(
        f"/api/v1/meetings/{meeting.id}/bookmarks", json={"segment_id": segment.id}
    )

    body = response.json()
    assert body["bookmarked"] is True
    assert body["bookmark"]["start_ms"] == segment.start_ms
    assert body["bookmark"]["speaker_label"] == segment.speaker.label


def test_toggling_twice_returns_to_unstarred_without_a_unique_violation(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """The row is reused, which is why a second star does not collide."""
    url = f"/api/v1/meetings/{meeting.id}/bookmarks"

    assert client.post(url, json={"segment_id": segment.id}).json()["bookmarked"] is True
    assert client.post(url, json={"segment_id": segment.id}).json()["bookmarked"] is False
    third = client.post(url, json={"segment_id": segment.id})
    assert third.json()["bookmarked"] is True

    assert len(client.get(url).json()) == 1


def test_bookmarks_come_back_in_recording_order(client: TestClient, meeting: Meeting):
    """A map of the recording has to read in the recording's order."""
    url = f"/api/v1/meetings/{meeting.id}/bookmarks"
    for index in (4, 0, 2):
        client.post(url, json={"segment_id": meeting.segments[index].id})

    body = client.get(url).json()

    assert [b["segment_id"] for b in body] == [
        meeting.segments[0].id,
        meeting.segments[2].id,
        meeting.segments[4].id,
    ]


def test_an_unstarred_bookmark_disappears_from_the_list(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    url = f"/api/v1/meetings/{meeting.id}/bookmarks"
    client.post(url, json={"segment_id": segment.id})
    client.post(url, json={"segment_id": segment.id})

    assert client.get(url).json() == []


def test_a_long_segment_is_snipped_for_the_flyout(
    client: TestClient, db: Session, meeting: Meeting
):
    segment = meeting.segments[0]
    segment.text = "word " * 200
    db.commit()

    client.post(f"/api/v1/meetings/{meeting.id}/bookmarks", json={"segment_id": segment.id})

    text = client.get(f"/api/v1/meetings/{meeting.id}/bookmarks").json()[0]["text"]
    assert text.endswith("…")
    assert len(text) <= 181


def test_bookmarking_a_segment_from_another_meeting_is_refused(
    client: TestClient, db: Session, meeting: Meeting
):
    other = make_meeting(db, host=make_user(db, name="Other Host"), title="Elsewhere")
    speaker = make_speaker(db, other, label="Them")
    make_segments(db, other, [speaker], count=1, text="not ours")
    db.commit()

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/bookmarks", json={"segment_id": other.segments[0].id}
    )

    assert response.status_code == status.HTTP_404_NOT_FOUND


# ── Soft delete and cascade ─────────────────────────────────────────────────


def test_a_deleted_meeting_answers_410_rather_than_an_empty_list(
    client: TestClient, meeting: Meeting, segment: TranscriptSegment
):
    """`[]` would read as "no highlights", which is a different fact."""
    _create(client, meeting, segment)
    client.delete(f"/api/v1/meetings/{meeting.id}")

    for path in ("highlights", "bookmarks"):
        response = client.get(f"/api/v1/meetings/{meeting.id}/{path}")
        assert response.status_code == status.HTTP_410_GONE


def test_remap_is_a_no_op_when_the_segment_has_no_highlights(db: Session, meeting: Meeting):
    """The hot path: most edits touch lines nobody has marked up."""
    segment = meeting.segments[0]

    HighlightService(db).remap_after_edit(segment.id, segment.text, "something else entirely")

    assert db.query(Highlight).count() == 0
