"""Object factories for schema and service tests.

Kept separate from conftest so they can be imported explicitly — a test that
builds a meeting should say so, rather than having one materialise from a
fixture name.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy.orm import Session

from app.models import (
    ActionItem,
    Keyword,
    Meeting,
    Participant,
    Speaker,
    Summary,
    SummarySection,
    TranscriptSegment,
    User,
)
from app.models.enums import SummarySectionKind

#: Words per minute used to derive plausible segment timings from text length.
WORDS_PER_MINUTE = 150


def make_user(db: Session, *, name: str = "Sarah Chen", email: str | None = None) -> User:
    user = User(name=name, email=email or f"{name.lower().replace(' ', '.')}@example.com")
    db.add(user)
    db.flush()
    return user


def make_meeting(
    db: Session,
    *,
    host: User | None = None,
    title: str = "Q3 Product Roadmap Sync",
    started_at: datetime | None = None,
    **kwargs: object,
) -> Meeting:
    host = host or make_user(db)
    meeting = Meeting(
        title=title,
        started_at=started_at or datetime(2026, 7, 24, 10, 0, tzinfo=UTC),
        host_id=host.id,
        duration_seconds=0,
        **kwargs,
    )
    db.add(meeting)
    db.flush()
    return meeting


def make_speaker(
    db: Session, meeting: Meeting, *, label: str = "Speaker 1", color_index: int = 0
) -> Speaker:
    speaker = Speaker(meeting_id=meeting.id, label=label, color_index=color_index)
    db.add(speaker)
    db.flush()
    return speaker


def make_participant(
    db: Session, meeting: Meeting, *, display_name: str = "Sarah Chen", **kwargs: object
) -> Participant:
    participant = Participant(meeting_id=meeting.id, display_name=display_name, **kwargs)
    db.add(participant)
    db.flush()
    return participant


def make_segments(
    db: Session,
    meeting: Meeting,
    speakers: list[Speaker],
    *,
    count: int = 50,
    text: str = "We should revisit the pricing model before the quarter closes.",
    gap_ms: int = 400,
) -> list[TranscriptSegment]:
    """Contiguous, strictly-ordered, non-overlapping segments.

    Timings are derived from word count at a plausible speaking rate rather than
    being fixed-width, so tests that assert on ordering and duration are
    exercising realistic data.
    """
    duration_ms = int(len(text.split()) / WORDS_PER_MINUTE * 60_000)
    segments: list[TranscriptSegment] = []
    cursor = 0

    for i in range(count):
        segment = TranscriptSegment(
            meeting_id=meeting.id,
            speaker_id=speakers[i % len(speakers)].id,
            start_ms=cursor,
            end_ms=cursor + duration_ms,
            sequence=i,
            text=text,
        )
        db.add(segment)
        segments.append(segment)
        cursor += duration_ms + gap_ms

    db.flush()
    meeting.duration_seconds = segments[-1].end_ms // 1000 if segments else 0
    db.flush()
    return segments


def make_summary(db: Session, meeting: Meeting, *, sections: int = 3) -> Summary:
    summary = Summary(
        meeting_id=meeting.id,
        overview="The team reviewed Q3 progress and agreed to revisit pricing.",
        provider="mock",
    )
    db.add(summary)
    db.flush()

    for i in range(sections):
        db.add(
            SummarySection(
                summary_id=summary.id,
                kind=SummarySectionKind.OUTLINE,
                title=f"Chapter {i + 1}",
                start_ms=i * 60_000,
                sequence=i,
            )
        )
    db.flush()
    return summary


def make_action_items(
    db: Session, meeting: Meeting, *, count: int = 4, assignee: Participant | None = None
) -> list[ActionItem]:
    items = [
        ActionItem(
            meeting_id=meeting.id,
            text=f"Follow up on item {i + 1}",
            assignee_participant_id=assignee.id if assignee else None,
            sequence=i,
            due_date=(datetime.now(UTC) + timedelta(days=i)).date(),
        )
        for i in range(count)
    ]
    db.add_all(items)
    db.flush()
    return items


def make_keywords(db: Session, meeting: Meeting, *, terms: tuple[str, ...] = ("pricing", "q3")):
    keywords = [
        Keyword(meeting_id=meeting.id, term=term, weight=1.0 - i * 0.1)
        for i, term in enumerate(terms)
    ]
    db.add_all(keywords)
    db.flush()
    return keywords


def make_full_meeting(db: Session, **kwargs: object) -> Meeting:
    """A meeting with the whole object graph attached — the T-03.12 shape."""
    meeting = make_meeting(db, **kwargs)
    speakers = [make_speaker(db, meeting, label=f"Speaker {i + 1}") for i in range(3)]
    participant = make_participant(db, meeting)
    make_segments(db, meeting, speakers, count=50)
    make_summary(db, meeting)
    make_action_items(db, meeting, assignee=participant)
    make_keywords(db, meeting)
    db.commit()
    return meeting
