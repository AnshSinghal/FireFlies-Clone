"""Meeting schemas, split by direction (T-04.4).

Four shapes, and the split is the point:

- `MeetingCreate` / `MeetingUpdate` are INPUT. They accept only what a client is
  allowed to set — no `id`, no `duration_seconds` (derived), no timestamps.
- `MeetingListItem` is a LIGHT output shape for the Notebook.
- `MeetingDetail` is the HEAVY one for the Notepad.

Returning `MeetingDetail` from the list endpoint would ship ~1,200 transcript
segments per row, twenty rows per page. That is the deduction PLAN.md T-04.4
warns about, and test T04-D asserts it has not happened.

`MeetingUpdate` also demonstrates the difference between "not sent" and "set to
null": every field defaults to `None` and the router serialises with
`exclude_unset`, so PATCHing a title cannot silently clear a description.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import MediaType, MeetingSource, ProcessingStatus, Visibility
from app.schemas.user import UserRef

TITLE_MAX = 200


class ParticipantRef(BaseModel):
    """Enough to render an avatar in a group."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_url: str | None = None


class ActionItemCounts(BaseModel):
    """Pre-aggregated so the row does not have to count client-side."""

    open: int = 0
    completed: int = 0


class TagRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str


# ── Input ───────────────────────────────────────────────────────────────────


class MeetingCreate(BaseModel):
    """Creating a meeting from the form, a paste, or an upload."""

    title: str = Field(min_length=1, max_length=TITLE_MAX)
    description: str | None = None
    started_at: datetime | None = Field(default=None, description="Defaults to now when omitted.")
    language: str = "en"
    visibility: Visibility = Visibility.PRIVATE
    source: MeetingSource = MeetingSource.MANUAL
    channel_id: int | None = None
    participant_names: list[str] = Field(default_factory=list, max_length=200)

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str) -> str:
        # min_length=1 accepts "   ". Trim first, then require content, so a
        # whitespace-only title is a 422 rather than an untitled meeting.
        title = value.strip()
        if not title:
            raise ValueError("Title cannot be blank.")
        return title


class MeetingUpdate(BaseModel):
    """Partial update. Every field optional; unset fields are left alone."""

    title: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX)
    description: str | None = None
    started_at: datetime | None = None
    language: str | None = None
    visibility: Visibility | None = None
    channel_id: int | None = None

    @field_validator("title")
    @classmethod
    def _title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        title = value.strip()
        if not title:
            raise ValueError("Title cannot be blank.")
        return title


class BulkDeleteRequest(BaseModel):
    ids: list[int] = Field(min_length=1, max_length=100)


class BulkDeleteResponse(BaseModel):
    deleted: int
    failed: list[int] = Field(
        default_factory=list, description="Ids that could not be deleted, e.g. already gone."
    )


# ── Output ──────────────────────────────────────────────────────────────────


class MeetingListItem(BaseModel):
    """One row of the Notebook. LIGHT — no transcript, no full summary.

    Carries a one-line `overview_preview` rather than the whole overview, since
    the row clamps it to a single line anyway.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    started_at: datetime
    duration_seconds: int
    host: UserRef
    participants: list[ParticipantRef] = Field(
        default_factory=list, description="Capped; `participant_count` has the true total."
    )
    participant_count: int = 0
    # No default: the service always populates this. A default would make the
    # generated TypeScript optional, forcing every consumer to null-check a
    # field that is never absent.
    action_item_counts: ActionItemCounts
    keywords: list[str] = Field(default_factory=list)
    tags: list[TagRef] = Field(default_factory=list)
    overview_preview: str | None = None
    has_media: bool = False
    media_type: MediaType = MediaType.NONE


class MeetingDetail(BaseModel):
    """The Notepad payload. Heavy, and only ever returned for a single meeting.

    Transcript segments are NOT here — they are paginated separately via
    `/meetings/{id}/transcript` (T-17.2), because a 55-minute meeting is ~1,200
    segments and shipping them inline makes the first paint wait on all of them.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    description: str | None = None
    started_at: datetime
    duration_seconds: int
    language: str
    visibility: Visibility
    source: MeetingSource
    processing_status: ProcessingStatus
    media_type: MediaType
    media_url: str | None = None
    host: UserRef
    participants: list[ParticipantRef] = Field(default_factory=list)
    tags: list[TagRef] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    segment_count: int = 0
    created_at: datetime
    updated_at: datetime
