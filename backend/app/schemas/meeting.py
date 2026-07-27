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

from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from app.models.enums import (
    ActionItemSource,
    ActionItemStatus,
    MediaType,
    MeetingSource,
    ProcessingStatus,
    Visibility,
)
from app.schemas.user import UserRef

# Re-exported so ROUTERS can reference the enum without importing from
# `app.models` — which the layering guard rejects, correctly. An enum is a value
# type, not ORM access, but the rule has no exceptions (ADR-017) and the right
# answer is for the API layer to get its vocabulary from the schema module
# rather than to carve a hole in the check.
__all__ = [
    "ActionItemCreate",
    "ActionItemSource",
    "ActionItemStatus",
    "MediaType",
    "MeetingSource",
    "ProcessingStatus",
    "Visibility",
]

TITLE_MAX = 200


class ChannelRef(BaseModel):
    """Just enough to name the channel a meeting sits in."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str


class ParticipantRef(BaseModel):
    """Enough to render an avatar in a group."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    avatar_url: str | None = None


class ParticipantDetail(BaseModel):
    """A participant, as the details drawer shows them (T-15.8, T-15.9).

    Richer than `ParticipantRef`, which exists to render an avatar in a group
    and deliberately carries nothing else — a Notebook page holds twenty rows
    and would otherwise ship attendance data for a hundred people nobody looks
    at.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    display_name: str
    email: str | None = None
    avatar_url: str | None = None
    #: The account behind this person, when there is one. Null for an external
    #: attendee — and the host selector reads it, because a participant with no
    #: account cannot be the host (the host is a user).
    user_id: int | None = None
    #: Invited but absent is a real and useful distinction — the drawer lists
    #: "Invited" and "Attended" separately.
    attended: bool
    talk_seconds: int
    #: The speaker colour index, so the talk-time bar matches this person's
    #: colour in the transcript. Server-assigned (ADR-013).
    color_index: int | None = None


class ActionItemOut(BaseModel):
    """One action item, with everything the Notepad's list draws (T-24)."""

    model_config = ConfigDict(from_attributes=True)

    # No defaults on ANY of these. A default makes the field optional in the
    # emitted OpenAPI, and the generated client then types it possibly-undefined
    # for an absence the API never produces — the same defect ADR-076 records
    # against `NoteGroup`. Nullable and required is the accurate pair here.
    id: int
    meeting_id: int
    text: str
    status: ActionItemStatus
    due_date: date | None
    #: Resolved for display; `assignee_participant_id` is what an edit sends.
    assignee_name: str | None
    assignee_participant_id: int | None
    assignee_avatar_url: str | None
    #: Where in the recording the commitment was made — powers the ⏱ chip.
    start_ms: int | None
    #: `ai` or `manual`, so a guessed task is distinguishable from a typed one.
    source: ActionItemSource


class ActionItemCreate(BaseModel):
    """A manually added item (T-24.5)."""

    #: Trimmed and required. An empty task is not a task, and the composer
    #: blocks it client-side too — this is the half that cannot be bypassed.
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
    assignee_participant_id: int | None = None
    due_date: date | None = None
    start_ms: int | None = None


class ActionItemUpdate(BaseModel):
    """A partial edit: text, assignee, due date, or the checkbox.

    Every field is optional, and `None` is a MEANINGFUL value for the nullable
    ones — clearing an assignee is a real edit. The two are told apart with
    `model_fields_set` rather than by treating `None` as "absent", which would
    make unassigning impossible.
    """

    text: (
        Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
        | None
    ) = None
    status: ActionItemStatus | None = None
    assignee_participant_id: int | None = None
    due_date: date | None = None


class ActionItemCounts(BaseModel):
    """Pre-aggregated so the row does not have to count client-side."""

    open: int = 0
    completed: int = 0


class MatchContext(BaseModel):
    """Why a meeting matched, when the reason is not visible in the row (T-11.3).

    Present ONLY when the hit came from the transcript. A title match needs no
    explanation — the user can read it — but a transcript match looks like a
    false positive unless the row shows the line that caused it.
    """

    snippet: str
    speaker: str
    #: Milliseconds, so the row can deep-link straight to the moment.
    start_ms: int


class Facets(BaseModel):
    """Available filter values, derived from real data (T-11.8).

    Sent so the filter panel can never offer an option that matches nothing,
    which is how a filter panel loses the user's trust on the first click.
    """

    hosts: list[str]
    participants: list[str]
    tags: list[str]
    channels: list[str]
    min_duration: int
    max_duration: int


class TagRef(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    color: str


# ── Input ───────────────────────────────────────────────────────────────────


#: Mirrors `transcript_import.MAX_SEGMENTS`. Duplicated as a literal rather
#: than imported, because a schema module importing a service inverts the
#: layering the project enforces (ADR-017); the parser's test pins the number.
MAX_IMPORT_SEGMENTS = 10_000


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


class ImportedSegment(BaseModel):
    """One line of a transcript being imported (T-26.7)."""

    speaker: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)]
    start_ms: int = Field(ge=0)
    end_ms: int = Field(ge=0)
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=5000)]


class MeetingImport(MeetingCreate):
    """A meeting created WITH a transcript (T-26.7).

    The segments are the ones the user confirmed in the preview, sent back
    rather than re-parsed: the preview is a contract, and re-reading the file
    would let a second parse disagree with what was on screen. They are
    re-validated here, because the client is still the client.
    """

    segments: list[ImportedSegment] = Field(max_length=MAX_IMPORT_SEGMENTS)


class TranscriptPreview(BaseModel):
    """What the parser found, before anything is created (T-26.7)."""

    #: Which heuristic matched. Shown, because a transcript whose timings were
    #: INVENTED should say so rather than presenting guesses as facts.
    strategy: str
    segments: list[ImportedSegment]
    speakers: list[str]
    duration_ms: int
    #: From the file's own metadata, where the format carries any.
    title: str | None
    participants: list[str]


class MeetingUpdate(BaseModel):
    """Partial update. Every field optional; unset fields are left alone."""

    title: str | None = Field(default=None, min_length=1, max_length=TITLE_MAX)
    description: str | None = None
    started_at: datetime | None = None
    language: str | None = None
    visibility: Visibility | None = None
    channel_id: int | None = None

    #: The full list, replacing what is there. Names, not ids: the editor is a
    #: token input over free text, and resolving a name to a participant row is
    #: the server's job — it is the side that knows which ones already exist.
    participant_names: list[str] | None = Field(default=None, max_length=200)
    #: Must be one of the participants. Enforced in the service, since the two
    #: fields can arrive in the same request.
    host_participant_id: int | None = None

    @field_validator("participant_names")
    @classmethod
    def _no_duplicate_participants(cls, value: list[str] | None) -> list[str] | None:
        """Two people with the same name in one meeting is a mistake, not a case.

        Blocked rather than de-duplicated: silently dropping one of them leaves
        the user looking at a list that does not match what they typed.
        """
        if value is None:
            return None

        names = [name.strip() for name in value if name.strip()]
        lowered = [name.lower() for name in names]
        duplicates = {name for name in lowered if lowered.count(name) > 1}
        if duplicates:
            raise ValueError(f"Duplicate participant: {', '.join(sorted(duplicates))}.")

        return names

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
    # No default: a `default_factory` makes the field non-required in OpenAPI,
    # so the generated client types it `number[] | undefined` and every caller
    # has to handle an absence the API never produces (same defect as
    # `action_item_counts` in T-05).
    failed: list[int] = Field(description="Ids that could not be deleted, e.g. already gone.")


class BulkRestoreResponse(BaseModel):
    """The undo half of a bulk delete (T-14.5).

    Separate from `BulkDeleteResponse` rather than reusing it with a renamed
    field: they mean different things, and a shared shape would make
    `{"deleted": 3}` the response to a restore.
    """

    restored: int
    failed: list[int] = Field(description="Ids that could not be restored, e.g. never deleted.")


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
    #: Set only when `?q=` matched the TRANSCRIPT rather than anything visible
    #: in the row (T-11.3). Absent otherwise, which is the common case.
    match_context: MatchContext | None = None

    # DEVIATION from T-11.2, which lists `thumbnail_url`. There are no
    # thumbnail images in this build and none are generated, so the field would
    # be null on every row forever. T-12.6 draws the leading cell itself — a
    # play overlay when `has_media`, a FileAudio block when not — which is all
    # the information it actually needs. A permanently-null field is worse than
    # no field: it implies a feature that does not exist.


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
    # The DETAIL shape, unlike the list row's `ParticipantRef`: the drawer shows
    # who attended, for how long, and in whose colour.
    participants: list[ParticipantDetail] = Field(default_factory=list)
    tags: list[TagRef] = Field(default_factory=list)
    keywords: list[str] = Field(default_factory=list)
    segment_count: int = 0
    #: Live comments + replies (T-31.10) — the drawer's "3 comments" line.
    comment_count: int = 0
    channel: ChannelRef | None = None
    created_at: datetime
    updated_at: datetime
