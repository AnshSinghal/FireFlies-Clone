"""Highlight and bookmark schemas (T-32).

A highlight is a CHARACTER RANGE inside one segment's text. The API speaks in
offsets because that is the only representation that can be re-painted after
re-render and virtualisation, and merged with search marks into one
non-overlapping span list (T-32.4). The excerpt text in `HighlightOut` is a
convenience for the flyout — derived server-side from the offsets, never
stored, so it cannot drift from the transcript.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, model_validator

from app.models.enums import HighlightColor

NOTE_MAX = 500


class HighlightCreate(BaseModel):
    segment_id: int
    start_offset: int = Field(ge=0)
    #: Exclusive. Must land within the segment's CURRENT text — validated by
    #: the service, because only it can see the text.
    end_offset: int = Field(gt=0)
    color: HighlightColor = HighlightColor.AMBER
    note: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NOTE_MAX)]
        | None
    ) = None

    @model_validator(mode="after")
    def _range_is_forward(self) -> HighlightCreate:
        if self.end_offset <= self.start_offset:
            raise ValueError("end_offset must be greater than start_offset")
        return self


class HighlightUpdate(BaseModel):
    """Partial edit: colour and/or note.

    `note: null` MEANS "clear the note" — the router distinguishes an explicit
    null from an absent field via `model_fields_set`, the same PATCH contract
    the rest of the API uses.
    """

    color: HighlightColor | None = None
    note: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=NOTE_MAX)]
        | None
    ) = None


class HighlightOut(BaseModel):
    id: int
    segment_id: int
    #: The segment's anchor, so the flyout can seek without a join client-side.
    start_ms: int
    speaker: str
    start_offset: int
    end_offset: int
    color: HighlightColor
    note: str | None
    #: The highlighted characters, sliced from the segment at read time.
    text: str
    created_at: datetime


class BookmarkOut(BaseModel):
    id: int
    segment_id: int
    start_ms: int
    speaker: str
    #: Enough of the line to recognise the moment in the flyout.
    snippet: str
    created_at: datetime
