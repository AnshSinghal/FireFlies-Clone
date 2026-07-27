"""T-29 provider tests — cases T29-A through T29-I.

Most of these run against `MockProvider` with a hand-built transcript and no
database: the AI layer speaks plain types (T-29.1), so nothing here needs an
app until the route-level fallback test (T29-F).
"""

from __future__ import annotations

import re
from datetime import date
from itertools import pairwise
from typing import TYPE_CHECKING

import httpx2
import pytest

from app.ai import (
    FALLBACK_PROVIDER_LABEL,
    LLMProvider,
    MockProvider,
    SegmentInput,
    SummaryResult,
    Transcript,
    get_ai_provider,
)
from app.ai.cache import ResponseCache
from app.ai.factory import CachingProvider, FallbackProvider
from app.ai.llm import chunk_transcript
from app.ai.mock import _STOP_WORDS
from app.ai.prompts import load_prompt, prompts_fingerprint
from tests.factories import make_full_meeting

if TYPE_CHECKING:
    from fastapi import FastAPI
    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

# ── Fixture transcript ──────────────────────────────────────────────────────
# A realistic product sync with exactly THREE explicit commitments (T29-B),
# distinct vocabulary per turn (T29-C), and two >2s pauses so the outline
# heuristic has genuine topic boundaries to find (T29-D).

_COMMITMENTS = (
    "I'll send the updated pricing deck to everyone by Friday.",
    "Can you review the API specification before Thursday, Marcus?",
    "We need to finalize the launch checklist next week.",
)


def _turn(speaker: str, text: str, start_ms: int, end_ms: int) -> SegmentInput:
    return SegmentInput(speaker=speaker, text=text, start_ms=start_ms, end_ms=end_ms)


@pytest.fixture
def transcript() -> Transcript:
    segments = [
        _turn("Priya Sharma", "Welcome back everyone, this is our weekly product sync.", 0, 4000),
        _turn(
            "Priya Sharma",
            "Today we cover the pricing revamp, the analytics dashboard beta, and launch planning.",
            4200,
            11000,
        ),
        _turn(
            "Marcus Lee",
            "The enterprise pricing tier still looks expensive next to competitors.",
            11300,
            17000,
        ),
        _turn(
            "Marcus Lee",
            "Two prospects churned during negotiation last month citing exactly that.",
            17200,
            22000,
        ),
        _turn("Priya Sharma", _COMMITMENTS[0], 22300, 27000),
        _turn("Dana Kim", "Thanks, that deck will help the sales conversations.", 27200, 31000),
        # ~3s pause — topic boundary.
        _turn(
            "Dana Kim",
            "Moving on, the analytics dashboard beta feedback has been strong.",
            34500,
            39000,
        ),
        _turn(
            "Dana Kim",
            "Activation improved eleven percent after the onboarding revamp shipped.",
            39200,
            44000,
        ),
        _turn(
            "Marcus Lee",
            "Retention curves look healthier too, especially for the analytics cohort.",
            44300,
            49000,
        ),
        _turn("Dana Kim", _COMMITMENTS[1], 49300, 53000),
        _turn("Marcus Lee", "Sure, I can take the specification review this week.", 53200, 57000),
        # ~3s pause — topic boundary.
        _turn("Priya Sharma", "Last topic is the public launch planning.", 60500, 64000),
        _turn(
            "Priya Sharma",
            "Marketing wants the announcement blog post and demo video aligned.",
            64200,
            69000,
        ),
        _turn("Dana Kim", _COMMITMENTS[2], 69300, 74000),
        _turn(
            "Marcus Lee",
            "Agreed, the launch checklist should include the pricing page updates.",
            74200,
            79000,
        ),
        _turn("Priya Sharma", "Great session, see you all next Monday.", 79300, 82000),
    ]
    return Transcript(segments=segments, reference_date=date(2026, 7, 20))


@pytest.fixture
def provider() -> MockProvider:
    return MockProvider()


# ── T29-A: determinism ──────────────────────────────────────────────────────


def test_mock_output_is_byte_identical_across_runs(
    provider: MockProvider, transcript: Transcript
) -> None:
    """T29-A: five runs of the full pipeline, byte-identical results."""

    def run() -> str:
        return "||".join(
            [
                provider.generate_summary(transcript).model_dump_json(),
                str([k.model_dump_json() for k in provider.extract_keywords(transcript)]),
                str([o.model_dump_json() for o in provider.generate_outline(transcript)]),
                str([a.model_dump_json() for a in provider.extract_action_items(transcript)]),
                provider.answer_question(transcript, "What about pricing?").model_dump_json(),
            ]
        )

    first = run()
    assert all(run() == first for _ in range(4))


# ── T29-B: action items ─────────────────────────────────────────────────────


def test_extracts_the_known_commitments(provider: MockProvider, transcript: Transcript) -> None:
    """T29-B: a transcript with 3 explicit commitments yields at least 2."""
    extracted = {item.text for item in provider.extract_action_items(transcript)}
    found = [commitment for commitment in _COMMITMENTS if commitment in extracted]
    assert len(found) >= 2, f"only found {found}"


def test_action_item_owner_and_due_date_inference(
    provider: MockProvider, transcript: Transcript
) -> None:
    items = {item.text: item for item in provider.extract_action_items(transcript)}

    first_person = items[_COMMITMENTS[0]]
    assert first_person.assignee == "Priya Sharma"
    # "by Friday" resolved against the meeting date (Mon 2026-07-20), never
    # against the wall clock.
    assert first_person.due_date == date(2026, 7, 24)

    delegated = items[_COMMITMENTS[1]]
    assert delegated.assignee == "Marcus Lee"


# ── T29-C: keywords ─────────────────────────────────────────────────────────


def test_keywords_are_six_real_transcript_terms(
    provider: MockProvider, transcript: Transcript
) -> None:
    """T29-C: exactly 6, no stop words, all present in the transcript."""
    keywords = provider.extract_keywords(transcript)
    assert len(keywords) == 6
    lowered_transcript = transcript.text.lower()
    for keyword in keywords:
        assert keyword.term not in _STOP_WORDS
        assert keyword.term in lowered_transcript
        assert 0.0 < keyword.weight <= 1.0


# ── T29-D: outline ──────────────────────────────────────────────────────────


def test_outline_lands_on_real_segments_in_order(
    provider: MockProvider, transcript: Transcript
) -> None:
    """T29-D: ≥3 entries; every start_ms inside a real segment; increasing."""
    outline = provider.generate_outline(transcript)
    assert len(outline) >= 3

    starts = [entry.start_ms for entry in outline]
    assert starts == sorted(set(starts)), "outline timestamps must strictly increase"

    for entry in outline:
        assert any(
            segment.start_ms <= entry.start_ms <= segment.end_ms for segment in transcript.segments
        ), f"outline entry at {entry.start_ms}ms lands outside every segment"


# ── T29-E: overview ─────────────────────────────────────────────────────────


def test_overview_is_a_real_paragraph(provider: MockProvider, transcript: Transcript) -> None:
    """T29-E: 2 to 6 sentences, non-empty, no placeholder text."""
    overview = provider.generate_summary(transcript).overview
    assert overview
    sentence_count = len(re.findall(r"[.!?]", overview))
    assert 2 <= sentence_count <= 6
    assert "lorem" not in overview.lower()
    assert "todo" not in overview.lower()


# ── T29-F: LLM failure falls back to mock, no 500 ───────────────────────────


def test_invalid_key_falls_back_to_mock_without_a_500(
    app: FastAPI, client: TestClient, db: Session
) -> None:
    """T29-F: LLMProvider with a bad key → mock result, fallback provenance."""
    meeting = make_full_meeting(db)
    db.commit()

    dead_llm = LLMProvider(
        vendor="anthropic",
        api_key="not-a-real-key",
        transport=httpx2.MockTransport(
            lambda _request: httpx2.Response(401, json={"error": {"type": "authentication_error"}})
        ),
    )
    app.dependency_overrides[get_ai_provider] = lambda: FallbackProvider(dead_llm, MockProvider())

    response = client.post(f"/api/v1/meetings/{meeting.id}/summary/regenerate")

    assert response.status_code == 200, response.text
    assert response.json()["provider"] == FALLBACK_PROVIDER_LABEL
    # And the fallback provenance is persisted, not just echoed (T-29.9).
    assert client.get(f"/api/v1/meetings/{meeting.id}/summary").json()["provider"] == (
        FALLBACK_PROVIDER_LABEL
    )


# ── T29-G: response cache ───────────────────────────────────────────────────


class _SpyProvider(MockProvider):
    """Counts real generations so the cache test can assert on zero re-runs."""

    def __init__(self) -> None:
        self.calls = 0

    def generate_summary(self, transcript: Transcript) -> SummaryResult:
        self.calls += 1
        return super().generate_summary(transcript)


def test_identical_input_is_served_from_cache(transcript: Transcript) -> None:
    """T29-G: the second identical call never reaches the provider."""
    spy = _SpyProvider()
    cached = CachingProvider(spy, ResponseCache())

    first = cached.generate_summary(transcript)
    second = cached.generate_summary(transcript)

    assert spy.calls == 1
    assert first == second
    assert first is not second, "cache must hand out copies, not the shared instance"


def test_prompt_version_is_part_of_the_cache_identity() -> None:
    """Bumping a prompt version must change the fingerprint the cache keys on."""
    fingerprint = prompts_fingerprint()
    assert "summary:1" in fingerprint
    for name in ("summary", "action_items", "keywords", "outline", "qa"):
        assert load_prompt(name).version >= 1
        assert load_prompt(name).body  # non-empty after front-matter strip


# ── T29-H: empty transcript ─────────────────────────────────────────────────


def test_empty_transcript_yields_empty_but_valid_results(provider: MockProvider) -> None:
    """T29-H: no segments → valid empties everywhere, no exception."""
    empty = Transcript(segments=[])

    summary = provider.generate_summary(empty)
    assert summary.overview is None
    assert summary.notes == []
    assert provider.extract_keywords(empty) == []
    assert provider.generate_outline(empty) == []
    assert provider.extract_action_items(empty) == []
    assert provider.answer_question(empty, "Anything?").citations == []


# ── T29-I: very long transcripts ────────────────────────────────────────────


def _long_transcript(segment_count: int) -> Transcript:
    return Transcript(
        segments=[
            _turn(
                speaker=("Priya Sharma", "Marcus Lee")[index % 2],
                text=f"Point {index}: we reviewed the metrics and discussed the rollout plan.",
                start_ms=index * 4000,
                end_ms=index * 4000 + 3500,
            )
            for index in range(segment_count)
        ]
    )


def test_ten_thousand_segments_complete(provider: MockProvider) -> None:
    """T29-I: the mock handles a pathological transcript without choking."""
    huge = _long_transcript(10_000)
    assert provider.extract_keywords(huge)
    assert provider.generate_outline(huge)
    assert provider.generate_summary(huge).overview


def test_chunking_splits_with_overlap() -> None:
    """T29-I: the LLM chunking path — bounded chunks that share context."""
    chunks = chunk_transcript(_long_transcript(2_000))
    assert len(chunks) > 1
    for previous, current in pairwise(chunks):
        assert current.segments[0] in previous.segments, "chunks must overlap"
        # Chunks advance through the meeting even though their edges overlap.
        assert previous.segments[0].start_ms < current.segments[0].start_ms
