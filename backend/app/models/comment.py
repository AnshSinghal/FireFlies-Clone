"""Threaded comments on transcript segments (bonus T-31)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, SoftDeleteMixin, TimestampMixin

if TYPE_CHECKING:
    from app.models.meeting import Meeting
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

    meeting: Mapped[Meeting] = relationship(back_populates="comments")
    segment: Mapped[TranscriptSegment | None] = relationship(back_populates="comments")
    author: Mapped[User] = relationship()
    replies: Mapped[list[Comment]] = relationship(
        back_populates="parent", cascade="all, delete-orphan"
    )
    parent: Mapped[Comment | None] = relationship(back_populates="replies", remote_side=[id])

    def __repr__(self) -> str:
        return f"<Comment {self.id} m={self.meeting_id}>"
