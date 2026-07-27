"""Comment endpoints (T-31.1).

Collection routes hang off the meeting (`/meetings/{id}/comments`); item
routes address the comment directly (`/comments/{id}`) — a comment id is
already globally unique, and repeating the meeting id would only add a
mismatch case to validate.
"""

from __future__ import annotations

from fastapi import APIRouter, status

from app.api.responses import NOT_FOUND_OR_GONE
from app.core.deps import CurrentUser, DbSession, Pagination
from app.schemas.comment import CommentCreate, CommentOut, CommentUpdate
from app.schemas.common import Page
from app.services.comments import CommentService
from app.services.meetings import MeetingService

router = APIRouter(tags=["comments"])


@router.get(
    "/meetings/{meeting_id}/comments",
    response_model=Page[CommentOut],
    responses=NOT_FOUND_OR_GONE,
    summary="List comment threads",
    description="Top-level threads in timeline order; replies nested one level.",
)
def list_comments(db: DbSession, meeting_id: int, pagination: Pagination) -> Page[CommentOut]:
    meeting = MeetingService(db).get(meeting_id)
    return CommentService(db).list_threads(meeting, pagination)


@router.post(
    "/meetings/{meeting_id}/comments",
    response_model=CommentOut,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND_OR_GONE,
    summary="Add a comment",
    description=(
        "Optionally anchored to a segment (`segment_id`) or replying to a "
        "top-level comment (`parent_id`). Mentions are participant ids."
    ),
)
def create_comment(
    db: DbSession, meeting_id: int, payload: CommentCreate, user: CurrentUser
) -> CommentOut:
    meeting = MeetingService(db).get(meeting_id)
    return CommentService(db).create(meeting, payload, author=user)


@router.patch(
    "/comments/{comment_id}",
    response_model=CommentOut,
    summary="Edit or resolve a comment",
    description="Author-only. Body edits set the `edited` marker; resolve applies to threads.",
)
def update_comment(
    db: DbSession, comment_id: int, payload: CommentUpdate, user: CurrentUser
) -> CommentOut:
    return CommentService(db).update(comment_id, payload, author=user)


@router.delete(
    "/comments/{comment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a comment",
    description=(
        "Author-only, soft. A deleted parent with replies survives as a "
        "'Comment deleted' tombstone so the thread doesn't collapse."
    ),
)
def delete_comment(db: DbSession, comment_id: int, user: CurrentUser) -> None:
    CommentService(db).soft_delete(comment_id, author=user)
