"""Character-range highlights and segment bookmarks (bonus T-32)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    ForeignKey,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import HighlightColor, enum_column

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.transcript import TranscriptSegment
    from app.models.user import User


class Highlight(Base, TimestampMixin):
    """A coloured range within one segment's text.

    Stored as CHARACTER OFFSETS rather than a copy of the highlighted string, so
    the highlight survives re-render and virtualisation and can be merged with
    search marks into one non-overlapping span list (T-32.4). Storing the text
    would make it impossible to know where to paint it.

    Offsets are relative to the segment's current text; editing that text
    invalidates them, which the service handles explicitly rather than rendering
    a garbled range.
    """

    __tablename__ = "highlights"
    __table_args__ = (
        CheckConstraint("end_offset > start_offset", name="highlight_range_non_empty"),
        CheckConstraint("start_offset >= 0", name="highlight_start_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    #: Denormalised from the segment purely so "all highlights for this meeting"
    #: is one indexed lookup rather than a join through the transcript.
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    segment_id: Mapped[int] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    start_offset: Mapped[int] = mapped_column(Integer, nullable=False)
    end_offset: Mapped[int] = mapped_column(Integer, nullable=False)

    color: Mapped[HighlightColor] = mapped_column(
        enum_column(HighlightColor, "highlight_color"),
        nullable=False,
        default=HighlightColor.AMBER,
    )
    note: Mapped[str | None] = mapped_column(Text, nullable=True)

    meeting: Mapped[Meeting] = relationship(back_populates="highlights")
    segment: Mapped[TranscriptSegment] = relationship(back_populates="highlights")
    creator: Mapped[User] = relationship()

    def __repr__(self) -> str:
        span = f"[{self.start_offset}:{self.end_offset}]"
        return f"<Highlight {self.id} seg={self.segment_id} {span}>"


class Bookmark(Base, TimestampMixin):
    """A starred segment.

    Distinct from a highlight: a highlight marks a character range and carries a
    colour, a bookmark marks a whole moment. Conflating them would mean a
    nullable offset pair and a "kind" discriminator on every row, for two
    features that share nothing but a foreign key.
    """

    __tablename__ = "bookmarks"
    __table_args__ = (
        UniqueConstraint("segment_id", "created_by", name="uq_bookmarks_segment_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    segment_id: Mapped[int] = mapped_column(
        ForeignKey("transcript_segments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    def __repr__(self) -> str:
        return f"<Bookmark seg={self.segment_id}>"
