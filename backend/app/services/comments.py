"""Comment business logic (T-31).

The invariants the schema cannot express live here: one nesting level, the
segment and the parent must belong to the commented meeting, mentions must be
that meeting's participants, and only the author touches a comment. Every one
of them is a ValidationError or Forbidden at the boundary — never a 500 from
a constraint violation deeper down.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    CommentNotFoundError,
    NotYourCommentError,
    ValidationError,
)
from app.models import Comment, CommentMention, Participant, TranscriptSegment
from app.schemas.comment import CommentOut, MentionRef
from app.schemas.common import Page
from app.schemas.user import UserRef

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.core.deps import PaginationParams
    from app.models import Meeting, User
    from app.schemas.comment import CommentCreate, CommentUpdate

#: Timeline sort key for comments with no timestamp — after every real one.
_UNANCHORED = 1 << 62


class CommentService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Reads ───────────────────────────────────────────────────────────

    def list_threads(self, meeting: Meeting, pagination: PaginationParams) -> Page[CommentOut]:
        """Top-level threads in timeline order, replies nested one level.

        A thread appears when its parent is live, OR when the parent is
        deleted but still has live replies — the tombstone case (T-31.7).
        Deleted replies are simply gone; a tombstone with no children under
        it is noise, not history.
        """
        parents = (
            self.db.execute(
                select(Comment)
                .where(Comment.meeting_id == meeting.id, Comment.parent_id.is_(None))
                .options(
                    selectinload(Comment.author),
                    selectinload(Comment.mentions).selectinload(CommentMention.participant),
                    selectinload(Comment.replies).selectinload(Comment.author),
                    selectinload(Comment.replies)
                    .selectinload(Comment.mentions)
                    .selectinload(CommentMention.participant),
                )
            )
            .scalars()
            .all()
        )

        threads = [
            parent
            for parent in parents
            if parent.deleted_at is None
            or any(reply.deleted_at is None for reply in parent.replies)
        ]
        threads.sort(
            key=lambda c: (
                c.start_ms if c.start_ms is not None else _UNANCHORED,
                c.created_at,
                c.id,
            )
        )

        window = threads[pagination.offset : pagination.offset + pagination.limit]
        return Page.build(
            [self._to_out(comment) for comment in window],
            page=pagination.page,
            page_size=pagination.limit,
            total=len(threads),
        )

    def live_count(self, meeting_id: int) -> int:
        """Comments + replies, excluding deleted — the drawer's `3 comments`."""
        from sqlalchemy import func

        return int(
            self.db.execute(
                select(func.count())
                .select_from(Comment)
                .where(Comment.meeting_id == meeting_id, Comment.deleted_at.is_(None))
            ).scalar_one()
        )

    # ── Writes ──────────────────────────────────────────────────────────

    def create(self, meeting: Meeting, payload: CommentCreate, *, author: User) -> CommentOut:
        segment = self._segment_of(meeting, payload.segment_id)
        parent = self._parent_of(meeting, payload.parent_id)

        comment = Comment(
            meeting_id=meeting.id,
            author_id=author.id,
            body=payload.body,
            parent_id=parent.id if parent else None,
            # A reply inherits its parent's anchor so the whole thread sits at
            # one place on the timeline; an anchored comment takes the
            # segment's start so the flyout can seek the player to it.
            segment_id=(parent.segment_id if parent else segment.id if segment else None),
            start_ms=(parent.start_ms if parent else segment.start_ms if segment else None),
        )
        self.db.add(comment)
        self.db.flush()

        for participant in self._mentioned(meeting, payload.mentions):
            self.db.add(CommentMention(comment_id=comment.id, participant_id=participant.id))

        self.db.commit()
        self.db.refresh(comment)
        return self._to_out(comment)

    def update(self, comment_id: int, payload: CommentUpdate, *, author: User) -> CommentOut:
        comment = self._own_live_comment(comment_id, author)

        if payload.body is not None and payload.body != comment.body:
            comment.body = payload.body
            # The marker tracks BODY changes only — see the model docstring.
            comment.edited_at = datetime.now(UTC)

        if payload.is_resolved is not None:
            if comment.parent_id is not None:
                raise ValidationError("Resolve the thread, not a reply.")
            comment.is_resolved = payload.is_resolved

        self.db.commit()
        self.db.refresh(comment)
        return self._to_out(comment)

    def soft_delete(self, comment_id: int, *, author: User) -> None:
        comment = self._own_live_comment(comment_id, author)
        comment.deleted_at = datetime.now(UTC)
        self.db.commit()

    # ── Guards ──────────────────────────────────────────────────────────

    def _own_live_comment(self, comment_id: int, author: User) -> Comment:
        comment = self.db.get(Comment, comment_id)
        if comment is None or comment.deleted_at is not None:
            raise CommentNotFoundError()
        if comment.author_id != author.id:
            raise NotYourCommentError()
        return comment

    def _segment_of(self, meeting: Meeting, segment_id: int | None) -> TranscriptSegment | None:
        if segment_id is None:
            return None
        segment = self.db.get(TranscriptSegment, segment_id)
        if segment is None or segment.meeting_id != meeting.id:
            raise ValidationError("That segment is not part of this meeting.")
        return segment

    def _parent_of(self, meeting: Meeting, parent_id: int | None) -> Comment | None:
        if parent_id is None:
            return None
        parent = self.db.get(Comment, parent_id)
        if parent is None or parent.meeting_id != meeting.id or parent.deleted_at is not None:
            raise ValidationError("That comment cannot be replied to.")
        if parent.parent_id is not None:
            # One nesting level (T-31.1): arbitrary depth is easy to store
            # and miserable to render.
            raise ValidationError("Replies cannot be nested further.")
        return parent

    def _mentioned(self, meeting: Meeting, participant_ids: list[int]) -> list[Participant]:
        if not participant_ids:
            return []
        wanted = list(dict.fromkeys(participant_ids))
        found = (
            self.db.execute(
                select(Participant).where(
                    Participant.id.in_(wanted), Participant.meeting_id == meeting.id
                )
            )
            .scalars()
            .all()
        )
        if len(found) != len(wanted):
            raise ValidationError("Mentions must be participants of this meeting.")
        return list(found)

    # ── Shaping ─────────────────────────────────────────────────────────

    def _to_out(self, comment: Comment) -> CommentOut:
        replies = sorted(
            (reply for reply in comment.replies if reply.deleted_at is None),
            key=lambda reply: (reply.created_at, reply.id),
        )
        return self._one_out(comment, [self._one_out(reply, []) for reply in replies])

    def _one_out(self, comment: Comment, replies: list[CommentOut]) -> CommentOut:
        deleted = comment.deleted_at is not None
        return CommentOut(
            id=comment.id,
            segment_id=comment.segment_id,
            parent_id=comment.parent_id,
            start_ms=comment.start_ms,
            author=UserRef.model_validate(comment.author),
            # A tombstone keeps its slot in the thread but not its words.
            body="" if deleted else comment.body,
            mentions=(
                []
                if deleted
                else [
                    MentionRef(
                        participant_id=mention.participant_id,
                        display_name=mention.participant.display_name,
                    )
                    for mention in comment.mentions
                ]
            ),
            is_resolved=comment.is_resolved,
            is_deleted=deleted,
            is_edited=comment.edited_at is not None,
            created_at=comment.created_at,
            replies=replies,
        )
