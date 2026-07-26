"""Extracted and manually-added tasks."""

from __future__ import annotations

from datetime import date, datetime
from typing import TYPE_CHECKING

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin
from app.models.enums import ActionItemSource, ActionItemStatus, enum_column

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.participant import Participant


class ActionItem(Base, TimestampMixin):
    """A commitment made during a meeting.

    A first-class table rather than a JSON array on `meetings`, because these
    are independently mutable — users check them off, reassign them, edit the
    text and change due dates, and the Notebook aggregates "N open" per meeting.
    A blob would make every one of those a read-modify-write of the whole array,
    with no way to index or count.
    """

    __tablename__ = "action_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )

    #: Nullable: the AI extractor frequently finds a commitment without being
    #: able to attribute it, and "Unassigned" is a real group in the UI.
    #:
    #: Note the invariant NOT enforced here — nothing at the database level
    #: guarantees this participant belongs to the same meeting. Expressing that
    #: needs a composite FK against (meeting_id, id), which means a composite
    #: unique key on participants purely to satisfy it. Enforced in the service
    #: layer and asserted in tests instead. See docs/schema.md.
    assignee_participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL"), nullable=True, index=True
    )

    text: Mapped[str] = mapped_column(Text, nullable=False)

    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    status: Mapped[ActionItemStatus] = mapped_column(
        enum_column(ActionItemStatus, "action_item_status"),
        nullable=False,
        default=ActionItemStatus.OPEN,
        index=True,
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    #: Whether the extractor produced this or a human typed it. Surfaced in the
    #: UI so an AI-guessed task is distinguishable from a deliberate one.
    source: Mapped[ActionItemSource] = mapped_column(
        enum_column(ActionItemSource, "action_item_source"),
        nullable=False,
        default=ActionItemSource.AI,
    )

    #: The moment in the recording where the commitment was made. Powers the
    #: "⏱ 18:42" chip that seeks the player (T-24.8) — traceability from a task
    #: back to the sentence that created it.
    start_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    sequence: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    meeting: Mapped[Meeting] = relationship(back_populates="action_items")
    assignee: Mapped[Participant | None] = relationship(back_populates="action_items")

    def __repr__(self) -> str:
        return f"<ActionItem {self.id} {self.status} {self.text[:32]!r}>"
