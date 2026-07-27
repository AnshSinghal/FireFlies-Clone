"""Data shapes the AI layer speaks (T-29.1).

The provider interface deals exclusively in these types — no ORM objects, no
API schemas. Services translate in both directions at the boundary. That keeps
`app/ai` importable and testable with zero database machinery, and it means a
provider cannot accidentally depend on persistence details like row ids.

Pydantic rather than dataclasses for one load-bearing reason: `LLMProvider`
derives its structured-output JSON schemas from these classes, so the type that
validates a model's response IS the type the rest of the app consumes. One
definition, no drift.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict


class SegmentInput(BaseModel):
    """One speaker turn, as the AI layer sees it.

    `speaker` is the display label, not an id — providers reason about "Priya
    said X", and the mock's assignee inference matches names against these.
    """

    model_config = ConfigDict(frozen=True)

    speaker: str
    text: str
    start_ms: int
    end_ms: int


class Transcript(BaseModel):
    """The input every provider method takes.

    `reference_date` anchors relative due-date expressions ("by Friday",
    "next week"). It is part of the INPUT on purpose: resolving them against
    `date.today()` would make extraction output depend on the wall clock,
    which breaks the byte-identical determinism T29-A asserts.
    """

    segments: list[SegmentInput]
    reference_date: date | None = None

    @property
    def text(self) -> str:
        return "\n".join(segment.text for segment in self.segments)

    @property
    def is_empty(self) -> bool:
        return not any(segment.text.strip() for segment in self.segments)


class KeywordResult(BaseModel):
    term: str
    #: Relative salience in [0, 1], 1.0 for the top term. Drives UI ordering.
    weight: float


class OutlineEntryResult(BaseModel):
    title: str
    #: Must land inside a real segment's [start_ms, end_ms] — the outline is
    #: clickable and seeks the player here (T-21.6). Asserted by T29-D.
    start_ms: int


class NoteGroupResult(BaseModel):
    chapter: str
    bullets: list[str]


class SummaryResult(BaseModel):
    """Overview + notes, with provenance riding along.

    Provenance lives ON the result rather than being inferred by the caller,
    because the honest answer can differ per call: a fallback after an LLM
    timeout must be labelled as such (T-29.7), and only the code that did the
    falling back knows it happened.
    """

    overview: str | None
    gist: str | None = None
    notes: list[NoteGroupResult]
    provider: str
    model: str | None = None


class ActionItemResult(BaseModel):
    text: str
    #: Display name of the inferred owner, or None — "Unassigned" is a real
    #: group in the UI, and a wrong guess is worse than no guess.
    assignee: str | None = None
    due_date: date | None = None


class AnswerCitation(BaseModel):
    speaker: str
    quote: str
    start_ms: int
    end_ms: int


class AnswerResult(BaseModel):
    text: str
    citations: list[AnswerCitation]


class ChatTurn(BaseModel):
    """One prior exchange in an AskFred conversation (T-37 consumes this)."""

    role: Literal["user", "assistant"]
    text: str
