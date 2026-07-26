"""Extracted keyword terms."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Float, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.meeting import Meeting


class Keyword(Base):
    """A salient term for one meeting.

    Relational rather than a JSON array because `weight` drives ordering (the UI
    shows the top six), and because keyword-based filtering across meetings
    needs an index to be worth having.
    """

    __tablename__ = "keywords"
    __table_args__ = (UniqueConstraint("meeting_id", "term", name="uq_keywords_meeting_term"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )

    term: Mapped[str] = mapped_column(String(80), nullable=False)
    #: TF-IDF score from the extractor. Ordering only — never shown.
    weight: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    meeting: Mapped[Meeting] = relationship(back_populates="keywords")

    def __repr__(self) -> str:
        return f"<Keyword {self.term!r} w={self.weight:.3f}>"
