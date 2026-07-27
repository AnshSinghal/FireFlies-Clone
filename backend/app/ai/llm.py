"""LLMProvider — OpenAI or Anthropic behind one env var (T-29.3).

Raw HTTP via httpx2 rather than two vendor SDKs, deliberately: the whole point
of this class is one thin adapter over two wire dialects, the demo never
exercises it (`AI_PROVIDER=mock` is the default, T-29.11), and shipping both
`openai` and `anthropic` as dependencies to support a path that is off by
default is weight without benefit. The dialect differences live in exactly two
methods (`_request_body`, `_extract_text`).

Both vendors are asked for STRUCTURED OUTPUT against a JSON schema derived
from the pydantic types in `types.py` — so parsing is `model_validate`, not
regex-on-prose, and a malformed response is a `ProviderError`, never a 500.

Also here, because they are LLM-only concerns:
- T-29.5 — map-reduce chunking for long transcripts (`chunk_transcript`)
- T-29.8 — 30s timeout, 2 retries with exponential backoff, and a token
  pre-check that refuses absurd inputs before they cost money
"""

from __future__ import annotations

import json
import logging
import time
from typing import TYPE_CHECKING, Any

import httpx2
from pydantic import BaseModel, ValidationError

from app.ai.prompts import load_prompt
from app.ai.provider import AIProvider, ProviderError
from app.ai.types import (
    ActionItemResult,
    AnswerResult,
    KeywordResult,
    NoteGroupResult,
    OutlineEntryResult,
    SegmentInput,
    SummaryResult,
    Transcript,
)

if TYPE_CHECKING:
    from collections.abc import Sequence

    from app.ai.prompts import Prompt
    from app.ai.types import ChatTurn

logger = logging.getLogger(__name__)

_ANTHROPIC_URL = "https://api.anthropic.com/v1/messages"
_OPENAI_URL = "https://api.openai.com/v1/chat/completions"

#: Overridable via AI_MODEL; these are the sane defaults per vendor.
_DEFAULT_MODELS = {"anthropic": "claude-opus-5", "openai": "gpt-4o"}

# ── T-29.8 guardrails ───────────────────────────────────────────────────────

TIMEOUT_SECONDS = 30.0
MAX_RETRIES = 2
_BACKOFF_BASE_SECONDS = 0.5
#: 429/5xx/529 are transient; anything else 4xx is our bug or our key and no
#: number of retries will fix it.
_RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 529})

#: Refuse before spending: ~1.4M characters of transcript is not a meeting,
#: it is a mistake, and the pre-check costs nothing while the API call does.
MAX_INPUT_TOKENS = 350_000

# ── T-29.5 chunking ─────────────────────────────────────────────────────────

CHUNK_TOKEN_BUDGET = 3_000
CHUNK_TOKEN_OVERLAP = 200


def estimate_tokens(text: str) -> int:
    """Chars/4 — deliberately crude. It gates order-of-magnitude decisions
    (chunk? refuse?), where a real tokenizer would add a dependency to be
    ~10% more precise about a threshold that has slack built in anyway."""
    return len(text) // 4 + 1


def render_transcript(transcript: Transcript) -> str:
    """The one textual form every prompt receives: `[mm:ss] Speaker: text`."""
    lines = []
    for segment in transcript.segments:
        minutes, seconds = divmod(segment.start_ms // 1000, 60)
        lines.append(f"[{minutes:02d}:{seconds:02d}] {segment.speaker}: {segment.text}")
    return "\n".join(lines)


def chunk_transcript(
    transcript: Transcript,
    *,
    token_budget: int = CHUNK_TOKEN_BUDGET,
    token_overlap: int = CHUNK_TOKEN_OVERLAP,
) -> list[Transcript]:
    """Split on segment boundaries into ~token_budget chunks with overlap.

    Overlap matters: a commitment made in the last sentence of chunk N is the
    context for the first sentence of chunk N+1, and a hard cut would lose it.
    Segments are never split mid-way — a half-sentence is worse than a
    slightly oversized chunk.
    """
    chunks: list[Transcript] = []
    current: list[SegmentInput] = []
    current_tokens = 0

    for segment in transcript.segments:
        segment_tokens = estimate_tokens(segment.text)
        if current and current_tokens + segment_tokens > token_budget:
            chunks.append(
                Transcript(segments=current, reference_date=transcript.reference_date)
            )
            # Seed the next chunk with the tail of this one, up to the overlap.
            tail: list[SegmentInput] = []
            tail_tokens = 0
            for prior in reversed(current):
                prior_tokens = estimate_tokens(prior.text)
                if tail_tokens + prior_tokens > token_overlap:
                    break
                tail.insert(0, prior)
                tail_tokens += prior_tokens
            current = tail
            current_tokens = tail_tokens
        current.append(segment)
        current_tokens += segment_tokens

    if current:
        chunks.append(Transcript(segments=current, reference_date=transcript.reference_date))
    return chunks


# ── Structured-output payload shapes ────────────────────────────────────────
# List-returning methods get an object wrapper because structured output wants
# an object at the schema root; SummaryResult is not reused directly because
# `provider`/`model` are OUR provenance fields, not the model's to fill.


class _SummaryBody(BaseModel):
    overview: str | None
    gist: str | None
    notes: list[NoteGroupResult]


class _ActionItemsBody(BaseModel):
    items: list[ActionItemResult]


class _KeywordsBody(BaseModel):
    items: list[KeywordResult]


class _OutlineBody(BaseModel):
    items: list[OutlineEntryResult]


def _strict_schema(model_cls: type[BaseModel]) -> dict[str, Any]:
    """Pydantic's schema, tightened for structured output: every object node
    gets `additionalProperties: false`, which both vendors require."""

    def tighten(node: Any) -> None:
        if isinstance(node, dict):
            if node.get("type") == "object":
                node["additionalProperties"] = False
            for value in node.values():
                tighten(value)
        elif isinstance(node, list):
            for value in node:
                tighten(value)

    schema = model_cls.model_json_schema()
    tighten(schema)
    return schema


class LLMProvider(AIProvider):
    """One adapter, two vendors. Which one is an `__init__` argument, so the
    factory maps `AI_PROVIDER` straight onto it (T-29.6)."""

    def __init__(
        self,
        vendor: str,
        api_key: str,
        model: str | None = None,
        transport: httpx2.BaseTransport | None = None,
    ) -> None:
        if vendor not in _DEFAULT_MODELS:
            raise ValueError(f"Unknown LLM vendor {vendor!r}")
        self.name = vendor
        self.model = model or _DEFAULT_MODELS[vendor]
        self._api_key = api_key
        #: Injectable transport is what makes T29-F testable without a network:
        #: tests pass httpx2.MockTransport and the full retry/fallback path runs.
        self._client = httpx2.Client(timeout=httpx2.Timeout(TIMEOUT_SECONDS), transport=transport)

    # ── Interface methods ───────────────────────────────────────────────

    def generate_summary(self, transcript: Transcript) -> SummaryResult:
        prompt = load_prompt("summary")
        chunks = self._chunks_or_refuse(transcript)

        if len(chunks) == 1:
            body = self._complete(prompt, render_transcript(chunks[0]), _SummaryBody)
        else:
            # Map-reduce (T-29.5): summarise each chunk, then synthesise the
            # chunk summaries with the same prompt. Two passes, bounded cost.
            partials = [
                self._complete(prompt, render_transcript(chunk), _SummaryBody)
                for chunk in chunks
            ]
            synthesis_input = "\n\n".join(
                f"Part {i + 1} summary:\n{partial.overview or ''}"
                for i, partial in enumerate(partials)
            )
            body = self._complete(prompt, synthesis_input, _SummaryBody)
            # Chunk notes are grounded in real transcript text; the synthesis
            # pass only saw summaries, so keep the mapped notes instead.
            body.notes = [group for partial in partials for group in partial.notes]

        return SummaryResult(
            overview=body.overview,
            gist=body.gist,
            notes=body.notes,
            provider=self.name,
            model=self.model,
        )

    def extract_action_items(self, transcript: Transcript) -> list[ActionItemResult]:
        prompt = load_prompt("action_items")
        items: list[ActionItemResult] = []
        seen: set[str] = set()
        for chunk in self._chunks_or_refuse(transcript):
            text = render_transcript(chunk)
            if chunk.reference_date is not None:
                text = f"Meeting date: {chunk.reference_date.isoformat()}\n\n{text}"
            for item in self._complete(prompt, text, _ActionItemsBody).items:
                key = item.text.strip().lower()
                if key not in seen:
                    seen.add(key)
                    items.append(item)
        return items

    def extract_keywords(self, transcript: Transcript) -> list[KeywordResult]:
        prompt = load_prompt("keywords")
        merged: dict[str, float] = {}
        for chunk in self._chunks_or_refuse(transcript):
            for keyword in self._complete(prompt, render_transcript(chunk), _KeywordsBody).items:
                term = keyword.term.strip().lower()
                merged[term] = max(merged.get(term, 0.0), keyword.weight)
        top = sorted(merged.items(), key=lambda kv: (-kv[1], kv[0]))[:6]
        if not top:
            return []
        peak = top[0][1] or 1.0
        return [KeywordResult(term=term, weight=round(weight / peak, 4)) for term, weight in top]

    def generate_outline(self, transcript: Transcript) -> list[OutlineEntryResult]:
        prompt = load_prompt("outline")
        entries: list[OutlineEntryResult] = []
        for chunk in self._chunks_or_refuse(transcript):
            for entry in self._complete(prompt, render_transcript(chunk), _OutlineBody).items:
                # Chunks are chronological, so enforcing strict increase across
                # the concatenation also drops overlap-region duplicates.
                if entries and entry.start_ms <= entries[-1].start_ms:
                    continue
                entries.append(entry)
        return entries

    def answer_question(
        self,
        transcript: Transcript,
        question: str,
        history: Sequence[ChatTurn] = (),
    ) -> AnswerResult:
        prompt = load_prompt("qa")
        chunks = self._chunks_or_refuse(transcript)
        # Cheap client-side retrieval for long transcripts: send the chunk
        # sharing the most words with the question, not the whole meeting.
        chunk = max(
            chunks,
            key=lambda c: len(set(question.lower().split()) & set(c.text.lower().split())),
        )
        text = render_transcript(chunk)
        if history:
            prior = "\n".join(f"{turn.role}: {turn.text}" for turn in history)
            text = f"Prior conversation:\n{prior}\n\nTranscript:\n{text}"
        text = f"{text}\n\nQuestion: {question}"
        return self._complete(prompt, text, AnswerResult)

    # ── Plumbing ────────────────────────────────────────────────────────

    def _chunks_or_refuse(self, transcript: Transcript) -> list[Transcript]:
        total = estimate_tokens(transcript.text)
        if total > MAX_INPUT_TOKENS:
            raise ProviderError(
                f"Transcript is ~{total} tokens, over the {MAX_INPUT_TOKENS} cost guard"
            )
        return chunk_transcript(transcript)

    def _complete[TBody: BaseModel](
        self, prompt: Prompt, user_text: str, body_cls: type[TBody]
    ) -> TBody:
        """One structured-output completion: request → retry → validate."""
        payload = self._request_body(prompt, user_text, _strict_schema(body_cls))
        raw = self._post_with_retries(payload)
        try:
            return body_cls.model_validate(json.loads(self._extract_text(raw)))
        except (json.JSONDecodeError, ValidationError) as error:
            raise ProviderError("Model response did not match the schema") from error

    def _request_body(
        self, prompt: Prompt, user_text: str, schema: dict[str, Any]
    ) -> dict[str, Any]:
        if self.name == "anthropic":
            return {
                "model": self.model,
                "max_tokens": 4096,
                "system": prompt.body,
                "messages": [{"role": "user", "content": user_text}],
                "output_config": {"format": {"type": "json_schema", "schema": schema}},
            }
        return {
            "model": self.model,
            "messages": [
                {"role": "system", "content": prompt.body},
                {"role": "user", "content": user_text},
            ],
            "response_format": {
                "type": "json_schema",
                "json_schema": {"name": "result", "strict": True, "schema": schema},
            },
        }

    def _post_with_retries(self, payload: dict[str, Any]) -> dict[str, Any]:
        url = _ANTHROPIC_URL if self.name == "anthropic" else _OPENAI_URL
        headers = (
            {"x-api-key": self._api_key, "anthropic-version": "2023-06-01"}
            if self.name == "anthropic"
            else {"Authorization": f"Bearer {self._api_key}"}
        )

        last_error: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            if attempt:
                # 0.5s, then 1s — bounded, so a dead vendor delays a request
                # by at most ~1.5s before the mock fallback takes over.
                time.sleep(_BACKOFF_BASE_SECONDS * 2 ** (attempt - 1))
            try:
                response = self._client.post(url, json=payload, headers=headers)
            except httpx2.HTTPError as error:
                last_error = error
                logger.warning("%s request failed (attempt %d): %s", self.name, attempt, error)
                continue

            if response.status_code == 200:
                data: dict[str, Any] = response.json()
                return data
            if response.status_code in _RETRYABLE_STATUS:
                last_error = ProviderError(f"{self.name} returned {response.status_code}")
                logger.warning(
                    "%s returned %d (attempt %d)", self.name, response.status_code, attempt
                )
                continue
            # 401, 403, 400... — retrying an invalid key just delays the fallback.
            raise ProviderError(f"{self.name} rejected the request: {response.status_code}")

        raise ProviderError(f"{self.name} unreachable after {MAX_RETRIES + 1} attempts") from (
            last_error
        )

    def _extract_text(self, data: dict[str, Any]) -> str:
        try:
            if self.name == "anthropic":
                if data.get("stop_reason") == "refusal":
                    raise ProviderError("anthropic declined the request")
                return next(
                    str(block["text"])
                    for block in data["content"]
                    if block.get("type") == "text"
                )
            content = data["choices"][0]["message"]["content"]
            if content is None:
                raise ProviderError("openai returned no content")
            return str(content)
        except (KeyError, IndexError, StopIteration) as error:
            raise ProviderError(f"Unexpected {self.name} response shape") from error
