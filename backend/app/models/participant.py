"""Meeting attendance."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.enums import ParticipantRole, enum_column

if TYPE_CHECKING:
    from app.models.action_item import ActionItem
    from app.models.meeting import Meeting
    from app.models.speaker import Speaker
    from app.models.user import User


class Participant(Base):
    """A person's involvement in one specific meeting.

    Scoped per meeting rather than being a plain link to `users`, because most
    attendees of a real meeting have no account — an external client on a sales
    call is a name and maybe an email. `user_id` is therefore nullable, and
    `display_name` is the field that is always present.
    """

    __tablename__ = "participants"
    __table_args__ = (
        # One row per person per meeting. Names are the only reliable key when
        # there is no account behind them.
        UniqueConstraint("meeting_id", "display_name", name="uq_participants_meeting_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)

    role: Mapped[ParticipantRole] = mapped_column(
        enum_column(ParticipantRole, "participant_role"),
        nullable=False,
        default=ParticipantRole.ATTENDEE,
    )
    #: Invited but never showed up is a real and displayable state — the details
    #: drawer lists "Invited" and "Attended" separately (T-15.8/T-15.9).
    attended: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    #: DENORMALISED — SUM(end_ms - start_ms) over this person's segments.
    #:
    #: Powers the talk-time bars in the details drawer, which render for every
    #: attendee of every meeting the user opens. Computing live means a grouped
    #: aggregate over the full transcript per drawer open. Written at ingest by
    #: the same pass that computes `meetings.duration_seconds`.
    talk_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    meeting: Mapped[Meeting] = relationship(back_populates="participants")
    user: Mapped[User | None] = relationship(back_populates="participations")
    speaker: Mapped[Speaker | None] = relationship(back_populates="participant", uselist=False)
    action_items: Mapped[list[ActionItem]] = relationship(back_populates="assignee")

    def __repr__(self) -> str:
        return f"<Participant {self.id} {self.display_name!r} m={self.meeting_id}>"
