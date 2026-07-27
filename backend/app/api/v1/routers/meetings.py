"""Meeting endpoints.

Every handler here is three lines of work: parse, call a service, return a
schema. No ORM access, no business rules, no `raise HTTPException` — services
raise domain exceptions and `core/errors.py` decides the status code.
`scripts/check_layering.py` fails the build if that slips.

T-11 and T-17 extend this with the full filter set and the transcript endpoints.
"""

from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Annotated, Literal

from fastapi import APIRouter, File, Form, Query, Request, Response, UploadFile, status

from app.api.responses import NOT_FOUND_OR_GONE, VALIDATION
from app.core.config import get_settings
from app.core.deps import CurrentUser, DbSession, Pagination
from app.core.exceptions import ValidationError
from app.core.http import NotModified, weak_etag
from app.schemas.common import Page
from app.schemas.meeting import (
    ActionItemCreate,
    ActionItemOut,
    ActionItemUpdate,
    BulkDeleteRequest,
    BulkDeleteResponse,
    BulkRestoreResponse,
    Facets,
    ImportedSegment,
    MeetingCreate,
    MeetingDetail,
    MeetingImport,
    MeetingListItem,
    MeetingSource,
    MeetingUpdate,
    TranscriptPreview,
)
from app.services.meeting_filters import MeetingFilters, TagSelection
from app.services.meetings import SORTABLE, MeetingService
from app.services.transcript_import import TranscriptParseError, parse_transcript

router = APIRouter(prefix="/meetings", tags=["meetings"])


def _parse_tag_selection(raw: str | None, mode: str) -> TagSelection | None:
    """`?tags=3,7` → ids, or None when nothing usable was sent.

    Ids rather than names, because names are mutable (T-36.6 rename) and a
    shared URL should survive one. A non-numeric entry is a 422 naming the
    parameter, not a silently empty filter that looks like "no results".
    """
    if raw is None or not raw.strip():
        return None
    try:
        ids = tuple(int(part) for part in (piece.strip() for piece in raw.split(",")) if part)
    except ValueError as error:
        raise ValidationError(
            "`tags` must be a comma-separated list of tag ids.", details={"tags": raw}
        ) from error
    if not ids:
        return None
    return TagSelection(ids=ids, mode=mode)


@router.get(
    "",
    response_model=Page[MeetingListItem],
    responses=VALIDATION,
    summary="List meetings",
    description=(
        "Paginated, newest first. Returns the LIGHT row shape — no transcript "
        "and no full summary; use `GET /meetings/{id}` for detail.\n\n"
        "`from` and `to` are inclusive dates in UTC: `to=2026-07-26` includes "
        "everything that happened ON the 26th.\n\n"
        "`q` matches the title, the overview, participant names and the "
        "transcript. When the hit came from the transcript — and only then — "
        "the row carries `match_context` explaining why."
    ),
)
def list_meetings(
    db: DbSession,
    page: Pagination,
    response: Response,
    request: Request,
    q: Annotated[
        str | None, Query(description="Free text across title, overview, people and transcript.")
    ] = None,
    host: Annotated[str | None, Query(description="Host name, partial match.")] = None,
    participant: Annotated[
        str | None, Query(description="Participant name, partial match.")
    ] = None,
    from_: Annotated[
        date | None,
        Query(alias="from", description="Inclusive start date (UTC)."),
    ] = None,
    to: Annotated[date | None, Query(description="Inclusive END date (UTC).")] = None,
    min_duration: Annotated[int | None, Query(ge=0, description="Seconds.")] = None,
    max_duration: Annotated[int | None, Query(ge=0, description="Seconds.")] = None,
    tags: Annotated[
        str | None,
        Query(description="Tag ids, comma-separated. `tags_mode` decides how they combine."),
    ] = None,
    tags_mode: Annotated[
        Literal["or", "and"],
        Query(
            description=(
                "`or` (default): meetings carrying ANY selected tag. "
                "`and`: only meetings carrying ALL of them."
            )
        ),
    ] = "or",
    channel: Annotated[str | None, Query(description="Channel slug.")] = None,
    has_action_items: Annotated[
        bool | None, Query(description="True = has OPEN action items.")
    ] = None,
    source: Annotated[MeetingSource | None, Query(description="How it was captured.")] = None,
    sort: Annotated[str, Query(description=f"One of: {', '.join(sorted(SORTABLE))}")] = (
        "-started_at"
    ),
) -> Page[MeetingListItem]:
    filters = MeetingFilters(
        q=q,
        host=host,
        participant=participant,
        from_date=from_,
        to_date=to,
        min_duration=min_duration,
        max_duration=max_duration,
        tags=_parse_tag_selection(tags, tags_mode),
        channel=channel,
        has_action_items=has_action_items,
        source=source,
    )

    service = MeetingService(db)
    items, total = service.list_page(
        limit=page.limit, offset=page.offset, filters=filters, sort=sort
    )
    body = Page.build(items, page=page.page, page_size=page.limit, total=total)

    # ETag + no-cache (T-11.11).
    #
    # `no-cache` does NOT mean "do not cache" — it means "cache it, but
    # revalidate before reusing it". Paired with an ETag that is a digest of the
    # response, a repeat request costs one 304 and no body, while an edit
    # anywhere in the page changes the digest and the client gets fresh data.
    # `max-age` would have been the bug: a stale meetings list after a delete.
    etag = weak_etag(body)
    response.headers["Cache-Control"] = "no-cache"
    response.headers["ETag"] = etag
    if request.headers.get("if-none-match") == etag:
        # 304 must carry no body; FastAPI would otherwise serialise `body` into
        # a response the client is being told not to read.
        raise NotModified(etag)
    return body


@router.get(
    "/facets",
    response_model=Facets,
    summary="Available filter values",
    description=(
        "Distinct hosts, participants, tags and channels across non-deleted "
        "meetings, plus the duration bounds. Derived from real data so the "
        "filter panel can never offer an option that matches nothing."
    ),
)
def meeting_facets(db: DbSession) -> Facets:
    return MeetingService(db).facets()


@router.post(
    "",
    response_model=MeetingDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a meeting",
    description="Creates an empty meeting. Transcript ingestion happens separately.",
    responses=VALIDATION,
)
def create_meeting(db: DbSession, user: CurrentUser, payload: MeetingCreate) -> MeetingDetail:
    service = MeetingService(db)
    return service.to_detail(service.create(payload, host=user))


@router.post(
    "/import",
    response_model=MeetingDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a meeting with a transcript",
    description=(
        "Takes the segments the user confirmed in the preview. Speakers are "
        "created from the distinct names in first-appearance order, the "
        "duration is derived from the last segment, and anyone who spoke is "
        "added as a participant. All in one transaction: a meeting with half a "
        "transcript looks successful and is not."
    ),
    responses=VALIDATION,
)
def import_meeting(db: DbSession, user: CurrentUser, payload: MeetingImport) -> MeetingDetail:
    service = MeetingService(db)
    return service.to_detail(service.create_with_transcript(payload, host=user))


@router.post(
    "/parse",
    response_model=TranscriptPreview,
    summary="Parse a transcript without saving anything",
    description=(
        "Backs the upload and paste previews (T-26.7). Nothing is written — "
        "this answers 'what would we create', so the user can confirm it or "
        "correct the speakers first.\n\n"
        "The EXTENSION chooses the parser; it does not certify the content. A "
        "binary file renamed to `.txt` reaches the text parser and is refused "
        "on what it actually contains."
    ),
    responses=VALIDATION,
)
async def parse_transcript_preview(
    file: Annotated[
        UploadFile | None, File(description="A .txt, .vtt, .srt or .json file.")
    ] = None,
    text: Annotated[str | None, Form(description="Pasted transcript text.")] = None,
    extension: Annotated[str, Form(description="Which parser to use for pasted text.")] = "txt",
) -> TranscriptPreview:
    if file is not None:
        raw = await file.read()
        if len(raw) > get_settings().max_upload_bytes:
            raise ValidationError(
                f"That file is larger than {get_settings().max_upload_mb} MB.",
                details={"size": len(raw)},
            )
        try:
            content = raw.decode("utf-8")
        except UnicodeDecodeError as error:
            # Not text at all. Caught here so the message names the problem
            # rather than surfacing a decode traceback.
            raise ValidationError(
                "That file isn't text — export the transcript as .txt, .vtt, .srt or .json.",
                details={"filename": file.filename},
            ) from error

        suffix = Path(file.filename or "").suffix or ".txt"
    elif text is not None:
        content = text
        suffix = f".{extension}"
    else:
        raise ValidationError("Send either a file or some text.")

    try:
        parsed = parse_transcript(content, extension=suffix)
    except TranscriptParseError as error:
        raise ValidationError(
            error.message, details={"hint": error.hint} if error.hint else {}
        ) from error

    return TranscriptPreview(
        strategy=parsed.strategy,
        segments=[
            ImportedSegment(
                speaker=segment.speaker,
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                text=segment.text,
            )
            for segment in parsed.segments
        ],
        speakers=parsed.speakers,
        duration_ms=parsed.duration_ms,
        title=parsed.title,
        participants=parsed.participants,
    )


@router.get(
    "/{meeting_id}",
    response_model=MeetingDetail,
    summary="Get a meeting",
    description=(
        "404 if the meeting never existed; **410** if it was deleted, since a "
        "deleted meeting is restorable and the client can offer that."
    ),
    responses=NOT_FOUND_OR_GONE,
)
def get_meeting(db: DbSession, meeting_id: int) -> MeetingDetail:
    service = MeetingService(db)
    return service.to_detail(service.get(meeting_id))


@router.patch(
    "/{meeting_id}",
    response_model=MeetingDetail,
    summary="Update a meeting",
    description="Partial update — omitted fields are left untouched.",
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
)
def update_meeting(db: DbSession, meeting_id: int, payload: MeetingUpdate) -> MeetingDetail:
    service = MeetingService(db)
    return service.to_detail(service.update(meeting_id, payload))


@router.delete(
    "/{meeting_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a meeting",
    description="Soft delete. The meeting disappears from lists but is restorable.",
    responses=NOT_FOUND_OR_GONE,
)
def delete_meeting(db: DbSession, meeting_id: int) -> Response:
    MeetingService(db).soft_delete(meeting_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{meeting_id}/restore",
    response_model=MeetingDetail,
    summary="Restore a deleted meeting",
    description="Undoes a soft delete. Backs the 6-second Undo affordance in the UI.",
    responses=NOT_FOUND_OR_GONE,
)
def restore_meeting(db: DbSession, meeting_id: int) -> MeetingDetail:
    service = MeetingService(db)
    return service.to_detail(service.restore(meeting_id))


@router.post(
    "/bulk-delete",
    response_model=BulkDeleteResponse,
    summary="Delete several meetings",
    description=(
        "Reports per-id failures rather than aborting the batch, so the client "
        "can say '2 of 3 deleted' instead of leaving the user guessing."
    ),
)
def bulk_delete(db: DbSession, payload: BulkDeleteRequest) -> BulkDeleteResponse:
    deleted, failed = MeetingService(db).bulk_soft_delete(payload.ids)
    return BulkDeleteResponse(deleted=deleted, failed=failed)


@router.post(
    "/bulk-restore",
    response_model=BulkRestoreResponse,
    summary="Restore several meetings",
    description=(
        "The undo half of a bulk delete. Reports per-id failures the same way, "
        "so an Undo that only half-works says so rather than appearing to fail."
    ),
)
def bulk_restore(db: DbSession, payload: BulkDeleteRequest) -> BulkRestoreResponse:
    restored, failed = MeetingService(db).bulk_restore(payload.ids)
    return BulkRestoreResponse(restored=restored, failed=failed)


@router.get(
    "/{meeting_id}/action-items",
    response_model=list[ActionItemOut],
    responses=NOT_FOUND_OR_GONE,
    summary="List a meeting's action items",
    description="Ordered as they were raised. T-24 owns the full CRUD; this backs the previews.",
)
def list_action_items(db: DbSession, meeting_id: int) -> list[ActionItemOut]:
    service = MeetingService(db)
    # Through `get` first, so a deleted meeting answers 410 rather than an
    # empty list that looks like "no action items".
    service.get(meeting_id)
    return service.action_items(meeting_id)


@router.post(
    "/{meeting_id}/action-items",
    response_model=ActionItemOut,
    status_code=201,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Add an action item",
    description=(
        "Appended after the extracted items and marked `manual`, so a task "
        "somebody typed is distinguishable from one the model guessed."
    ),
)
def create_action_item(db: DbSession, meeting_id: int, payload: ActionItemCreate) -> ActionItemOut:
    return MeetingService(db).create_action_item(meeting_id, payload)


@router.patch(
    "/action-items/{item_id}",
    response_model=ActionItemOut,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Edit an action item",
    description=(
        "A partial edit: text, assignee, due date or status. `completed_at` is "
        "derived from the status rather than accepted from the client, so the "
        "two cannot disagree. Sending `null` CLEARS a nullable field — absent "
        "and null are different requests."
    ),
)
def update_action_item(db: DbSession, item_id: int, payload: ActionItemUpdate) -> ActionItemOut:
    return MeetingService(db).update_action_item(item_id, payload)


@router.delete(
    "/action-items/{item_id}",
    response_model=ActionItemOut,
    responses=NOT_FOUND_OR_GONE,
    summary="Delete an action item",
    description=(
        "Returns the deleted item, so the client can offer Undo by re-creating "
        "it. A hard delete: one line of text with no children does not need the "
        "soft-delete machinery meetings have."
    ),
)
def delete_action_item(db: DbSession, item_id: int) -> ActionItemOut:
    return MeetingService(db).delete_action_item(item_id)
