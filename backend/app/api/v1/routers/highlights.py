"""Highlight and bookmark endpoints (T-32.1, T-32.6).

Both are nested under `/meetings/{id}` because neither is addressable on its
own: a highlight without its meeting is a pair of integers. Nesting also gives
the service a meeting to check the segment against, which is what stops a
client attaching a highlight to somebody else's transcript.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.responses import NOT_FOUND, NOT_FOUND_OR_GONE, VALIDATION
from app.core.deps import CurrentUser, DbSession
from app.schemas.highlight import (
    BookmarkCreate,
    BookmarkOut,
    BookmarkToggleOut,
    HighlightCreate,
    HighlightOut,
    HighlightUpdate,
)
from app.services.highlights import HighlightService
from app.services.meetings import MeetingService

router = APIRouter(prefix="/meetings", tags=["highlights"])


@router.get(
    "/{meeting_id}/highlights",
    response_model=list[HighlightOut],
    responses=NOT_FOUND_OR_GONE,
    summary="Every highlight in a meeting",
    description=(
        "Returned unpaginated and in reading order. Highlights are painted into "
        "the transcript, so the client needs all of them before it renders any "
        "of them — a page boundary would leave lines silently unhighlighted.\n\n"
        "Each row carries the quoted text, the segment's timestamp and its "
        "speaker, so the flyout can render without the transcript."
    ),
)
def list_highlights(db: DbSession, meeting_id: int) -> list[HighlightOut]:
    # Through `get` first so a deleted meeting answers 410 rather than `[]`,
    # which would read as "no highlights".
    MeetingService(db).get(meeting_id)
    return HighlightService(db).list_highlights(meeting_id)


@router.post(
    "/{meeting_id}/highlights",
    response_model=HighlightOut,
    status_code=status.HTTP_201_CREATED,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Highlight a character range",
)
def create_highlight(
    db: DbSession, user: CurrentUser, meeting_id: int, payload: HighlightCreate
) -> HighlightOut:
    MeetingService(db).get(meeting_id)
    return HighlightService(db).create_highlight(meeting_id, user, payload)


@router.patch(
    "/{meeting_id}/highlights/{highlight_id}",
    response_model=HighlightOut,
    responses={**NOT_FOUND, **VALIDATION},
    summary="Recolour or annotate a highlight",
    description=(
        "The range is immutable — re-select to change it. Sending `note: null` clears the note."
    ),
)
def update_highlight(
    db: DbSession, meeting_id: int, highlight_id: int, payload: HighlightUpdate
) -> HighlightOut:
    return HighlightService(db).update_highlight(meeting_id, highlight_id, payload)


@router.delete(
    "/{meeting_id}/highlights/{highlight_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Remove a highlight",
)
def delete_highlight(db: DbSession, meeting_id: int, highlight_id: int) -> None:
    HighlightService(db).delete_highlight(meeting_id, highlight_id)


@router.get(
    "/{meeting_id}/bookmarks",
    response_model=list[BookmarkOut],
    responses=NOT_FOUND_OR_GONE,
    summary="Bookmarked moments, in recording order",
)
def list_bookmarks(db: DbSession, user: CurrentUser, meeting_id: int) -> list[BookmarkOut]:
    MeetingService(db).get(meeting_id)
    return HighlightService(db).list_bookmarks(meeting_id, user)


@router.post(
    "/{meeting_id}/bookmarks",
    response_model=BookmarkToggleOut,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Toggle a segment's star",
    description=(
        "Idempotent in the sense that matters: the response states the resulting "
        "state rather than leaving the client to infer it, so two toggles racing "
        "each other reconcile against the server instead of flickering."
    ),
)
def toggle_bookmark(
    db: DbSession, user: CurrentUser, meeting_id: int, payload: BookmarkCreate
) -> BookmarkToggleOut:
    MeetingService(db).get(meeting_id)
    return HighlightService(db).toggle_bookmark(meeting_id, user, payload.segment_id)


@router.delete(
    "/{meeting_id}/bookmarks/{bookmark_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Remove a bookmark by id",
)
def delete_bookmark(db: DbSession, user: CurrentUser, meeting_id: int, bookmark_id: int) -> None:
    HighlightService(db).delete_bookmark(meeting_id, bookmark_id, user)
