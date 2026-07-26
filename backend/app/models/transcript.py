"""Transcript segments — the largest table in the schema."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.comment import Comment
    from app.models.highlight import Highlight
    from app.models.meeting import Meeting
    from app.models.speaker import Speaker


class TranscriptSegment(Base, TimestampMixin):
    """One speaker turn.

    A 55-minute meeting is roughly 1,200 of these, so this is where index choice
    and payload size actually matter. Note what is NOT here: no speaker name, no
    formatted timestamp, no denormalised meeting title. Segments carry ids and
    integers; everything else is joined or formatted at the edge.
    """

    __tablename__ = "transcript_segments"
    __table_args__ = (
        # Ordering integrity. A duplicate sequence within a meeting is a corrupt
        # transcript, not a recoverable state — fail the insert.
        UniqueConstraint("meeting_id", "sequence", name="uq_segments_meeting_sequence"),
        # Serves both the transcript window query and the active-segment lookup
        # that drives player sync (T-21).
        Index("ix_segments_meeting_start", "meeting_id", "start_ms"),
        # Zero-length or reversed segments break the binary search in T-21.3 and
        # would render as a nonsensical timestamp. Reject at the boundary.
        CheckConstraint("end_ms >= start_ms", name="segment_end_after_start"),
        CheckConstraint("start_ms >= 0", name="segment_start_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    speaker_id: Mapped[int] = mapped_column(
        ForeignKey("speakers.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: INTEGER MILLISECONDS. Never a float, never "00:04:32" (T-03.10).
    #: Integers make the ordering total and the binary search in T-21.3 exact;
    #: formatting happens once, at the presentation edge.
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)

    #: Position within the meeting. Distinct from start_ms because two segments
    #: can share a timestamp when speakers overlap, and ordering must still be
    #: deterministic.
    sequence: Mapped[int] = mapped_column(Integer, nullable=False)

    text: Mapped[str] = mapped_column(Text, nullable=False)

    #: ASR confidence, when the source provided one. Null for hand-authored and
    #: pasted transcripts — which is most of them in this build.
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    is_edited: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Captured on the FIRST edit only, so "revert to original" (T-25.4) has
    #: something to revert to. Null means never edited.
    original_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    meeting: Mapped[Meeting] = relationship(back_populates="segments")
    speaker: Mapped[Speaker] = relationship(back_populates="segments")

    comments: Mapped[list[Comment]] = relationship(
        back_populates="segment", cascade="all, delete-orphan"
    )
    highlights: Mapped[list[Highlight]] = relationship(
        back_populates="segment", cascade="all, delete-orphan"
    )

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def __repr__(self) -> str:
        return f"<Segment m={self.meeting_id} #{self.sequence} @{self.start_ms}ms>"
