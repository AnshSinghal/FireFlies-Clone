"""Meeting endpoints.

Every handler here is three lines of work: parse, call a service, return a
schema. No ORM access, no business rules, no `raise HTTPException` — services
raise domain exceptions and `core/errors.py` decides the status code.
`scripts/check_layering.py` fails the build if that slips.

T-11 and T-17 extend this with the full filter set and the transcript endpoints.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Query, Request, Response, status

from app.api.responses import NOT_FOUND_OR_GONE, VALIDATION
from app.core.deps import CurrentUser, DbSession, Pagination
from app.core.http import NotModified, weak_etag
from app.schemas.common import Page
from app.schemas.meeting import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    BulkRestoreResponse,
    Facets,
    MeetingCreate,
    MeetingDetail,
    MeetingListItem,
    MeetingSource,
    MeetingUpdate,
)
from app.services.meeting_filters import MeetingFilters
from app.services.meetings import SORTABLE, MeetingService

router = APIRouter(prefix="/meetings", tags=["meetings"])


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
    tags: Annotated[list[str] | None, Query(description="Tag names. ALL must match.")] = None,
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
        tags=tuple(tags or ()),
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
