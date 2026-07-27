"""The summary response's SHAPE (T-23).

The panel renders five sections in a fixed order, so what matters here is not
that the fields exist but that they arrive already in the form the UI draws —
particularly the notes, which the client must not have to regroup.
"""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.enums import SummarySectionKind
from app.models.summary import SummarySection
from app.services.meetings import MeetingService
from tests.factories import make_meeting, make_summary


def _add_note(db: Session, summary_id: int, chapter: str, bullet: str, sequence: int) -> None:
    db.add(
        SummarySection(
            summary_id=summary_id,
            kind=SummarySectionKind.NOTES,
            title=chapter,
            body=bullet,
            sequence=sequence,
        )
    )


def test_notes_are_grouped_by_chapter(db: Session) -> None:
    """One group per chapter, however many rows the bullets are stored in.

    The seed writes one bullet per row and repeats the chapter title, which a
    one-row-per-group mapping turned into fifteen groups for a five-chapter
    meeting — the same heading printed four times with a single bullet under
    each.
    """
    meeting = make_meeting(db)
    summary = make_summary(db, meeting, sections=0)

    _add_note(db, summary.id, "Pricing", "Enterprise moves to usage-based billing.", 0)
    _add_note(db, summary.id, "Pricing", "Legacy customers grandfathered.", 1)
    _add_note(db, summary.id, "Incident", "Config change went out unreviewed.", 2)
    db.flush()

    out = MeetingService(db).to_summary(meeting)

    assert [group.chapter for group in out.notes] == ["Pricing", "Incident"]
    assert out.notes[0].bullets == [
        "Enterprise moves to usage-based billing.",
        "Legacy customers grandfathered.",
    ]
    assert out.notes[1].bullets == ["Config change went out unreviewed."]


def test_a_multi_line_body_contributes_every_line(db: Session) -> None:
    meeting = make_meeting(db)
    summary = make_summary(db, meeting, sections=0)

    _add_note(db, summary.id, "Wrap-up", "First point.\n\nSecond point.\n", 0)
    db.flush()

    out = MeetingService(db).to_summary(meeting)

    # Blank lines dropped, both real bullets kept.
    assert out.notes[0].bullets == ["First point.", "Second point."]


def test_chapter_order_follows_the_sequence(db: Session) -> None:
    meeting = make_meeting(db)
    summary = make_summary(db, meeting, sections=0)

    _add_note(db, summary.id, "Third", "c", 2)
    _add_note(db, summary.id, "First", "a", 0)
    _add_note(db, summary.id, "Second", "b", 1)
    db.flush()

    out = MeetingService(db).to_summary(meeting)

    assert [group.chapter for group in out.notes] == ["First", "Second", "Third"]


def test_a_meeting_with_no_summary_still_answers(db: Session) -> None:
    """`overview: null` rather than 404 — "not summarised" is a state (ADR-046)."""
    meeting = make_meeting(db)

    out = MeetingService(db).to_summary(meeting)

    assert out.overview is None
    assert out.keywords == []
    assert out.outline == []
    assert out.notes == []
    assert out.is_stale is False
