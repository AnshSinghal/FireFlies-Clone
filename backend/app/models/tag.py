"""Tags and the meeting↔tag association (bonus T-36)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Column, ForeignKey, Index, String, Table, UniqueConstraint, text
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
    __table_args__ = (
        UniqueConstraint("name", name="uq_tags_name"),
        # The T-36.10 rule ("Sales" vs "sales" is a duplicate) enforced in the
        # DATABASE, not just the service: SQLite's default collation is BINARY,
        # so `uq_tags_name` alone happily stores both spellings. A functional
        # index over lower(name) closes the race two concurrent creates would
        # otherwise win together; the service check exists on top of it purely
        # to turn the failure into a 409 that names the existing tag.
        Index("uq_tags_name_lower", text("lower(name)"), unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(24), nullable=False)
    #: Palette slot 0-7, NULL meaning "derive from the name" — the client runs
    #: the speaker-colour hash over the name when this is null, so a brand-new
    #: tag is coloured without a round trip. Set explicitly only by a recolour
    #: in settings, and stored so THAT choice survives a rename (T-36.6).
    color_index: Mapped[int | None] = mapped_column(nullable=True, default=None)

    meetings: Mapped[list[Meeting]] = relationship(secondary=meeting_tags, back_populates="tags")

    def __repr__(self) -> str:
        return f"<Tag {self.name!r}>"
