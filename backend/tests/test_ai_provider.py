"""T-29 provider tests — cases T29-A through T29-I.

Most of these run against `MockProvider` with a hand-built transcript and no
database: the AI layer speaks plain types (T-29.1), so nothing here needs an
app until the route-level fallback test (T29-F).
"""

from __future__ import annotations

import json
import re
from datetime import date
from itertools import pairwise
from typing import TYPE_CHECKING

import httpx2
import pytest

import app.ai.llm as llm_module
from app.ai import (
    FALLBACK_PROVIDER_LABEL,
    ChatTurn,
    LLMProvider,
    MockProvider,
    ProviderError,
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
    from collections.abc import Callable, Iterator

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


# ── LLMProvider plumbing (T-43.6) ───────────────────────────────────────────
# Everything below runs against httpx2.MockTransport — the tests exercise the
# retry, chunking, merging and failure paths without a network in sight.


def _anthropic_json(payload: dict[str, object]) -> httpx2.Response:
    body = {"stop_reason": "end_turn", "content": [{"type": "text", "text": json.dumps(payload)}]}
    return httpx2.Response(200, json=body)


def _llm(
    handler: Callable[[httpx2.Request], httpx2.Response], vendor: str = "anthropic"
) -> LLMProvider:
    return LLMProvider(vendor, api_key="k", transport=httpx2.MockTransport(handler))


class TestLLMPlumbing:
    def test_map_reduce_summarises_chunks_then_synthesises(self) -> None:
        """A multi-chunk transcript costs one call per chunk plus a synthesis
        pass, and the notes come from the mapped (transcript-grounded) halves."""
        calls: list[str] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            calls.append(json.loads(request.content)["messages"][0]["content"][:40])
            n = len(calls)
            return _anthropic_json(
                {
                    "overview": f"Part {n}.",
                    "gist": None,
                    "notes": [{"chapter": f"Chapter {n}", "bullets": [f"Point {n}."]}],
                }
            )

        chunks = chunk_transcript(_long_transcript(2_000))
        result = _llm(handler).generate_summary(_long_transcript(2_000))

        assert len(calls) == len(chunks) + 1
        # Synthesis sees the chunk summaries, not raw transcript.
        assert calls[-1].startswith("Part 1 summary:")
        # Notes are the mapped ones — the synthesis pass's notes are discarded.
        assert [group.chapter for group in result.notes] == [
            f"Chapter {n}" for n in range(1, len(chunks) + 1)
        ]

    def test_keywords_merge_across_chunks_and_renormalise(self) -> None:
        responses: Iterator[dict[str, object]] = iter(
            [
                {"items": [{"term": "pricing", "weight": 0.4}, {"term": "beta", "weight": 0.2}]},
                {"items": [{"term": "Pricing", "weight": 0.8}, {"term": "launch", "weight": 0.6}]},
            ]
        )
        provider = _llm(lambda _request: _anthropic_json(next(responses)))
        # Two chunks exactly: budget sized so the 2000-segment fixture splits.
        transcript = _long_transcript(300)
        assert len(chunk_transcript(transcript)) == 2

        keywords = provider.extract_keywords(transcript)

        by_term = {keyword.term: keyword.weight for keyword in keywords}
        # Case-folded merge takes the max weight, then renormalises to 1.0.
        assert by_term["pricing"] == 1.0
        assert by_term["launch"] == 0.75
        assert by_term["beta"] == 0.25

    def test_outline_concatenation_enforces_strict_increase(self) -> None:
        responses: Iterator[dict[str, object]] = iter(
            [
                {"items": [{"title": "Alpha", "start_ms": 0}, {"title": "Beta", "start_ms": 9000}]},
                # The overlap region re-reports Beta at 9000 — it must be dropped.
                {
                    "items": [
                        {"title": "Beta again", "start_ms": 9000},
                        {"title": "Gamma", "start_ms": 20000},
                    ]
                },
            ]
        )
        provider = _llm(lambda _request: _anthropic_json(next(responses)))
        transcript = _long_transcript(300)

        outline = provider.generate_outline(transcript)

        assert [(entry.title, entry.start_ms) for entry in outline] == [
            ("Alpha", 0),
            ("Beta", 9000),
            ("Gamma", 20000),
        ]

    def test_action_items_dedupe_and_carry_the_meeting_date(self) -> None:
        seen_dates: list[bool] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            text = json.loads(request.content)["messages"][0]["content"]
            seen_dates.append(text.startswith("Meeting date: 2026-07-20"))
            return _anthropic_json(
                {"items": [{"text": "Draft the deck", "assignee": None, "due_date": None}]}
            )

        transcript = _long_transcript(300).model_copy(update={"reference_date": date(2026, 7, 20)})
        items = _llm(handler).extract_action_items(transcript)

        assert all(seen_dates), "every chunk prompt must carry the meeting date"
        assert len(items) == 1, "identical items from overlapping chunks dedupe"

    def test_answer_question_sends_history_and_picks_a_relevant_chunk(self) -> None:
        captured: list[str] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            captured.append(json.loads(request.content)["messages"][1]["content"])
            answer = json.dumps({"text": "It shipped.", "citations": []})
            return httpx2.Response(200, json={"choices": [{"message": {"content": answer}}]})

        answer = _llm(handler, vendor="openai").answer_question(
            _long_transcript(40),
            "Did point 7 ship?",
            history=[ChatTurn(role="user", text="context question")],
        )

        assert answer.text == "It shipped."
        assert "Prior conversation:" in captured[0]
        assert "Question: Did point 7 ship?" in captured[0]

    def test_retryable_status_retries_then_succeeds(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(llm_module, "_BACKOFF_BASE_SECONDS", 0)
        attempts: list[int] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            attempts.append(1)
            if len(attempts) < 3:
                return httpx2.Response(429, json={})
            return _anthropic_json({"overview": "Third time lucky.", "gist": None, "notes": []})

        result = _llm(handler).generate_summary(_long_transcript(3))

        assert len(attempts) == 3
        assert result.overview == "Third time lucky."

    def test_exhausted_retries_raise_provider_error(self, monkeypatch: pytest.MonkeyPatch) -> None:
        monkeypatch.setattr(llm_module, "_BACKOFF_BASE_SECONDS", 0)
        attempts: list[int] = []

        def handler(request: httpx2.Request) -> httpx2.Response:
            attempts.append(1)
            return httpx2.Response(503, json={})

        with pytest.raises(ProviderError):
            _llm(handler).generate_summary(_long_transcript(3))
        assert len(attempts) == llm_module.MAX_RETRIES + 1

    def test_a_refusal_is_a_provider_error_not_a_parse_attempt(self) -> None:
        def handler(_request: httpx2.Request) -> httpx2.Response:
            return httpx2.Response(200, json={"stop_reason": "refusal", "content": []})

        with pytest.raises(ProviderError):
            _llm(handler).generate_summary(_long_transcript(3))

    def test_schema_mismatch_is_a_provider_error(self) -> None:
        def handler(_request: httpx2.Request) -> httpx2.Response:
            return _anthropic_json({"totally": "wrong shape"})

        with pytest.raises(ProviderError):
            _llm(handler).generate_summary(_long_transcript(3))

    def test_the_token_pre_check_refuses_before_spending(self) -> None:
        def handler(request: httpx2.Request) -> httpx2.Response:
            raise AssertionError("the guard must refuse before any request is made")

        absurd = Transcript(
            segments=[SegmentInput(speaker="A", text="x" * 2_000_000, start_ms=0, end_ms=1000)]
        )
        with pytest.raises(ProviderError, match="cost guard"):
            _llm(handler).generate_summary(absurd)

    def test_an_unknown_vendor_is_rejected_at_construction(self) -> None:
        with pytest.raises(ValueError, match="vendor"):
            LLMProvider("gemini", api_key="k")
