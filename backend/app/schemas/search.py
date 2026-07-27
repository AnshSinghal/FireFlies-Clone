"""Global search schemas.

Snippets carry MATCH RANGES, not markup. The server never sends HTML for the
client to inject — the client wraps the ranges itself with the Highlighter
primitive, so a transcript containing `<script>` is rendered as text rather than
executed (T-08.10, T-35.2).
"""

from __future__ import annotations

from pydantic import BaseModel, Field

from app.schemas.common import MatchRange


class MeetingHit(BaseModel):
    """A meeting whose title or overview matched."""

    id: int
    title: str
    started_at: str
    duration_seconds: int
    matches: list[MatchRange]


class TranscriptHit(BaseModel):
    """A transcript line that matched, with enough context to be worth showing."""

    segment_id: int
    meeting_id: int
    meeting_title: str
    speaker: str
    #: Milliseconds, so the client can deep-link to `?t=` directly.
    start_ms: int
    snippet: str
    matches: list[MatchRange]


class SearchResults(BaseModel):
    """Grouped, because the two kinds of hit mean different things.

    A title match is "this meeting is about X"; a transcript match is "X was
    said at 18:42". Flattening them loses that distinction and makes the
    dropdown harder to scan.
    """

    query: str
    # No defaults anywhere in this module: a `default_factory` makes the field
    # non-required in OpenAPI, so the generated client types it `T[] | undefined`
    # and every call site has to handle an absence the API never produces. Same
    # defect as `action_item_counts` in T-05.
    meetings: list[MeetingHit]
    transcripts: list[TranscriptHit]
    #: True when another page of transcript hits exists past `offset + limit`.
    #: Meetings are never paginated — title matches are few by nature.
    has_more: bool
    offset: int
    total: int = Field(description="Combined count across both groups.")
