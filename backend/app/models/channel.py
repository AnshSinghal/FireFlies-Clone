"""Channels — the sidebar's meeting groupings (bonus)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.meeting import Meeting


class Channel(Base, TimestampMixin):
    """A named collection of meetings.

    A meeting belongs to at most ONE channel but may carry many tags — that
    asymmetry is the whole distinction between the two, and it is why channels
    are a foreign key on `meetings` while tags are a join table.
    """

    __tablename__ = "channels"
    __table_args__ = (UniqueConstraint("slug", name="uq_channels_slug"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    #: URL-safe key. The Notebook filters via ?channel=<slug>, so this is what
    #: makes a channel view shareable.
    slug: Mapped[str] = mapped_column(String(80), nullable=False)
    is_private: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    #: Lucide icon name, not a glyph — the design system bans emoji as icons.
    icon: Mapped[str | None] = mapped_column(String(40), nullable=True)

    meetings: Mapped[list[Meeting]] = relationship(back_populates="channel")

    def __repr__(self) -> str:
        return f"<Channel {self.slug!r}>"
