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

    chapter: str | None = None
    bullets: list[str] = Field(default_factory=list)


class SummaryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    meeting_id: int
    overview: str | None = None
    keywords: list[str] = Field(default_factory=list)
    outline: list[OutlineEntry] = Field(default_factory=list)
    notes: list[NoteGroup] = Field(default_factory=list)

    provider: str = Field(description="Which provider produced this. Surfaced in the UI.")
    model: str | None = None
    generated_at: datetime | None = None
    is_stale: bool = Field(
        default=False,
        description=(
            "True when the transcript changed after generation — drives the "
            "Outdated badge in the UI."
        ),
    )
