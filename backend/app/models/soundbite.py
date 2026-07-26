"""Shareable clips (bonus T-33)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, CheckConstraint, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.user import User


class Soundbite(Base, TimestampMixin):
    """A named time range within a meeting.

    Stores only the range, never an extracted audio file. The player enforces
    the boundaries at playback time (T-33.6), so a clip costs two integers
    instead of a rendered artefact that would need regenerating whenever the
    range is trimmed.
    """

    __tablename__ = "soundbites"
    __table_args__ = (
        CheckConstraint("end_ms > start_ms", name="soundbite_range_non_empty"),
        # 3s minimum / 3min maximum, matching the trimmer's limits (T-33.3).
        # Enforced here too because the API is not the only writer — the mock
        # provider proposes auto-clips.
        CheckConstraint("end_ms - start_ms >= 3000", name="soundbite_min_length"),
        CheckConstraint("end_ms - start_ms <= 180000", name="soundbite_max_length"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_by: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    start_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    end_ms: Mapped[int] = mapped_column(Integer, nullable=False)

    #: Proposed by the extractor rather than made by a human. Rendered with an
    #: "Auto" badge so the two are never confused (T-33.8).
    auto_generated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    meeting: Mapped[Meeting] = relationship(back_populates="soundbites")
    creator: Mapped[User] = relationship()

    @property
    def duration_ms(self) -> int:
        return self.end_ms - self.start_ms

    def __repr__(self) -> str:
        return f"<Soundbite {self.id} {self.title!r} {self.duration_ms}ms>"
