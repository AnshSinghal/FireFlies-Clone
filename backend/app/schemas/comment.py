"""Comment schemas (T-31).

Threads are ONE level deep by contract: `CommentOut.replies` holds plain
reply objects whose own `replies` list the API never populates. The service
enforces the depth on write, so the shape here can stay simple.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.user import UserRef

BODY_MAX = 2_000


class CommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=BODY_MAX)
    #: Anchors the comment to a transcript line; null is a meeting-level note.
    segment_id: int | None = None
    #: Reply target. Must be a TOP-LEVEL comment of the same meeting — the
    #: service rejects replies-to-replies (one nesting level, T-31.1).
    parent_id: int | None = None
    #: Participant ids this comment @mentions. Stored as rows, not styled
    #: text (T-31.4); every id must belong to this meeting.
    mentions: list[int] = Field(default_factory=list, max_length=50)


class CommentUpdate(BaseModel):
    """Partial update. Every field optional; unset fields are left alone."""

    body: str | None = Field(default=None, min_length=1, max_length=BODY_MAX)
    #: Resolve/unresolve the thread (parents only, T-31.9).
    is_resolved: bool | None = None


class MentionRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    participant_id: int
    display_name: str


class CommentOut(BaseModel):
    id: int
    segment_id: int | None
    parent_id: int | None
    #: Denormalised from the segment at write time, so the flyout can order a
    #: mixed list of anchored and unanchored comments without a join.
    start_ms: int | None
    author: UserRef
    #: Empty string for a tombstone — the body is gone, the slot is not.
    body: str
    mentions: list[MentionRef]
    is_resolved: bool
    #: True when a deleted parent is kept as a "Comment deleted" tombstone so
    #: its replies don't collapse (T-31.7).
    is_deleted: bool
    #: True once the body has been changed — drives the `edited` marker.
    is_edited: bool
    created_at: datetime
    replies: list[CommentOut]
