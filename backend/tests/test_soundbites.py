"""Soundbite API and proposal heuristic (T-33.1 / T-33.8).

Two halves, mirroring the feature: the CRUD contract (list ordered by start,
the 3s-3min / in-meeting validation wall, hard delete) runs through the API;
the Magic Soundbites heuristic runs against `MockProvider` with a hand-built
transcript and no database, like every other provider test.
"""

from __future__ import annotations

from itertools import pairwise
from typing import TYPE_CHECKING

import httpx2
import pytest

from app.ai import LLMProvider, MockProvider, ProviderError, SegmentInput, Transcript
from app.ai.cache import ResponseCache
from app.ai.factory import CachingProvider, FallbackProvider
from tests.factories import make_meeting, make_segments, make_speaker, make_user

if TYPE_CHECKING:
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

#: The `SoundbiteOut` contract — the frontend types are generated from this.
OUT_KEYS = {"id", "meeting_id", "title", "start_ms", "end_ms", "auto_generated", "created_at"}


def _meeting_with_transcript(db: Session):  # type: ignore[no-untyped-def]
    user = make_user(db)
    meeting = make_meeting(db, host=user)
    speaker = make_speaker(db, meeting)
    make_segments(db, meeting, [speaker], count=30)
    db.commit()
    return meeting


# ── CRUD (T-33.1) ───────────────────────────────────────────────────────────


def test_t33_k_meeting_with_no_soundbites_returns_an_empty_list(
    client: TestClient, db: Session
) -> None:
    meeting = _meeting_with_transcript(db)

    listed = client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()

    assert listed == {"items": []}


def test_t33_d_created_soundbites_persist_and_list_in_start_order(
    client: TestClient, db: Session
) -> None:
    meeting = _meeting_with_transcript(db)

    later = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "Wrap-up decisions", "start_ms": 40_000, "end_ms": 50_000},
    )
    earlier = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "The pricing question", "start_ms": 5_000, "end_ms": 15_000},
    )

    assert later.status_code == 201
    assert set(later.json()) == OUT_KEYS
    assert later.json()["meeting_id"] == meeting.id
    assert later.json()["auto_generated"] is False, "defaults to a human-made clip"

    listed = client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()
    assert [item["id"] for item in listed["items"]] == [earlier.json()["id"], later.json()["id"]]
    assert [item["start_ms"] for item in listed["items"]] == [5_000, 40_000]


def test_auto_generated_flag_round_trips(client: TestClient, db: Session) -> None:
    """Saving an accepted proposal keeps its Auto badge (T-33.8)."""
    meeting = _meeting_with_transcript(db)

    created = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "Magic clip", "start_ms": 0, "end_ms": 8_000, "auto_generated": True},
    ).json()

    assert created["auto_generated"] is True
    listed = client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()
    assert listed["items"][0]["auto_generated"] is True


def test_t33_c_a_range_shorter_than_three_seconds_is_rejected(
    client: TestClient, db: Session
) -> None:
    meeting = _meeting_with_transcript(db)

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "Too short", "start_ms": 1_000, "end_ms": 3_999},
    )

    assert response.status_code == 422
    error = response.json()["error"]
    assert set(error) == {"code", "message", "details"}
    assert error["code"] == "VALIDATION_ERROR"
    assert client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()["items"] == []


def test_a_range_longer_than_three_minutes_is_rejected(client: TestClient, db: Session) -> None:
    user = make_user(db)
    meeting = make_meeting(db, host=user)
    speaker = make_speaker(db, meeting)
    # Enough transcript that only the 3-minute cap can be the reason.
    make_segments(db, meeting, [speaker], count=80)
    db.commit()

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "The whole meeting", "start_ms": 0, "end_ms": 180_001},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_a_backwards_range_is_rejected(client: TestClient, db: Session) -> None:
    meeting = _meeting_with_transcript(db)

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "Backwards", "start_ms": 10_000, "end_ms": 4_000},
    )

    assert response.status_code == 422


def test_a_range_past_the_end_of_the_meeting_is_rejected(client: TestClient, db: Session) -> None:
    meeting = _meeting_with_transcript(db)
    beyond = meeting.duration_seconds * 1000 + 10_000

    response = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "Off the end", "start_ms": beyond, "end_ms": beyond + 10_000},
    )

    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_t33_j_delete_removes_the_clip_for_good(client: TestClient, db: Session) -> None:
    meeting = _meeting_with_transcript(db)
    created = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={"title": "Ephemeral", "start_ms": 0, "end_ms": 5_000},
    ).json()

    assert client.delete(f"/api/v1/soundbites/{created['id']}").status_code == 204
    assert client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()["items"] == []

    # Hard delete: a second attempt finds nothing, with the standard envelope.
    second = client.delete(f"/api/v1/soundbites/{created['id']}")
    assert second.status_code == 404
    assert second.json()["error"]["code"] == "SOUNDBITE_NOT_FOUND"


def test_unknown_and_deleted_meetings_answer_404_and_410(client: TestClient, db: Session) -> None:
    meeting = _meeting_with_transcript(db)

    missing = client.get("/api/v1/meetings/999999/soundbites")
    assert missing.status_code == 404
    assert missing.json()["error"]["code"] == "MEETING_NOT_FOUND"

    client.delete(f"/api/v1/meetings/{meeting.id}")
    gone = client.get(f"/api/v1/meetings/{meeting.id}/soundbites")
    assert gone.status_code == 410
    assert gone.json()["error"]["code"] == "MEETING_DELETED"


# ── Proposals over the API (T-33.8) ─────────────────────────────────────────


def test_t33_h_proposals_are_three_deterministic_unsaved_candidates(
    client: TestClient, db: Session
) -> None:
    meeting = _meeting_with_transcript(db)

    first = client.get(f"/api/v1/meetings/{meeting.id}/soundbites/proposals")
    second = client.get(f"/api/v1/meetings/{meeting.id}/soundbites/proposals")

    assert first.status_code == 200
    items = first.json()["items"]
    assert len(items) == 3
    for item in items:
        assert set(item) == {"title", "start_ms", "end_ms", "score"}
        assert 3_000 <= item["end_ms"] - item["start_ms"] <= 180_000
        assert item["start_ms"] >= 0
        assert item["end_ms"] <= meeting.duration_seconds * 1000 + 999

    # Same meeting, same three clips — byte-identical (the T29-A guarantee).
    assert first.content == second.content

    # Proposals are NOT rows; only saving one is (T-33.8).
    assert client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()["items"] == []


def test_saving_a_proposal_persists_it_with_the_auto_badge(client: TestClient, db: Session) -> None:
    meeting = _meeting_with_transcript(db)
    proposal = client.get(f"/api/v1/meetings/{meeting.id}/soundbites/proposals").json()["items"][0]

    saved = client.post(
        f"/api/v1/meetings/{meeting.id}/soundbites",
        json={
            "title": proposal["title"],
            "start_ms": proposal["start_ms"],
            "end_ms": proposal["end_ms"],
            "auto_generated": True,
        },
    )

    assert saved.status_code == 201, "every proposal must be saveable as-is"
    listed = client.get(f"/api/v1/meetings/{meeting.id}/soundbites").json()["items"]
    assert [item["auto_generated"] for item in listed] == [True]


def test_the_proposals_endpoint_is_rate_limited(client: TestClient, db: Session) -> None:
    """It calls the provider, so it wears the same 10/minute budget."""
    meeting = _meeting_with_transcript(db)

    statuses = [
        client.get(f"/api/v1/meetings/{meeting.id}/soundbites/proposals").status_code
        for _ in range(11)
    ]

    assert statuses[:10] == [200] * 10
    assert statuses[10] == 429


# ── The heuristic itself (MockProvider, no DB) ──────────────────────────────


def _turn(speaker: str, text: str, start_ms: int, end_ms: int) -> SegmentInput:
    return SegmentInput(speaker=speaker, text=text, start_ms=start_ms, end_ms=end_ms)


@pytest.fixture
def transcript() -> Transcript:
    """Distinct topics with very different keyword density, so the windows
    the heuristic should prefer are knowable in advance."""
    lines = [
        ("Priya Sharma", "Morning everyone, quick sync before the launch review."),
        ("Marcus Lee", "The billing migration is the headline: usage-based billing lands Monday."),
        (
            "Marcus Lee",
            "Billing cutover needs the migration script reviewed and the billing flags removed.",
        ),
        ("Dana Kim", "Support volume is flat, nothing unusual this week."),
        ("Dana Kim", "One escalation about export timeouts, already resolved."),
        ("Priya Sharma", "Design handoff for the onboarding revamp is complete."),
        ("Marcus Lee", "Onboarding metrics improved after the revamp shipped to the beta cohort."),
        ("Dana Kim", "The beta cohort retention looks strong, especially week two."),
        ("Priya Sharma", "Let's close with launch logistics and the announcement plan."),
        ("Marcus Lee", "Announcement drafts are with marketing, launch checklist is on track."),
    ]
    return Transcript(
        segments=[
            _turn(speaker, text, index * 6_000, index * 6_000 + 5_000)
            for index, (speaker, text) in enumerate(lines)
        ]
    )


def test_mock_proposals_are_byte_identical_across_runs(transcript: Transcript) -> None:
    provider = MockProvider()

    def run() -> str:
        return str([p.model_dump_json() for p in provider.propose_soundbites(transcript)])

    first = run()
    assert all(run() == first for _ in range(4))


def test_mock_proposals_snap_to_segments_and_respect_every_bound(
    transcript: Transcript,
) -> None:
    proposals = MockProvider().propose_soundbites(transcript)

    assert len(proposals) == 3
    starts = {segment.start_ms for segment in transcript.segments}
    ends = {segment.end_ms for segment in transcript.segments}
    for proposal in proposals:
        assert 3_000 <= proposal.end_ms - proposal.start_ms <= 180_000
        assert proposal.start_ms in starts, "clips must open on a segment boundary"
        assert proposal.end_ms in ends, "clips must close on a segment boundary"
        assert proposal.title
        assert 0.0 <= proposal.score <= 1.0

    # Timeline order, and never overlapping — three bands on one seekbar.
    assert [p.start_ms for p in proposals] == sorted(p.start_ms for p in proposals)
    for previous, current in pairwise(proposals):
        assert previous.end_ms <= current.start_ms

    assert max(p.score for p in proposals) == 1.0, "scores normalise to a 1.0 peak"


def test_mock_proposals_handle_empty_and_tiny_transcripts() -> None:
    provider = MockProvider()

    assert provider.propose_soundbites(Transcript(segments=[])) == []

    lone = Transcript(
        segments=[_turn("Ana Silva", "Shipping the fix today after the review.", 0, 4_000)]
    )
    proposals = provider.propose_soundbites(lone)
    assert len(proposals) == 1
    assert (proposals[0].start_ms, proposals[0].end_ms) == (0, 4_000)


def test_a_monologue_longer_than_the_cap_is_trimmed_not_skipped() -> None:
    huge = Transcript(
        segments=[
            _turn(
                "Ana Silva",
                "The quarterly numbers deserve a full walkthrough before the board sees them.",
                0,
                200_000,
            )
        ]
    )

    proposals = MockProvider().propose_soundbites(huge)

    assert len(proposals) == 1
    assert proposals[0].end_ms - proposals[0].start_ms == 180_000


def test_llm_provider_declines_and_the_fallback_serves_the_heuristic(
    transcript: Transcript,
) -> None:
    """The T-29.7 degradation path is how the LLM pipeline gets proposals —
    both factory wrappers must forward the new method or assembly TypeErrors."""
    dead_llm = LLMProvider(
        vendor="anthropic",
        api_key="k",
        transport=httpx2.MockTransport(
            lambda _request: (_ for _ in ()).throw(AssertionError("no request should be made"))
        ),
    )
    with pytest.raises(ProviderError):
        dead_llm.propose_soundbites(transcript)

    pipeline = CachingProvider(FallbackProvider(dead_llm, MockProvider()), ResponseCache())
    assert pipeline.propose_soundbites(transcript) == MockProvider().propose_soundbites(transcript)


def test_proposals_are_served_from_cache_on_identical_input(transcript: Transcript) -> None:
    class _Spy(MockProvider):
        def __init__(self) -> None:
            self.calls = 0

        def propose_soundbites(self, transcript: Transcript):  # type: ignore[no-untyped-def]
            self.calls += 1
            return super().propose_soundbites(transcript)

    spy = _Spy()
    cached = CachingProvider(spy, ResponseCache())

    first = cached.propose_soundbites(transcript)
    second = cached.propose_soundbites(transcript)

    assert spy.calls == 1
    assert first == second
