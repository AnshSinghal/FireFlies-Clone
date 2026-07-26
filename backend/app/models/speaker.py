"""Transcript speaker labels, and their resolution to real people."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.meeting import Meeting
    from app.models.participant import Participant
    from app.models.transcript import TranscriptSegment


class Speaker(Base):
    """A voice in the transcript.

    This table is the reason the schema survives a rename. A transcript arrives
    labelled `Speaker 1`, not `Priya Raman`, so segments point HERE rather than
    at a participant. Consequences:

    - Renaming a speaker is one UPDATE, not one per segment (T-25.7). A meeting
      with 1,200 segments renames in a single statement.
    - A speaker may stay unresolved (`participant_id IS NULL`) indefinitely
      without blocking playback, search or summarisation.
    - Two labels that turn out to be the same person can be merged by pointing
      both at one participant, without rewriting any segment.

    Collapsing this into `participants` would make every one of those a bulk
    rewrite of the transcript.
    """

    __tablename__ = "speakers"
    __table_args__ = (UniqueConstraint("meeting_id", "label", name="uq_speakers_meeting_label"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    meeting_id: Mapped[int] = mapped_column(
        ForeignKey("meetings.id", ondelete="CASCADE"), nullable=False, index=True
    )
    participant_id: Mapped[int | None] = mapped_column(
        ForeignKey("participants.id", ondelete="SET NULL"), nullable=True, index=True
    )

    label: Mapped[str] = mapped_column(String(120), nullable=False)

    #: AUTHORITATIVE speaker colour (resolves open decision #1 from T-01).
    #:
    #: An index into the eight-hue palette in tokens.css, computed once at
    #: ingest by hashing the label with the same FNV-1a used by the frontend's
    #: getSpeakerColor(). Stored rather than recomputed so the colour is stable
    #: even if the hash implementation is ever tuned, and so the transcript,
    #: outline, avatars and talk-time bars cannot disagree. The frontend hashes
    #: locally ONLY for previews of transcripts that are not yet saved.
    color_index: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    meeting: Mapped[Meeting] = relationship(back_populates="speakers")
    participant: Mapped[Participant | None] = relationship(back_populates="speaker")
    segments: Mapped[list[TranscriptSegment]] = relationship(back_populates="speaker")

    @property
    def display_name(self) -> str:
        """The resolved person's name, falling back to the raw label."""
        return self.participant.display_name if self.participant else self.label

    def __repr__(self) -> str:
        return f"<Speaker {self.id} {self.label!r} m={self.meeting_id}>"
