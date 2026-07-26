"""Tags and the meeting↔tag association (bonus T-36)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, String, Table, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.meeting import Meeting


#: Pure association table — no payload of its own, so it stays a Core Table
#: rather than a mapped class. A composite primary key makes the pairing unique
#: for free, and both sides cascade so deleting either end cannot orphan a row.
meeting_tags = Table(
    "meeting_tags",
    Base.metadata,
    Column("meeting_id", ForeignKey("meetings.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base, TimestampMixin):
    """A cross-meeting label.

    Names are stored WITHOUT a leading `#`; the glyph is added at render time.
    Storing it would make `sales`, `#sales` and `#Sales` three distinct tags,
    which is precisely the mess T-36.10 exists to prevent.
    """

    __tablename__ = "tags"
    __table_args__ = (UniqueConstraint("name", name="uq_tags_name"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(24), nullable=False)
    #: Deterministic from the name via the same hash as speaker colours, but
    #: stored so a rename does not silently recolour the tag everywhere.
    color: Mapped[str] = mapped_column(String(20), nullable=False, default="0")

    meetings: Mapped[list[Meeting]] = relationship(secondary=meeting_tags, back_populates="tags")

    def __repr__(self) -> str:
        return f"<Tag {self.name!r}>"
