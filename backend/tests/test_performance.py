"""Latency budgets and the long-meeting stress case (T-42.10, T-42.11).

These are BUDGETS, not benchmarks. The number that matters is not "how fast on
this machine" — CI hardware varies by more than the margins here — but "does
this endpoint still do work proportional to what it returns". A regression that
matters (an N+1 that slipped past the query guard, a scan where an index was
assumed, a serialiser that walks the whole transcript to render a list row)
blows these ceilings by an order of magnitude, not by 20%.

So the ceilings are the plan's (list < 100ms, detail < 200ms, search < 200ms)
with a generous multiplier for a loaded shared runner, and the corpus is large
enough that per-row work is visible: a 20-row page over 60 meetings, and a
single meeting carrying 5,000 segments.

Cold-start effects are excluded deliberately — the first call to any endpoint
in a process pays for SQLAlchemy compiling its statements, which is real but
one-off and not what a user's second page load experiences.
"""

from __future__ import annotations

import time
from statistics import median
from typing import TYPE_CHECKING

import pytest

from tests.factories import (
    make_full_meeting,
    make_meeting,
    make_segments,
    make_speaker,
    make_summary,
    make_user,
)

if TYPE_CHECKING:
    from collections.abc import Callable

    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    from app.models import Meeting

#: The plan's budgets, times four.
#:
#: The multiplier is not slack for slow code — it is headroom for a runner that
#: is also building a Next.js bundle in another process, which is exactly what
#: this repo's CI does. An endpoint that regresses in the way these tests exist
#: to catch misses by ten times or more, so the multiplier costs no sensitivity.
BUDGET_MS = {"list": 400, "detail": 800, "search": 800, "transcript": 800}

#: Enough repeats that one unlucky GC pause cannot fail the run, few enough
#: that the suite stays fast. The MEDIAN is asserted, so a single outlier is
#: absorbed rather than papered over with a larger ceiling.
REPEATS = 5

#: T-42.11's synthetic meeting. Four hours at ~3s a segment.
STRESS_SEGMENTS = 5_000


def _median_ms(call: Callable[[], object]) -> float:
    # One warm-up outside the sample: the first request compiles statements and
    # fills caches, which every subsequent one benefits from.
    call()
    timings = []
    for _ in range(REPEATS):
        started = time.perf_counter()
        call()
        timings.append((time.perf_counter() - started) * 1000)
    return median(timings)


@pytest.fixture
def corpus(db: Session) -> list[Meeting]:
    """Sixty meetings with the full object graph — a realistic list page."""
    host = make_user(db, name="Perf Host")
    meetings = [make_full_meeting(db, host=host, title=f"Perf meeting {i}") for i in range(60)]
    db.commit()
    return meetings


@pytest.fixture
def long_meeting(db: Session) -> Meeting:
    """One meeting carrying 5,000 segments (T-42.11)."""
    host = make_user(db, name="Marathon Host")
    meeting = make_meeting(db, host=host, title="Four-hour architecture review")
    speakers = [make_speaker(db, meeting, label=f"Speaker {i + 1}") for i in range(6)]
    make_segments(
        db,
        meeting,
        speakers,
        count=STRESS_SEGMENTS,
        text="The migration path needs a rollback plan before we schedule the cutover.",
    )
    make_summary(db, meeting)
    db.commit()
    return meeting


# ── T-42.10 · Latency budgets (case T42-J) ──────────────────────────────────


def test_t42_j_the_list_endpoint_stays_inside_its_budget(
    client: TestClient, corpus: list[Meeting]
) -> None:
    """A 20-row page over 60 meetings.

    The failure this catches: a list row that touches an unloaded relationship
    turns one query into twenty-one, and the page time with it.
    """
    elapsed = _median_ms(lambda: client.get("/api/v1/meetings", params={"page_size": 20}))

    assert elapsed < BUDGET_MS["list"], f"list page took {elapsed:.0f}ms"


def test_t42_j_the_detail_endpoint_stays_inside_its_budget(
    client: TestClient, corpus: list[Meeting]
) -> None:
    meeting_id = corpus[0].id

    elapsed = _median_ms(lambda: client.get(f"/api/v1/meetings/{meeting_id}"))

    assert elapsed < BUDGET_MS["detail"], f"detail took {elapsed:.0f}ms"


def test_t42_j_search_stays_inside_its_budget(client: TestClient, corpus: list[Meeting]) -> None:
    """Across 60 meetings' transcripts — this is the FTS index's job.

    A LIKE scan would pass on ten meetings and fail here, which is the point of
    sizing the corpus rather than reusing a two-row fixture.
    """
    elapsed = _median_ms(lambda: client.get("/api/v1/search", params={"q": "pricing"}))

    assert elapsed < BUDGET_MS["search"], f"search took {elapsed:.0f}ms"


def test_the_list_does_not_get_slower_as_the_corpus_grows(
    client: TestClient, db: Session, corpus: list[Meeting]
) -> None:
    """The property behind the budget: page time tracks PAGE SIZE, not corpus size.

    Asserted as a ratio rather than a second absolute ceiling, because the ratio
    is what stays true on a different machine. Tripling the corpus must not
    triple the time for one page of it.
    """
    before = _median_ms(lambda: client.get("/api/v1/meetings", params={"page_size": 20}))

    host = make_user(db, name="Growth Host")
    for i in range(120):
        make_meeting(db, host=host, title=f"Growth filler {i}")
    db.commit()

    after = _median_ms(lambda: client.get("/api/v1/meetings", params={"page_size": 20}))

    # Generous: timing noise on a shared runner is real, and the regression this
    # guards against is linear-in-corpus, which shows up as threefold or worse.
    assert after < before * 2.5 + 25, f"{before:.0f}ms → {after:.0f}ms as the corpus tripled"


# ── T-42.11 · The 5,000-segment meeting (case T42-F, backend half) ──────────


def test_t42_f_a_five_thousand_segment_transcript_pages_within_budget(
    client: TestClient, long_meeting: Meeting
) -> None:
    """The first page must not read the whole transcript to return 200 rows."""
    elapsed = _median_ms(
        lambda: client.get(f"/api/v1/meetings/{long_meeting.id}/transcript", params={"limit": 200})
    )

    assert elapsed < BUDGET_MS["transcript"], f"first page took {elapsed:.0f}ms"


def test_t42_f_the_last_page_of_a_long_transcript_costs_the_same_as_the_first(
    client: TestClient, long_meeting: Meeting
) -> None:
    """The property CURSOR pagination exists for (ADR on `TranscriptService.page`).

    An OFFSET would re-scan every skipped row, so page 25 of 25 would cost
    twenty-five times page 1. A cursor names a position, so both cost the same —
    and that is testable without trusting a stopwatch's absolute value.
    """
    url = f"/api/v1/meetings/{long_meeting.id}/transcript"
    first = _median_ms(lambda: client.get(url, params={"limit": 200}))

    # A cursor deep into the transcript — the far end, where offset pagination
    # has done all of its wasted work.
    late = STRESS_SEGMENTS - 200
    last = _median_ms(lambda: client.get(url, params={"limit": 200, "cursor": late}))

    assert last < first * 2 + 25, f"page 1 {first:.0f}ms vs the last page {last:.0f}ms"


def test_t42_f_searching_a_long_transcript_stays_inside_the_search_budget(
    client: TestClient, long_meeting: Meeting
) -> None:
    elapsed = _median_ms(
        lambda: client.get(
            f"/api/v1/meetings/{long_meeting.id}/transcript", params={"q": "rollback"}
        )
    )

    assert elapsed < BUDGET_MS["search"], f"in-transcript search took {elapsed:.0f}ms"


def test_a_long_meetings_detail_does_not_carry_its_transcript(
    client: TestClient, long_meeting: Meeting
) -> None:
    """`MeetingDetail` is heavy, but not 5,000-segments heavy (T-17.1).

    The split between the light list item and the heavy detail is only worth
    anything if the heavy one still refuses to inline the transcript — this is
    the assertion that keeps that promise honest as fields get added.
    """
    body = client.get(f"/api/v1/meetings/{long_meeting.id}").json()

    assert "segments" not in body
    assert body["duration_seconds"] > 0
