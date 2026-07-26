"""Transcript schemas (T-17.2 to T-17.4).

The shape is driven by one number: a 55-minute meeting is ~1,200 segments.
Shipping them inline makes first paint wait on all of them, and duplicating the
speaker on every segment would repeat the same label and colour a thousand
times. So segments are paginated by cursor, and speakers are sent BY REFERENCE.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import MatchRange


class SpeakerRef(BaseModel):
    """A speaker, sent once per page rather than once per segment."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    label: str
    #: Server-assigned, and authoritative — every surface reads it rather than
    #: re-deriving a colour from the name (ADR-013).
    color_index: int
    participant_id: int | None = None


class SegmentOut(BaseModel):
    """One transcript line."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    sequence: int
    start_ms: int
    end_ms: int
    #: The speaker's id only. `TranscriptPage.speakers` carries the details.
    speaker_id: int
    text: str
    is_edited: bool = False
    #: Present only on a `?q=` request, and only for segments that matched.
    matches: list[MatchRange] | None = None


class TranscriptPage(BaseModel):
    """A page of segments plus everything needed to render them.

    `speakers` is a per-page dictionary rather than a field on each segment:
    a page of 200 segments typically has three or four distinct speakers, so
    inlining them repeats the same label and colour ~50 times each.
    """

    segments: list[SegmentOut]
    speakers: list[SpeakerRef]
    #: `sequence` of the last segment on this page. Pass it back as `?cursor=`.
    #: `None` means this was the last page.
    next_cursor: int | None = None
    #: Total segments in the meeting, so the client can show progress without
    #: paging to the end first.
    total: int


class SegmentUpdate(BaseModel):
    """Edit a line's text, reassign its speaker, or both (T-17.5)."""

    text: str | None = Field(default=None, min_length=1)
    speaker_id: int | None = None


class SpeakerUpdate(BaseModel):
    """Rename a speaker across the whole meeting (T-17.6)."""

    label: str | None = Field(default=None, min_length=1, max_length=120)
    #: Links this voice to a known attendee. `None` leaves it as-is; there is
    #: deliberately no way to UNLINK here, which T-23 adds if it needs it.
    participant_id: int | None = None
