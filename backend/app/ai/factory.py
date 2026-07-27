"""Provider assembly and DI (T-29.6), graceful degradation (T-29.7).

`get_ai_provider()` is a FastAPI dependency, so tests inject a stub with one
line (`app.dependency_overrides[get_ai_provider] = lambda: stub`) and the
route code never knows which implementation it got.

The assembled pipeline for a paid provider is

    CachingProvider(FallbackProvider(LLMProvider(...), MockProvider()))

read inside-out: the LLM is tried first; any `ProviderError` — timeout, rate
limit, bad key — degrades to the mock with provenance marked
`mock (llm fallback)` (T-29.7), and whatever came back is cached so identical
input never re-bills (T-29.10). The demo must never hard-fail because of an
API key.
"""

from __future__ import annotations

import logging
from functools import cache
from typing import TYPE_CHECKING, Annotated, cast

from fastapi import Depends

from app.ai.cache import GenerationCounter, ResponseCache, response_key
from app.ai.llm import LLMProvider
from app.ai.mock import MockProvider
from app.ai.prompts import prompts_fingerprint
from app.ai.provider import AIProvider, ProviderError
from app.core.config import Settings, get_settings

if TYPE_CHECKING:
    from collections.abc import Callable, Sequence

    from app.ai.types import (
        ActionItemResult,
        AnswerResult,
        ChatTurn,
        KeywordResult,
        OutlineEntryResult,
        SoundbiteProposalResult,
        SummaryResult,
        Transcript,
    )

logger = logging.getLogger(__name__)

#: What the UI shows when the LLM failed and the mock stepped in. A constant
#: because T29-F asserts the exact string and the frontend matches on it.
FALLBACK_PROVIDER_LABEL = "mock (llm fallback)"


class FallbackProvider(AIProvider):
    """Try the paid provider; on any ProviderError, degrade to the free one.

    `name` mirrors the PRIMARY on purpose — this object represents the
    configured paid pipeline (the cost guard keys off that); whether a given
    call actually fell back is recorded per-result, where the honest answer
    lives.
    """

    def __init__(self, primary: AIProvider, backup: AIProvider) -> None:
        self.primary = primary
        self.backup = backup
        self.name = primary.name
        self.model = primary.model

    def _run[T](
        self,
        primary_call: Callable[[], T],
        backup_call: Callable[[], T],
    ) -> tuple[T, bool]:
        try:
            return primary_call(), False
        except ProviderError as error:
            # Log-and-degrade is the contract: the demo must answer even with
            # a dead key. The cause is in the log, not in the user's face.
            logger.warning(
                "%s failed, falling back to %s: %s", self.primary.name, self.backup.name, error
            )
            return backup_call(), True

    def generate_summary(self, transcript: Transcript) -> SummaryResult:
        result, fell_back = self._run(
            lambda: self.primary.generate_summary(transcript),
            lambda: self.backup.generate_summary(transcript),
        )
        if fell_back:
            result = result.model_copy(update={"provider": FALLBACK_PROVIDER_LABEL, "model": None})
        return result

    def extract_action_items(self, transcript: Transcript) -> list[ActionItemResult]:
        return self._run(
            lambda: self.primary.extract_action_items(transcript),
            lambda: self.backup.extract_action_items(transcript),
        )[0]

    def extract_keywords(self, transcript: Transcript) -> list[KeywordResult]:
        return self._run(
            lambda: self.primary.extract_keywords(transcript),
            lambda: self.backup.extract_keywords(transcript),
        )[0]

    def generate_outline(self, transcript: Transcript) -> list[OutlineEntryResult]:
        return self._run(
            lambda: self.primary.generate_outline(transcript),
            lambda: self.backup.generate_outline(transcript),
        )[0]

    def answer_question(
        self,
        transcript: Transcript,
        question: str,
        history: Sequence[ChatTurn] = (),
    ) -> AnswerResult:
        return self._run(
            lambda: self.primary.answer_question(transcript, question, history),
            lambda: self.backup.answer_question(transcript, question, history),
        )[0]

    def propose_soundbites(self, transcript: Transcript) -> list[SoundbiteProposalResult]:
        # LLMProvider raises unconditionally here (see its docstring), so in
        # practice this is always the backup heuristic — via the same
        # degradation path as every other method, rather than a special case.
        return self._run(
            lambda: self.primary.propose_soundbites(transcript),
            lambda: self.backup.propose_soundbites(transcript),
        )[0]


class CachingProvider(AIProvider):
    """Memoises any provider (T-29.10).

    The key is the full segment JSON, not just the joined text — two
    transcripts with identical words but different timestamps or speakers
    legitimately produce different outlines, and a text-only key would serve
    one meeting's chapters to another. Prompt versions are in the key too, so
    editing a prompt invalidates exactly the responses it produced.
    """

    def __init__(self, inner: AIProvider, store: ResponseCache) -> None:
        self._inner = inner
        self._store = store
        self.name = inner.name
        self.model = inner.model

    def _through[T](
        self, method: str, transcript: Transcript, compute: Callable[[], T], *extra: str
    ) -> T:
        key = response_key(
            self.name,
            self.model or "",
            method,
            prompts_fingerprint(),
            transcript.model_dump_json(),
            *extra,
        )
        hit = self._store.get(key)
        if hit is not None:
            return cast("T", hit)
        value = compute()
        self._store.put(key, value)
        return value

    def generate_summary(self, transcript: Transcript) -> SummaryResult:
        return self._through(
            "summary", transcript, lambda: self._inner.generate_summary(transcript)
        )

    def extract_action_items(self, transcript: Transcript) -> list[ActionItemResult]:
        return self._through(
            "action_items", transcript, lambda: self._inner.extract_action_items(transcript)
        )

    def extract_keywords(self, transcript: Transcript) -> list[KeywordResult]:
        return self._through(
            "keywords", transcript, lambda: self._inner.extract_keywords(transcript)
        )

    def generate_outline(self, transcript: Transcript) -> list[OutlineEntryResult]:
        return self._through(
            "outline", transcript, lambda: self._inner.generate_outline(transcript)
        )

    def answer_question(
        self,
        transcript: Transcript,
        question: str,
        history: Sequence[ChatTurn] = (),
    ) -> AnswerResult:
        history_key = "|".join(f"{turn.role}:{turn.text}" for turn in history)
        return self._through(
            "qa",
            transcript,
            lambda: self._inner.answer_question(transcript, question, history),
            question,
            history_key,
        )

    def propose_soundbites(self, transcript: Transcript) -> list[SoundbiteProposalResult]:
        return self._through(
            "soundbites", transcript, lambda: self._inner.propose_soundbites(transcript)
        )


# ── Assembly ────────────────────────────────────────────────────────────────

#: Module singletons: the cache must outlive requests or it never hits, and
#: the counter must outlive requests or it never limits.
response_cache = ResponseCache()
generation_counter = GenerationCounter()


def _assemble(vendor: str, api_key: str, model: str) -> AIProvider:
    if vendor == "mock":
        return CachingProvider(MockProvider(), response_cache)
    llm = LLMProvider(vendor=vendor, api_key=api_key, model=model or None)
    return CachingProvider(FallbackProvider(llm, MockProvider()), response_cache)


def build_provider(settings: Settings) -> AIProvider:
    """Pure assembly — separated from the DI wrapper so tests can call it
    with hand-built Settings and no FastAPI machinery."""
    return _assemble(settings.ai_provider, settings.ai_api_key, settings.ai_model)


@cache
def _provider_for(vendor: str, api_key: str, model: str) -> AIProvider:
    """One provider instance per distinct config — an LLMProvider owns an HTTP
    connection pool, and rebuilding that per request would churn sockets."""
    return _assemble(vendor, api_key, model)


def get_ai_provider(settings: Annotated[Settings, Depends(get_settings)]) -> AIProvider:
    """The dependency the routers declare (T-29.6)."""
    return _provider_for(settings.ai_provider, settings.ai_api_key, settings.ai_model)


AIProviderDep = Annotated[AIProvider, Depends(get_ai_provider)]
