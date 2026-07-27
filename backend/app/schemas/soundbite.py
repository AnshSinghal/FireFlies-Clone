"""Soundbite schemas (T-33).

Two list shapes, neither paginated: a meeting owns at most a handful of clips
and the proposals endpoint returns exactly three, so the 6-key page envelope
would be ceremony around lists that cannot page. The `items` wrapper is kept
so client unwrapping code stays uniform with every other list.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field

TITLE_MAX = 120


class SoundbiteCreate(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX)
    start_ms: int = Field(ge=0)
    end_ms: int = Field(gt=0)
    #: True when the clip started life as an accepted auto-proposal (T-33.8) —
    #: it keeps its `Auto` badge and sparkle after saving.
    auto_generated: bool = False


class SoundbiteOut(BaseModel):
    id: int
    meeting_id: int
    title: str
    start_ms: int
    end_ms: int
    auto_generated: bool
    created_at: datetime


class SoundbiteListOut(BaseModel):
    """Every clip of one meeting, ordered by `start_ms`."""

    items: list[SoundbiteOut]


class SoundbiteProposalOut(BaseModel):
    """An unsaved auto-clip candidate.

    No `id` on purpose — proposals are never persisted (T-33.8). Saving one is
    a plain `POST /soundbites` with `auto_generated=true`; dismissing one is a
    client-side matter.
    """

    title: str
    start_ms: int
    end_ms: int
    #: Relative keyword density in [0, 1], 1.0 for the strongest clip.
    score: float


class SoundbiteProposalListOut(BaseModel):
    """Exactly the provider's proposals — at most three, timeline-ordered."""

    items: list[SoundbiteProposalOut]
