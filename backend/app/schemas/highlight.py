"""Highlight and bookmark schemas (T-32.1).

Two resources that share a foreign key and nothing else. A highlight is a
CHARACTER RANGE with a colour; a bookmark is a whole starred moment. They are
kept apart here for the same reason they are kept apart in the schema: merging
them would mean a nullable offset pair and a discriminator on every row.

Both output shapes carry a little denormalised context — the segment's
timestamp, its speaker, and the text — because the flyouts (T-32.7, T-32.8) list
highlights across the WHOLE meeting while the client only ever holds one page of
transcript. Without it, opening the bookmarks panel would mean fetching every
page of a 1,200-segment transcript to render six rows.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.models.enums import HighlightColor

#: A note is a margin annotation, not a document. Long enough for a sentence or
#: three, short enough that the popover never becomes a scrolling text editor.
NoteText = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1_000)]


class HighlightCreate(BaseModel):
    """A new highlight, addressed by segment and character offsets.

    The client sends offsets rather than the selected string: the server would
    otherwise have to guess WHICH occurrence of "we should ship it" was meant,
    and would guess wrong on the second one.
    """

    segment_id: int
    start_offset: int = Field(ge=0)
    end_offset: int = Field(gt=0)
    color: HighlightColor = HighlightColor.AMBER
    note: NoteText | None = None

    @model_validator(mode="after")
    def _non_empty(self) -> HighlightCreate:
        # Mirrors the CHECK constraint rather than relying on it: a database
        # error surfaces as a 500 with a driver message in it, and this is a
        # 422 naming the field.
        if self.end_offset <= self.start_offset:
            msg = "end_offset must be greater than start_offset"
            raise ValueError(msg)
        return self


class HighlightUpdate(BaseModel):
    """Recolour or annotate an existing highlight (T-32.5).

    The RANGE is deliberately immutable. Re-selecting is one gesture; dragging a
    stored offset pair around is a second, subtly different editing model that
    the popover has no affordance for.

    `note` is nullable on purpose — sending `null` clears it, which is how the
    popover's "remove note" works without a second endpoint.
    """

    color: HighlightColor | None = None
    note: NoteText | None = None


class HighlightOut(BaseModel):
    """A highlight plus enough context to render it in a list."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: int
    segment_id: int
    start_offset: int
    end_offset: int
    color: HighlightColor
    note: str | None

    #: The highlighted substring, resolved server-side. The flyout shows the
    #: quote; re-deriving it client-side would need the segment, which is the
    #: whole problem this field exists to avoid.
    text: str
    #: Where the containing segment starts, for "click to seek".
    start_ms: int
    speaker_id: int
    speaker_label: str

    created_at: datetime


class BookmarkOut(BaseModel):
    """A starred segment, with the snippet the flyout renders."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    meeting_id: int
    segment_id: int
    start_ms: int
    speaker_id: int
    speaker_label: str
    #: Truncated server-side: the flyout clamps to two lines anyway, and sending
    #: a 900-character segment to render 90 of them is wasted payload.
    text: str
    created_at: datetime


class BookmarkCreate(BaseModel):
    segment_id: int


class BookmarkToggleOut(BaseModel):
    """The result of toggling a star.

    Returns the resulting STATE rather than 201/204, so an optimistic client
    that fired two toggles in quick succession can reconcile against the truth
    instead of inferring it from a status code.
    """

    segment_id: int
    bookmarked: bool
    bookmark: BookmarkOut | None
