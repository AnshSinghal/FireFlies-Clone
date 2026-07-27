"""The provider interface (T-29.1).

One abstract class, two implementations (`MockProvider`, `LLMProvider`), one
factory (`get_ai_provider`). The interface is what turns "mocked summaries"
into an architecture: swapping in a real model is a one-variable change
(T-29.11), and tests inject a stub with one line (T-29.6).

Methods are synchronous. FastAPI runs sync endpoints in a threadpool, the mock
is CPU-bound anyway, and an async interface would force async all the way up
through `MeetingService` for no measurable win at this scale.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from collections.abc import Sequence

    from app.ai.types import (
        ActionItemResult,
        AnswerResult,
        ChatTurn,
        KeywordResult,
        OutlineEntryResult,
        SummaryResult,
        Transcript,
    )


class ProviderError(RuntimeError):
    """Any provider failure the caller can act on.

    Timeouts, bad keys, rate limits, refusals and unparseable responses all
    collapse into this one type ON PURPOSE: the only decision a caller makes is
    "fall back to the mock or not" (T-29.7), and that decision is the same for
    every failure mode. The original cause rides along via `__cause__`.
    """


class AIProvider(ABC):
    """What every provider must be able to do.

    `name` and `model` are provenance, persisted on `summaries` and surfaced
    in the UI's attribution line (T-29.9).
    """

    name: str
    model: str | None = None

    @abstractmethod
    def generate_summary(self, transcript: Transcript) -> SummaryResult:
        """Overview paragraph, one-line gist, and grouped bullet notes."""

    @abstractmethod
    def extract_action_items(self, transcript: Transcript) -> list[ActionItemResult]:
        """Commitments made during the meeting, with owner and due date."""

    @abstractmethod
    def extract_keywords(self, transcript: Transcript) -> list[KeywordResult]:
        """The salient terms, most salient first."""

    def propose_tags(self, transcript: Transcript, *, limit: int = 6) -> list[str]:
        """Candidate tag names for a meeting, most salient first (T-36.4).

        Deliberately CONCRETE where everything else is abstract: a tag
        proposal is a keyword wearing a different hat, so the default derives
        it from `extract_keywords` — which means every implementation AND
        every wrapper (fallback, caching) gets a correct, composable version
        for free. The mock's determinism carries over unchanged: same
        transcript in, same proposals out, which is what lets the Suggested
        chips survive a refresh without jumping around.

        The service downstream filters out names the meeting already carries
        and caps the list — the provider does not know the tag table exists.
        """
        return [keyword.term for keyword in self.extract_keywords(transcript)[:limit]]

    @abstractmethod
    def generate_outline(self, transcript: Transcript) -> list[OutlineEntryResult]:
        """Chapters with timestamps that land on real segments."""

    @abstractmethod
    def answer_question(
        self,
        transcript: Transcript,
        question: str,
        history: Sequence[ChatTurn] = (),
    ) -> AnswerResult:
        """Grounded answer with segment citations (AskFred, T-37)."""
