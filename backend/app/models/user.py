"""Application users."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.participant import Participant


class User(Base, TimestampMixin):
    """A person with an account.

    Authentication is out of scope (see README): `get_current_user` returns the
    seeded default user. This table exists anyway so that authorship, hosting
    and participation are real foreign keys rather than free text — swapping in
    real auth then touches one dependency, not every query.
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    avatar_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    hosted_meetings: Mapped[list[Meeting]] = relationship(
        back_populates="host",
        foreign_keys="Meeting.host_id",
        # A user is never deleted in this build, and if they were we would want
        # their meetings to survive reassignment rather than vanish.
        passive_deletes=True,
    )
    participations: Mapped[list[Participant]] = relationship(back_populates="user")

    def __repr__(self) -> str:
        return f"<User {self.id} {self.email}>"
