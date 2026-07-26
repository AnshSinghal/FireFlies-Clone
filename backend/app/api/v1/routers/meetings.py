"""Meeting endpoints.

Every handler here is three lines of work: parse, call a service, return a
schema. No ORM access, no business rules, no `raise HTTPException` — services
raise domain exceptions and `core/errors.py` decides the status code.
`scripts/check_layering.py` fails the build if that slips.

T-11 and T-17 extend this with the full filter set and the transcript endpoints.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, Response, status

from app.api.responses import NOT_FOUND_OR_GONE, VALIDATION
from app.core.deps import CurrentUser, DbSession, Pagination
from app.schemas.common import Page
from app.schemas.meeting import (
    BulkDeleteRequest,
    BulkDeleteResponse,
    MeetingCreate,
    MeetingDetail,
    MeetingListItem,
    MeetingUpdate,
)
from app.services.meetings import SORTABLE, MeetingService

router = APIRouter(prefix="/meetings", tags=["meetings"])


@router.get(
    "",
    response_model=Page[MeetingListItem],
    summary="List meetings",
    description=(
        "Paginated, newest first. Returns the LIGHT row shape — no transcript "
        "and no full summary. Use `GET /meetings/{id}` for detail."
    ),
)
def list_meetings(
    db: DbSession,
    page: Pagination,
    q: Annotated[str | None, Query(description="Case-insensitive title match.")] = None,
    sort: Annotated[str, Query(description=f"One of: {', '.join(sorted(SORTABLE))}")] = (
        "-started_at"
    ),
) -> Page[MeetingListItem]:
    service = MeetingService(db)
    items, total = service.list_page(limit=page.limit, offset=page.offset, query=q, sort=sort)
    return Page.build(items, page=page.page, page_size=page.limit, total=total)


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
