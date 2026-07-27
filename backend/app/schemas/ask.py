"""AskFred — question answering over one meeting (T-37)."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, Field, StringConstraints

#: Turns sent back per request. Six is three exchanges — enough for "and who
#: owns that?" to resolve, small enough that the transcript stays the star.
MAX_HISTORY_TURNS = 6


class AskTurn(BaseModel):
    role: Literal["user", "assistant"]
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


class AskRequest(BaseModel):
    question: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    #: The client may send everything it has; the SERVER truncates to the last
    #: MAX_HISTORY_TURNS (T37-D) — trusting the client to trim is trusting the
    #: client with the token bill.
    history: list[AskTurn] = Field(default_factory=list, max_length=50)


class AskCitation(BaseModel):
    """Where an answer came from — the chip that makes the feature credible.

    No defaults: everything here is always known, and a default would make the
    field optional in the generated client (ADR-076's recurring defect).
    """

    segment_id: int
    start_ms: int
    speaker: str
    snippet: str


class AskResponse(BaseModel):
    answer: str
    citations: list[AskCitation]
    #: False when retrieval found nothing and the answer says so — the
    #: guardrail state, distinguishable from a real answer (T-37.8).
    grounded: bool
    #: `mock` renders the "Extractive mode" badge (T-37.11).
    provider: str
