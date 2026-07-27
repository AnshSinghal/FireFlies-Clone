"""Threaded comments on transcript segments (bonus T-31)."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.participant import Participant
    from app.models.transcript import TranscriptSegment
    from app.models.user import User


class Comment(Base, TimestampMixin, SoftDeleteMixin):
    """A remark, optionally anchored to a segment, optionally replying to another.

    Self-referential via `parent_id`, limited to ONE level of nesting by the
    service layer rather than the schema — arbitrary depth is easy to store and
    miserable to render, and Fireflies itself does not offer it.

    Soft-deleted so that deleting a parent leaves a "Comment deleted" tombstone
    instead of silently collapsing its replies (T-31.7).
    """

    __tablename__ = "comments"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    #: Null for a meeting-level comment not tied to any particular line.
    segment_id: Mapped[int | None] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    author_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )

    body: Mapped[str] = mapped_column(Text, nullable=False)
    #: Denormalised from the segment so the comments flyout can order a mixed
    #: list of anchored and unanchored comments on one timeline without a join.
    start_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    #: Set only when the BODY changes — the `edited` marker (T-31.7). Not
    #: derived from `updated_at`, which also moves on resolve/unresolve and
    #: would mark comments as edited that nobody rewrote.
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    meeting: Mapped[Meeting] = relationship(back_populates="comments")
    segment: Mapped[TranscriptSegment | None] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
    replies: Mapped[list[Comment]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    parent: Mapped[Comment | None] = relationship(back_populates="replies", remote_side=[id])
    mentions: Mapped[list[CommentMention]] = relationship(
        back_populates="comment", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Comment {self.id} m={self.meeting_id}>"


class CommentMention(Base):
    """Who a comment @mentions (T-31.4).

    Rows, not styled text: the requirement is that mentions are STORED, so a
    future notification feature can query "comments mentioning Priya" without
    regex-mining comment bodies. Participants rather than users, because most
    meeting attendees have no account (see `participants`).
    """

    __tablename__ = "comment_mentions"
    __table_args__ = (
        # Mentioning someone twice in one comment is one mention.
        UniqueConstraint("comment_id", "participant_id", name="uq_comment_mentions"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    comment_id: Mapped[int] = mapped_column(
        ForeignKey("comments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_id: Mapped[int] = mapped_column(
        ForeignKey("participants.id", ondelete="CASCADE"), nullable=False, index=True
    )

    comment: Mapped[Comment] = relationship(back_populates="mentions")
    participant: Mapped[Participant] = relationship()

    def __repr__(self) -> str:
        return f"<CommentMention c={self.comment_id} p={self.participant_id}>"
