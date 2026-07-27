"""Highlight & bookmark endpoints (T-32.1).

Collection routes hang off the meeting; highlight item routes address the
highlight directly (`/highlights/{id}`), the same split the comments API uses.
Bookmarks are keyed by SEGMENT under the meeting — `PUT` sets, `DELETE`
clears, both idempotent, which is what a toggle wants from its API: pressing
the star twice must not invent an error.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.responses import NOT_FOUND_OR_GONE
from app.core.deps import CurrentUser, DbSession
from app.schemas.highlight import BookmarkOut, HighlightCreate, HighlightOut, HighlightUpdate
from app.services.highlights import HighlightService
from app.services.meetings import MeetingService

router = APIRouter(tags=["highlights"])


@router.get(
    "/meetings/{meeting_id}/highlights",
    response_model=list[HighlightOut],
    responses=NOT_FOUND_OR_GONE,
    summary="List highlights",
    description=(
        "Every highlight in transcript order, each carrying the highlighted "
        "excerpt sliced from the segment's current text. Unpaginated: the "
        "transcript panel needs ALL of them to paint, and a partial paint is "
        "indistinguishable from data loss."
    ),
)
def list_highlights(db: DbSession, meeting_id: int) -> list[HighlightOut]:
    meeting = MeetingService(db).get(meeting_id)
    return HighlightService(db).list_highlights(meeting)


@router.post(
    "/meetings/{meeting_id}/highlights",
    response_model=HighlightOut,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND_OR_GONE,
    summary="Add a highlight",
    description=(
        "Character offsets into one segment's current text. The range must "
        "fit — a selection made against stale text is refused, not clamped."
    ),
)
def create_highlight(
    db: DbSession, meeting_id: int, payload: HighlightCreate, user: CurrentUser
) -> HighlightOut:
    meeting = MeetingService(db).get(meeting_id)
    return HighlightService(db).create(meeting, payload, author=user)


@router.patch(
    "/highlights/{highlight_id}",
    response_model=HighlightOut,
    summary="Recolour or annotate a highlight",
    description="`note: null` clears the note; an absent field leaves it alone.",
)
def update_highlight(db: DbSession, highlight_id: int, payload: HighlightUpdate) -> HighlightOut:
    return HighlightService(db).update(highlight_id, payload, fields_set=payload.model_fields_set)


@router.delete(
    "/highlights/{highlight_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove a highlight",
)
def delete_highlight(db: DbSession, highlight_id: int) -> None:
    HighlightService(db).remove(highlight_id)


@router.get(
    "/meetings/{meeting_id}/bookmarks",
    response_model=list[BookmarkOut],
    responses=NOT_FOUND_OR_GONE,
    summary="List bookmarks",
    description="Active bookmarks in timeline order, with a snippet per moment.",
)
def list_bookmarks(db: DbSession, meeting_id: int) -> list[BookmarkOut]:
    meeting = MeetingService(db).get(meeting_id)
    return HighlightService(db).list_bookmarks(meeting)


@router.put(
    "/meetings/{meeting_id}/bookmarks/{segment_id}",
    response_model=BookmarkOut,
    responses=NOT_FOUND_OR_GONE,
    summary="Bookmark a segment",
    description="Idempotent: bookmarking a bookmarked segment returns the existing star.",
)
def set_bookmark(db: DbSession, meeting_id: int, segment_id: int, user: CurrentUser) -> BookmarkOut:
    meeting = MeetingService(db).get(meeting_id)
    return HighlightService(db).set_bookmark(meeting, segment_id, user=user)


@router.delete(
    "/meetings/{meeting_id}/bookmarks/{segment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND_OR_GONE,
    summary="Remove a bookmark",
    description="Idempotent: un-starring a plain segment succeeds silently.",
)
def clear_bookmark(db: DbSession, meeting_id: int, segment_id: int, user: CurrentUser) -> None:
    meeting = MeetingService(db).get(meeting_id)
    HighlightService(db).clear_bookmark(meeting, segment_id, user=user)
