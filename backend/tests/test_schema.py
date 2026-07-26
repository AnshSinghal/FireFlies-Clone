"""Schema integrity (T-03.12, cases T03-A → T03-F).

These are the tests that prove the schema does what the documentation claims.
Cascades, foreign keys and the FTS index all fail *silently* when misconfigured —
a missing PRAGMA does not raise, it just quietly stops deleting children — so
each one is asserted rather than assumed.
"""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.search import fts_row_count, search_segments
from app.models import (
    ActionItem,
    Keyword,
    Meeting,
    Speaker,
    Summary,
    SummarySection,
    TranscriptSegment,
)
from tests.factories import (
    make_full_meeting,
    make_meeting,
    make_segments,
    make_speaker,
    make_user,
)


def _count(db: Session, model: type, **filters: object) -> int:
    stmt = select(func.count()).select_from(model)
    for key, value in filters.items():
        stmt = stmt.where(getattr(model, key) == value)
    return int(db.execute(stmt).scalar_one())


# ── T03-A · cascade ─────────────────────────────────────────────────────────


def test_hard_delete_removes_every_child(db: Session) -> None:
    meeting = make_full_meeting(db)
    meeting_id = meeting.id
    summary_id = meeting.summary.id if meeting.summary else None

    assert _count(db, TranscriptSegment, meeting_id=meeting_id) == 50
    assert _count(db, ActionItem, meeting_id=meeting_id) == 4
    assert fts_row_count(db) == 50

    db.delete(meeting)
    db.commit()

    assert _count(db, TranscriptSegment, meeting_id=meeting_id) == 0
    assert _count(db, Speaker, meeting_id=meeting_id) == 0
    assert _count(db, Summary, meeting_id=meeting_id) == 0
    assert _count(db, ActionItem, meeting_id=meeting_id) == 0
    assert _count(db, Keyword, meeting_id=meeting_id) == 0
    assert _count(db, SummarySection, summary_id=summary_id) == 0

    # The FTS triggers must have fired too — an index full of orphaned rows
    # would keep returning hits for a meeting that no longer exists.
    assert fts_row_count(db) == 0


# ── T03-B · ordering integrity ──────────────────────────────────────────────


def test_duplicate_sequence_within_a_meeting_is_rejected(db: Session) -> None:
    meeting = make_meeting(db)
    speaker = make_speaker(db, meeting)
    make_segments(db, meeting, [speaker], count=3)
    db.commit()

    db.add(
        TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speaker.id,
            start_ms=0,
            end_ms=1000,
            sequence=1,  # already taken
            text="duplicate",
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_same_sequence_in_different_meetings_is_fine(db: Session) -> None:
    """The uniqueness is per meeting, not global."""
    user = make_user(db)
    first = make_meeting(db, host=user, title="First")
    second = make_meeting(db, host=user, title="Second")
    make_segments(db, first, [make_speaker(db, first)], count=3)
    make_segments(db, second, [make_speaker(db, second)], count=3)

    db.commit()  # must not raise

    assert _count(db, TranscriptSegment) == 6


# ── T03-C · foreign keys are actually enforced ──────────────────────────────


def test_segment_with_bogus_meeting_id_is_rejected(db: Session) -> None:
    """Proves `PRAGMA foreign_keys=ON` is applied.

    SQLite ships with FK enforcement OFF. Without the connect hook in
    db/session.py this insert succeeds, every `ondelete="CASCADE"` in the schema
    silently does nothing, and the cascade test above passes while deleting
    nothing.
    """
    meeting = make_meeting(db)
    speaker = make_speaker(db, meeting)
    db.commit()

    db.add(
        TranscriptSegment(
            meeting_id=999_999,
            speaker_id=speaker.id,
            start_ms=0,
            end_ms=1000,
            sequence=0,
            text="orphan",
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_foreign_keys_pragma_is_on(db: Session) -> None:
    assert db.execute(text("PRAGMA foreign_keys")).scalar_one() == 1


# ── T03-D · soft delete ─────────────────────────────────────────────────────


def test_soft_delete_hides_the_row_without_removing_it(db: Session) -> None:
    meeting = make_full_meeting(db)

    meeting.deleted_at = datetime.now(UTC)
    db.commit()

    # Invisible through the sanctioned query helper...
    visible = db.execute(Meeting.not_deleted()).scalars().all()
    assert meeting.id not in [m.id for m in visible]

    # ...but the row, and everything hanging off it, is still there.
    assert db.get(Meeting, meeting.id) is not None
    assert _count(db, TranscriptSegment, meeting_id=meeting.id) == 50

    # And it comes back intact.
    meeting.deleted_at = None
    db.commit()
    assert meeting.id in [m.id for m in db.execute(Meeting.not_deleted()).scalars()]


# ── T03-E · FTS index stays in sync ─────────────────────────────────────────


def test_fts_finds_a_word_and_forgets_it_after_an_edit(db: Session) -> None:
    meeting = make_meeting(db)
    speaker = make_speaker(db, meeting)
    segment = TranscriptSegment(
        meeting_id=meeting.id,
        speaker_id=speaker.id,
        start_ms=0,
        end_ms=5000,
        sequence=0,
        text="We need to discuss the aardvark migration timeline.",
    )
    db.add(segment)
    db.commit()

    assert len(search_segments(db, "aardvark")) == 1

    segment.text = "We need to discuss the platypus migration timeline."
    db.commit()

    assert search_segments(db, "aardvark") == []
    assert len(search_segments(db, "platypus")) == 1


def test_fts_stemming_matches_word_variants(db: Session) -> None:
    """Porter tokenizer — a search for 'pricing' should find 'priced'."""
    meeting = make_meeting(db)
    speaker = make_speaker(db, meeting)
    db.add(
        TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speaker.id,
            start_ms=0,
            end_ms=5000,
            sequence=0,
            text="The enterprise tier is priced per seat.",
        )
    )
    db.commit()

    assert len(search_segments(db, "pricing")) == 1


def test_search_excludes_soft_deleted_meetings(db: Session) -> None:
    """The gap documented in docs/schema.md, asserted from both sides.

    Soft-deleting a meeting never touches its segments, so the rows STAY in the
    FTS index. The index is therefore still wrong on its own; what makes search
    correct is the join in `search_segments`. Both halves are asserted, because
    a future refactor that "simplifies" that join away would otherwise pass.
    """
    meeting = make_meeting(db)
    speaker = make_speaker(db, meeting)
    db.add(
        TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speaker.id,
            start_ms=0,
            end_ms=5000,
            sequence=0,
            text="The aardvark migration is on track.",
        )
    )
    db.commit()
    assert len(search_segments(db, "aardvark")) == 1

    meeting.deleted_at = datetime.now(UTC)
    db.commit()

    # The raw index still holds the row — this is the gap, not a bug in the test.
    assert fts_row_count(db) == 1
    # But nothing reaches the user through the sanctioned path.
    assert search_segments(db, "aardvark") == []


def test_search_can_be_scoped_to_one_meeting(db: Session) -> None:
    user = make_user(db)
    first = make_meeting(db, host=user, title="First")
    second = make_meeting(db, host=user, title="Second")
    for meeting in (first, second):
        db.add(
            TranscriptSegment(
                meeting_id=meeting.id,
                speaker_id=make_speaker(db, meeting).id,
                start_ms=0,
                end_ms=5000,
                sequence=0,
                text="Shared aardvark terminology.",
            )
        )
    db.commit()

    assert len(search_segments(db, "aardvark")) == 2
    assert len(search_segments(db, "aardvark", meeting_id=first.id)) == 1


def test_blank_query_returns_nothing_rather_than_everything(db: Session) -> None:
    make_full_meeting(db)
    assert search_segments(db, "   ") == []


# ── T03-F · no N+1 ──────────────────────────────────────────────────────────


def test_loading_a_large_meeting_stays_within_the_query_budget(
    db: Session, query_counter: list[str]
) -> None:
    """Proves the `selectin` strategy on Meeting's collections.

    With the default lazy strategy this passes functionally and issues one query
    per collection per meeting. Only a statement count catches it.
    """
    meeting = make_meeting(db)
    speakers = [make_speaker(db, meeting, label=f"Speaker {i}") for i in range(4)]
    make_segments(db, meeting, speakers, count=400)
    db.commit()
    db.expunge_all()

    query_counter.clear()
    loaded = db.execute(Meeting.not_deleted().where(Meeting.id == meeting.id)).scalar_one()
    segment_count = len(loaded.segments)

    assert segment_count == 400
    selects = [s for s in query_counter if s.lstrip().upper().startswith("SELECT")]
    assert len(selects) <= 8, "eager-loading regressed:\n" + "\n".join(selects)


def test_segments_come_back_in_sequence_order(db: Session) -> None:
    meeting = make_meeting(db)
    make_segments(db, meeting, [make_speaker(db, meeting)], count=30)
    db.commit()
    db.expunge_all()

    loaded = db.get(Meeting, meeting.id)
    assert loaded is not None
    sequences = [s.sequence for s in loaded.segments]
    assert sequences == sorted(sequences)


# ── Constraints that protect the player ─────────────────────────────────────


def test_a_segment_cannot_end_before_it_starts(db: Session) -> None:
    """A reversed range breaks the binary search that drives player sync."""
    meeting = make_meeting(db)
    speaker = make_speaker(db, meeting)
    db.add(
        TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speaker.id,
            start_ms=5000,
            end_ms=1000,
            sequence=0,
            text="backwards",
        )
    )

    with pytest.raises(IntegrityError):
        db.commit()


def test_enums_are_stored_as_their_lowercase_values(db: Session) -> None:
    """Guards the `values_callable` fix in models/enums.py.

    Without it SQLAlchemy persists the member NAME, so the database would hold
    "UPLOAD" while the JSON API says "upload". Invisible through the ORM, which
    translates both ways — visible the moment anything reads raw SQL.
    """
    make_meeting(db)
    db.commit()

    raw = db.execute(
        text("SELECT media_type, source, visibility, processing_status FROM meetings")
    ).one()
    assert list(raw) == ["none", "upload", "private", "ready"]
