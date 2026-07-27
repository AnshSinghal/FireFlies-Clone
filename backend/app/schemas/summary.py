"""Summary output schemas.

The five canonical UI sections are COMPOSED here from four sources — the scalar
overview on `summaries`, outline and note rows in `summary_sections`, the
`keywords` table and the `action_items` table (ADR-015). T-17.7 fills in the
sections; this is the envelope they arrive in.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class OutlineEntry(BaseModel):
    """One chapter of the Meeting Outline."""

    model_config = ConfigDict(from_attributes=True)

    title: str
    #: Milliseconds. What makes the timestamp clickable — the client seeks the
    #: player here and scrolls the transcript to match (T-21.6).
    start_ms: int
    sequence: int = 0


class NoteGroup(BaseModel):
    """Bullet notes, grouped under their outline chapter."""

    # No defaults, for the reason spelled out on `SummaryOut` below: a default
    # makes the field optional in OpenAPI, and the generated client then types
    # `bullets` as possibly-undefined for an absence the API never produces.
    # `chapter` is nullable but always PRESENT, which is a different claim.
    chapter: str | None
    bullets: list[str]


class SummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    meeting_id: int
    overview: str | None = None
    # NO DEFAULTS on the lists. Any default — `default_factory=list` or
    # `default=[]` — makes the field non-required in OpenAPI, so the generated
    # client types them `T[] | undefined` and every consumer null-checks an
    # absence the API never produces. Same defect as `action_item_counts` in
    # T-05 and `failed` in T-14; the service always sends all three.
    keywords: list[str]
    outline: list[OutlineEntry]
    notes: list[NoteGroup]

    provider: str = Field(description="Which provider produced this. Surfaced in the UI.")
    model: str | None = None
    generated_at: datetime | None = None
    is_stale: bool = Field(
        description=(
            "True when the transcript changed after generation — drives the "
            "Outdated badge in the UI."
        ),
    )
