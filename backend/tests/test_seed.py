"""Seed data integrity (T-05, cases T05-A → T05-G).

These run the REAL seeder against a throwaway database rather than a fixture
approximating it. The seeded data is what the evaluator sees three seconds after
opening the demo, so "the seeder works" is not a claim worth taking on trust.
"""

from __future__ import annotations

from datetime import date, timedelta
from itertools import pairwise

import pytest
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.db.search import search_segments
from app.models import (
    ActionItem,
    Keyword,
    Meeting,
    Participant,
    Soundbite,
    Speaker,
    Summary,
    SummarySection,
    TranscriptSegment,
    User,
)
from app.models.enums import ActionItemStatus, SummarySectionKind
from app.seed.avatars import color_index, initials
from app.seed.seed import seed_into
from app.seed.timing import build_timeline, speech_duration_ms
from app.seed.validate import validate

ANCHOR = date(2026, 7, 26)


@pytest.fixture
def seeded(db: Session, monkeypatch: pytest.MonkeyPatch) -> Session:
    """A database with the real seed data in it.

    The anchor is pinned so date assertions do not depend on the day the suite
    happens to run — the same reason Playwright pins its clock in T-39.6.
    """
    monkeypatch.setenv("SEED_ANCHOR_DATE", "2026-07-26T09:00:00Z")
    from app.core.config import get_settings

    get_settings.cache_clear()
    seed_into(db, quiet=True)
    get_settings.cache_clear()
    return db


def _count(db: Session, model: type) -> int:
    return int(db.execute(select(func.count()).select_from(model)).scalar_one())


# ── T05-A · idempotency ─────────────────────────────────────────────────────


def test_seeding_twice_does_not_duplicate(seeded: Session, monkeypatch) -> None:
    monkeypatch.setenv("SEED_ANCHOR_DATE", "2026-07-26T09:00:00Z")
    from app.core.config import get_settings

    get_settings.cache_clear()

    before = (_count(seeded, Meeting), _count(seeded, TranscriptSegment))
    seed_into(seeded, quiet=True)
    after = (_count(seeded, Meeting), _count(seeded, TranscriptSegment))

    assert before == after
    assert _count(seeded, Meeting) == 8


def test_reset_rebuilds_rather_than_accumulating(seeded: Session, monkeypatch) -> None:
    monkeypatch.setenv("SEED_ANCHOR_DATE", "2026-07-26T09:00:00Z")
    from app.core.config import get_settings

    get_settings.cache_clear()

    seed_into(seeded, reset=True, quiet=True)

    assert _count(seeded, Meeting) == 8
    assert _count(seeded, User) == 15


# ── T05-B · derived duration ────────────────────────────────────────────────


def test_duration_matches_the_last_segment(seeded: Session) -> None:
    """Denormalised `duration_seconds` must agree with the transcript.

    If it drifts, every row in the Notebook shows a duration the meeting does
    not have — and nothing else would notice.
    """
    for meeting in seeded.execute(select(Meeting)).scalars():
        last = seeded.execute(
            select(TranscriptSegment)
            .where(TranscriptSegment.meeting_id == meeting.id)
            .order_by(TranscriptSegment.sequence.desc())
            .limit(1)
        ).scalar_one()

        assert abs(meeting.duration_seconds - last.end_ms // 1000) <= 1, meeting.title


# ── T05-C · timeline integrity ──────────────────────────────────────────────


def test_segments_are_ordered_and_never_overlap(seeded: Session) -> None:
    """The invariant the player's binary search depends on (T-21.3)."""
    for meeting in seeded.execute(select(Meeting)).scalars():
        segments = list(
            seeded.execute(
                select(TranscriptSegment)
                .where(TranscriptSegment.meeting_id == meeting.id)
                .order_by(TranscriptSegment.sequence)
            ).scalars()
        )

        assert len(segments) >= 20, meeting.title
        for previous, current in pairwise(segments):
            assert current.start_ms >= previous.end_ms, f"{meeting.title} @ {current.sequence}"
            assert current.sequence == previous.sequence + 1
            assert current.end_ms > current.start_ms


def test_timings_are_deterministic() -> None:
    """Re-running the seeder must produce byte-identical timings.

    Visual-regression baselines (T-41) are worthless otherwise, and a `random`
    call anywhere in the timeline would break this.
    """
    lines = [("Sarah Chen", "One two three four five."), ("Marcus Patel", "Six seven eight.")]
    first = build_timeline(lines, seed="fixture")
    second = build_timeline(lines, seed="fixture")

    assert [(s.start_ms, s.end_ms) for s in first] == [(s.start_ms, s.end_ms) for s in second]


def test_a_different_seed_produces_different_gaps() -> None:
    lines = [("A", "One two three."), ("B", "Four five six.")]
    first = build_timeline(lines, seed="x")[1].start_ms
    second = build_timeline(lines, seed="y")[1].start_ms
    assert first != second


def test_short_interjections_still_occupy_time() -> None:
    """'Agreed.' is one word but is not zero-length on the timeline."""
    assert speech_duration_ms("Agreed.") >= 900


# ── T05-D · outline timestamps ──────────────────────────────────────────────


def test_every_outline_timestamp_lands_inside_a_real_segment(seeded: Session) -> None:
    """A timestamp in a gap seeks the player where nothing can be highlighted.

    It looks like a broken feature rather than a data problem, which is why the
    fixtures store a segment INDEX and the seeder resolves it.
    """
    for meeting in seeded.execute(select(Meeting)).scalars():
        segments = list(
            seeded.execute(
                select(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting.id)
            ).scalars()
        )
        summary = seeded.execute(
            select(Summary).where(Summary.meeting_id == meeting.id)
        ).scalar_one()
        outline = seeded.execute(
            select(SummarySection).where(
                SummarySection.summary_id == summary.id,
                SummarySection.kind == SummarySectionKind.OUTLINE,
            )
        ).scalars()

        for entry in outline:
            assert entry.start_ms is not None
            assert any(s.start_ms <= entry.start_ms <= s.end_ms for s in segments), (
                f"{meeting.title}: '{entry.title}' at {entry.start_ms}ms is in a gap"
            )


def test_every_meeting_has_at_least_four_outline_chapters(seeded: Session) -> None:
    for meeting in seeded.execute(select(Meeting)).scalars():
        summary = seeded.execute(
            select(Summary).where(Summary.meeting_id == meeting.id)
        ).scalar_one()
        count = seeded.execute(
            select(func.count())
            .select_from(SummarySection)
            .where(
                SummarySection.summary_id == summary.id,
                SummarySection.kind == SummarySectionKind.OUTLINE,
            )
        ).scalar_one()
        assert count >= 4, meeting.title


# ── T05-E · every badge state has an example ────────────────────────────────


def test_action_items_cover_every_ui_state(seeded: Session) -> None:
    """Each of these renders differently; an unseeded state is an untested one."""
    items = list(seeded.execute(select(ActionItem)).scalars())
    assert 30 <= len(items) <= 45, f"expected 30-45 action items, got {len(items)}"

    open_items = [i for i in items if i.status is ActionItemStatus.OPEN]
    completed = [i for i in items if i.status is ActionItemStatus.COMPLETED]
    overdue = [i for i in open_items if i.due_date and i.due_date < ANCHOR]
    due_today = [i for i in items if i.due_date == ANCHOR]
    unassigned = [i for i in items if i.assignee_participant_id is None]
    undated = [i for i in items if i.due_date is None]
    timestamped = [i for i in items if i.start_ms is not None]

    assert open_items, "no open items"
    assert completed, "no completed items"
    assert overdue, "no overdue items — the danger badge has no example"
    assert due_today, "nothing due today — the warning badge has no example"
    assert unassigned, "nothing unassigned — the Unassigned group would be empty"
    assert undated, "everything has a due date — the no-badge case has no example"
    assert timestamped, "no item carries a timestamp — the seek chip has no example"


def test_completed_items_have_a_completion_time(seeded: Session) -> None:
    for item in seeded.execute(
        select(ActionItem).where(ActionItem.status == ActionItemStatus.COMPLETED)
    ).scalars():
        assert item.completed_at is not None


# ── T05-F · avatar overflow ─────────────────────────────────────────────────


def test_the_all_hands_has_enough_participants_to_overflow(seeded: Session) -> None:
    """The `+N` avatar group needs a meeting that actually triggers it."""
    meeting = seeded.execute(
        select(Meeting).where(Meeting.seed_key == "all-hands-q2-results")
    ).scalar_one()
    count = seeded.execute(
        select(func.count()).select_from(Participant).where(Participant.meeting_id == meeting.id)
    ).scalar_one()

    assert count >= 20, f"all-hands has {count} participants, need >= 20"


def test_a_two_person_meeting_also_exists(seeded: Session) -> None:
    """The opposite extreme — no overflow, no group, just two avatars."""
    meeting = seeded.execute(
        select(Meeting).where(Meeting.seed_key == "one-to-one-sarah-marcus")
    ).scalar_one()
    count = seeded.execute(
        select(func.count()).select_from(Participant).where(Participant.meeting_id == meeting.id)
    ).scalar_one()

    assert count == 2


# ── T05-G · search ──────────────────────────────────────────────────────────


def test_a_common_term_spans_multiple_meetings(seeded: Session) -> None:
    """Cross-meeting search is only demoable if a term genuinely recurs."""
    hits = search_segments(seeded, "pricing", limit=100)
    assert len({hit.meeting_id for hit in hits}) >= 2


def test_search_returns_usable_context(seeded: Session) -> None:
    hit = search_segments(seeded, "idempotency", limit=1)[0]
    assert hit.snippet.strip()
    assert hit.speaker_label
    assert hit.meeting_title


# ── Realism ─────────────────────────────────────────────────────────────────


def test_dates_span_today_through_two_months_ago(seeded: Session) -> None:
    """Every date-range filter needs data on both sides of it (T-05.3)."""
    dates = sorted(m.started_at.date() for m in seeded.execute(select(Meeting)).scalars())

    assert dates[-1] == ANCHOR, "nothing dated today"
    assert any(d == ANCHOR - timedelta(days=1) for d in dates), "nothing dated yesterday"
    assert any(ANCHOR - timedelta(days=7) <= d < ANCHOR - timedelta(days=1) for d in dates)
    assert any(ANCHOR - timedelta(days=30) <= d < ANCHOR - timedelta(days=7) for d in dates)
    assert dates[0] < ANCHOR - timedelta(days=60), "nothing old enough to test a wide range"


def test_no_placeholder_text_anywhere(seeded: Session) -> None:
    """The failure mode PLAN.md calls out by name.

    Note what is NOT banned: "placeholder". The design review legitimately
    discusses a form field's placeholder text, and an over-eager word list that
    rejects real dialogue is worse than no list — it trains you to weaken the
    check rather than fix the data.
    """
    banned = ("lorem", "ipsum", "test test", "foo bar", "asdf", "this is a test")

    for segment in seeded.execute(select(TranscriptSegment)).scalars():
        lowered = segment.text.lower()
        for phrase in banned:
            assert phrase not in lowered, f"placeholder text in segment {segment.id}"

    for meeting in seeded.execute(select(Meeting)).scalars():
        assert not meeting.title.lower().startswith("meeting "), meeting.title


def test_meetings_have_distinct_titles_and_durations(seeded: Session) -> None:
    """'Every meeting 30:00 long' is on the do-not-ship list."""
    meetings = list(seeded.execute(select(Meeting)).scalars())

    assert len({m.title for m in meetings}) == len(meetings)
    assert len({m.duration_seconds for m in meetings}) >= 6


def test_talk_time_is_derived_and_adds_up(seeded: Session) -> None:
    """participants.talk_seconds is denormalised; it must match the transcript."""
    meeting = seeded.execute(
        select(Meeting).where(Meeting.seed_key == "one-to-one-sarah-marcus")
    ).scalar_one()

    spoken = sum(
        p.talk_seconds
        for p in seeded.execute(
            select(Participant).where(Participant.meeting_id == meeting.id)
        ).scalars()
    )

    assert spoken > 0
    # Speech plus inter-speaker gaps equals wall-clock, so talk time must be
    # less than the meeting but not wildly so.
    assert spoken < meeting.duration_seconds
    assert spoken > meeting.duration_seconds * 0.4


def test_speaker_colours_match_the_shared_hash(seeded: Session) -> None:
    """The stored index is authoritative (ADR-013) but must agree with the hash."""
    for speaker in seeded.execute(select(Speaker)).scalars():
        assert speaker.color_index == color_index(speaker.label)
        assert 0 <= speaker.color_index < 8


def test_every_meeting_has_keywords(seeded: Session) -> None:
    for meeting in seeded.execute(select(Meeting)).scalars():
        count = seeded.execute(
            select(func.count()).select_from(Keyword).where(Keyword.meeting_id == meeting.id)
        ).scalar_one()
        assert count >= 5, meeting.title


def test_users_all_have_avatars(seeded: Session) -> None:
    for user in seeded.execute(select(User)).scalars():
        assert user.avatar_url and user.avatar_url.startswith("/avatars/")


def test_soundbites_are_seeded_valid_and_idempotent(seeded: Session, monkeypatch) -> None:
    """The flyout (T-33.5) needs clips on first load, including one Auto badge.

    Ranges resolve from segment indices, so every seeded clip must land inside
    its meeting and inside the 3s-3min constraints — and reseeding must not
    duplicate them (`_clear_meeting_children` covers the vertical).
    """
    monkeypatch.setenv("SEED_ANCHOR_DATE", "2026-07-26T09:00:00Z")
    from app.core.config import get_settings

    get_settings.cache_clear()

    soundbites = list(seeded.execute(select(Soundbite)).scalars())
    assert 2 <= len(soundbites) <= 6
    assert len({s.meeting_id for s in soundbites}) >= 2, "clips span multiple meetings"
    assert any(s.auto_generated for s in soundbites), "the Auto badge needs an example"
    assert any(not s.auto_generated for s in soundbites)

    for soundbite in soundbites:
        assert 3_000 <= soundbite.duration_ms <= 180_000, soundbite.title
        assert "lorem" not in soundbite.title.lower()
        meeting = seeded.get(Meeting, soundbite.meeting_id)
        assert meeting is not None
        assert soundbite.end_ms <= meeting.duration_seconds * 1000 + 999, soundbite.title

    seed_into(seeded, quiet=True)
    assert _count(seeded, Soundbite) == len(soundbites)
    get_settings.cache_clear()


@pytest.mark.parametrize(
    ("name", "expected"),
    [("Sarah Chen", "SC"), ("Cher", "C"), ("Jean-Luc Picard", "JP"), ("", "?")],
)
def test_initials(name: str, expected: str) -> None:
    assert initials(name) == expected


# ── T-05.14 · the validator itself ──────────────────────────────────────────


def test_seed_validator_passes_on_real_seed_data(seeded: Session) -> None:
    report = validate(seeded)
    assert report.ok, "seed validation failed:\n" + "\n".join(report.errors)
    assert report.checks > 100


def test_seed_validator_catches_a_broken_timeline(seeded: Session) -> None:
    """A validator nobody has seen fail proves nothing."""
    segment = seeded.execute(
        select(TranscriptSegment).order_by(TranscriptSegment.id).limit(1)
    ).scalar_one()
    segment.end_ms = segment.end_ms + 10_000_000
    seeded.flush()

    report = validate(seeded)

    assert not report.ok
    assert any("overlap" in error or "duration" in error for error in report.errors)
