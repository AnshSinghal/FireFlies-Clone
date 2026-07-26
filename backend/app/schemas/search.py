"""Global search schemas.

Snippets carry MATCH RANGES, not markup. The server never sends HTML for the
client to inject — the client wraps the ranges itself with the Highlighter
primitive, so a transcript containing `<script>` is rendered as text rather than
executed (T-08.10, T-35.2).
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class MatchRange(BaseModel):
    """Character offsets of a matched term within a snippet."""

    start: int
    end: int


class MeetingHit(BaseModel):
    """A meeting whose title or overview matched."""

    id: int
    title: str
    started_at: str
    duration_seconds: int
    matches: list[MatchRange] = Field(default_factory=list)


class TranscriptHit(BaseModel):
    """A transcript line that matched, with enough context to be worth showing."""

    segment_id: int
    meeting_id: int
    meeting_title: str
    speaker: str
    #: Milliseconds, so the client can deep-link to `?t=` directly.
    start_ms: int
    snippet: str
    matches: list[MatchRange] = Field(default_factory=list)


class SearchResults(BaseModel):
    """Grouped, because the two kinds of hit mean different things.

    A title match is "this meeting is about X"; a transcript match is "X was
    said at 18:42". Flattening them loses that distinction and makes the
    dropdown harder to scan.
    """

    query: str
    meetings: list[MeetingHit] = Field(default_factory=list)
    transcripts: list[TranscriptHit] = Field(default_factory=list)
    total: int = Field(description="Combined count across both groups.")
