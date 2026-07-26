"""The aggregate root: a meeting and everything hanging off it."""

from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    select,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import Select

from app.db.base import Base, SoftDeleteMixin, TimestampMixin
from app.models.enums import (
    MediaType,
    MeetingSource,
    ProcessingStatus,
    Visibility,
    enum_column,
)
from app.models.tag import meeting_tags

if TYPE_CHECKING:
    from app.models.action_item import ActionItem
    from app.models.channel import Channel
    from app.models.comment import Comment
    from app.models.highlight import Highlight
    from app.models.keyword import Keyword
    from app.models.participant import Participant
    from app.models.soundbite import Soundbite
    from app.models.speaker import Speaker
    from app.models.summary import Summary
    from app.models.tag import Tag
    from app.models.transcript import TranscriptSegment
    from app.models.user import User


class Meeting(Base, TimestampMixin, SoftDeleteMixin):
    """A recorded conversation.

    Everything a meeting owns cascades from here: segments, speakers,
    participants, the summary, keywords, action items and the bonus-feature
    rows. Deleting a meeting from the API is *soft* (see `deleted_at`); the
    cascades below only fire on a genuine row delete, which is what the
    admin/reset paths and the tests use.
    """

    __tablename__ = "meetings"
    __table_args__ = (
        # The Notebook's default sort. SQLite reads an ASC index backwards
        # efficiently, so a plain index serves ORDER BY started_at DESC.
        Index("ix_meetings_started_at", "started_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    #: DENORMALISED — derived from MAX(transcript_segments.end_ms) at ingest.
    #:
    #: The Notebook renders 20 meetings per page and shows a duration on every
    #: row. Computing it live means 20 aggregates over ~400 segments each, per
    #: page render, for a value that cannot change after ingest: editing a
    #: segment's text does not move its timings. Written by the seeder and the
    #: upload parser; never by a reader.
    duration_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    host_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    channel_id: Mapped[int | None] = mapped_column(
        ForeignKey("channels.id", ondelete="SET NULL"), nullable=True, index=True
    )

    media_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    media_type: Mapped[MediaType] = mapped_column(
        enum_column(MediaType, "media_type"),
        nullable=False,
        default=MediaType.NONE,
    )

    language: Mapped[str] = mapped_column(String(10), nullable=False, default="en")
    source: Mapped[MeetingSource] = mapped_column(
        enum_column(MeetingSource, "meeting_source"),
        nullable=False,
        default=MeetingSource.UPLOAD,
    )
    visibility: Mapped[Visibility] = mapped_column(
        enum_column(Visibility, "visibility"),
        nullable=False,
        default=Visibility.PRIVATE,
    )
    processing_status: Mapped[ProcessingStatus] = mapped_column(
        enum_column(ProcessingStatus, "processing_status"),
        nullable=False,
        default=ProcessingStatus.READY,
    )

    #: Stable key for idempotent seeding (T-05.9) — re-running the seeder upserts
    #: on this rather than inserting duplicates.
    seed_key: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True)

    # ── Relationships ───────────────────────────────────────────────────────
    #
    # Lazy strategy matters more here than anywhere else in the schema. The
    # transcript is the N+1 landmine: `selectin` fetches every meeting's
    # segments in ONE additional query keyed by meeting id, instead of one query
    # per meeting. `select` (the default) would issue 20 extra queries to render
    # a page of the Notebook.
    #
    # `delete-orphan` means detaching a child from the collection deletes it,
    # which is what "remove this action item" should mean.

    host: Mapped[User] = relationship(back_populates="hosted_meetings", foreign_keys=[host_id])
    channel: Mapped[Channel | None] = relationship(back_populates="meetings")

    participants: Mapped[list[Participant]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Participant.id",
    )
    # ── LAZY, deliberately ──────────────────────────────────────────────────
    #
    # These three were `lazy="selectin"` like the rest, and it made every
    # meetings-list query load the ENTIRE transcript: ~1,200 segments per
    # meeting, twenty meetings per page. The response schema does not include
    # them, so the cost was completely invisible in the output — the only way to
    # see it was to count statements (T11-L).
    #
    # That is the deduction T-04.4 warns about, arriving through the back door.
    # Callers that genuinely need them (`to_detail`, the transcript endpoints,
    # the seeder) opt in with `selectinload`.
    speakers: Mapped[list[Speaker]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="Speaker.id",
    )
    segments: Mapped[list[TranscriptSegment]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="TranscriptSegment.sequence",
    )
    summary: Mapped[Summary | None] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        uselist=False,
        lazy="selectin",
    )
    keywords: Mapped[list[Keyword]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Keyword.weight.desc()",
    )
    # Also lazy: the list row needs COUNTS, which come from one grouped
    # aggregate, not from loading every task on every row.
    action_items: Mapped[list[ActionItem]] = relationship(
        back_populates="meeting",
        cascade="all, delete-orphan",
        order_by="ActionItem.sequence",
    )
    tags: Mapped[list[Tag]] = relationship(
        secondary=meeting_tags,
        back_populates="meetings",
        lazy="selectin",
    )

    # Bonus features (Phase 6). Lazy by default — the Notebook never needs them.
    comments: Mapped[list[Comment]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    highlights: Mapped[list[Highlight]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )
    soundbites: Mapped[list[Soundbite]] = relationship(
        back_populates="meeting", cascade="all, delete-orphan"
    )

    # ── Query helpers ───────────────────────────────────────────────────────

    @classmethod
    def not_deleted(cls) -> Select[tuple[Meeting]]:
        """The only sanctioned way to start a meetings query (T-03.6).

        Every list, detail and search path must exclude soft-deleted rows, and
        `WHERE deleted_at IS NULL` written by hand at twenty call sites will be
        forgotten at the twenty-first. Start from here instead.
        """
        return select(cls).where(cls.deleted_at.is_(None))

    def __repr__(self) -> str:
        return f"<Meeting {self.id} {self.title!r}>"
