"""Soundbite business logic (T-33.1, T-33.8).

The invariants the schema cannot express live here: the range must be
3 seconds to 3 minutes long, ordered, and inside the meeting it belongs to.
Each is a ValidationError at the boundary — the soundbites table carries the
same limits as check constraints (the API is not the only writer), and letting
one of those fire would turn a bad payload into a 500.

Deletion is HARD, unlike comments: a clip is a pointer into the transcript,
not authored content — nothing references it, and nothing is lost that two
integers cannot recreate. The model omits `SoftDeleteMixin` for the same
reason.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.ai import SegmentInput, Transcript
from app.core.exceptions import SoundbiteNotFoundError, ValidationError
from app.models import Soundbite, Speaker, TranscriptSegment
from app.schemas.soundbite import (
    SoundbiteListOut,
    SoundbiteOut,
    SoundbiteProposalListOut,
    SoundbiteProposalOut,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.ai import AIProvider
    from app.models import Meeting, User
    from app.schemas.soundbite import SoundbiteCreate

#: Mirrors the `soundbite_min_length` / `soundbite_max_length` check
#: constraints and the trimmer's limits (T-33.3).
MIN_DURATION_MS = 3_000
MAX_DURATION_MS = 180_000


class SoundbiteService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Reads ───────────────────────────────────────────────────────────

    def list_for(self, meeting: Meeting) -> SoundbiteListOut:
        """All clips of one meeting in timeline order — the flyout's list.

        Unpaginated by contract: clips are hand-picked moments, a handful per
        meeting, and the seekbar overlay (T-33.7) needs every one anyway.
        """
        soundbites = (
            self.db.execute(
                select(Soundbite)
                .where(Soundbite.meeting_id == meeting.id)
                .order_by(Soundbite.start_ms, Soundbite.id)
            )
            .scalars()
            .all()
        )
        return SoundbiteListOut(items=[self._to_out(soundbite) for soundbite in soundbites])

    def proposals(self, meeting: Meeting, provider: AIProvider) -> SoundbiteProposalListOut:
        """The provider's auto-clip candidates (T-33.8) — computed, not stored.

        Nothing is persisted: a proposal only becomes a row when the user
        saves it, which is a plain `create` with `auto_generated=True`.
        Determinism is the provider's contract (T29-A), so the same meeting
        always proposes the same three clips.
        """
        results = provider.propose_soundbites(self._transcript_for(meeting))
        return SoundbiteProposalListOut(
            items=[
                SoundbiteProposalOut(
                    title=result.title,
                    start_ms=result.start_ms,
                    end_ms=result.end_ms,
                    score=result.score,
                )
                for result in results
            ]
        )

    # ── Writes ──────────────────────────────────────────────────────────

    def create(self, meeting: Meeting, payload: SoundbiteCreate, *, creator: User) -> SoundbiteOut:
        self._validate_range(meeting, payload.start_ms, payload.end_ms)

        soundbite = Soundbite(
            meeting_id=meeting.id,
            created_by=creator.id,
            title=payload.title,
            start_ms=payload.start_ms,
            end_ms=payload.end_ms,
            auto_generated=payload.auto_generated,
        )
        self.db.add(soundbite)
        self.db.commit()
        self.db.refresh(soundbite)
        return self._to_out(soundbite)

    def delete(self, soundbite_id: int) -> None:
        soundbite = self.db.get(Soundbite, soundbite_id)
        if soundbite is None:
            raise SoundbiteNotFoundError()
        self.db.delete(soundbite)
        self.db.commit()

    # ── Guards ──────────────────────────────────────────────────────────

    def _validate_range(self, meeting: Meeting, start_ms: int, end_ms: int) -> None:
        duration = end_ms - start_ms
        if duration <= 0:
            raise ValidationError("A soundbite must end after it starts.")
        if duration < MIN_DURATION_MS:
            raise ValidationError("A soundbite must be at least 3 seconds long.")
        if duration > MAX_DURATION_MS:
            raise ValidationError("A soundbite cannot be longer than 3 minutes.")
        if end_ms > self._meeting_end_ms(meeting):
            raise ValidationError("A soundbite cannot extend past the end of the meeting.")

    def _meeting_end_ms(self, meeting: Meeting) -> int:
        """The meeting's true end in milliseconds.

        `duration_seconds` is a FLOORED denormalisation for display; a clip
        snapped to the final segment's real end can overshoot it by up to
        999ms. The transcript is the millisecond authority, so validate
        against MAX(end_ms) — falling back to the floored figure for a
        meeting without segments.
        """
        last_end = self.db.execute(
            select(func.max(TranscriptSegment.end_ms)).where(
                TranscriptSegment.meeting_id == meeting.id
            )
        ).scalar_one_or_none()
        return max(meeting.duration_seconds * 1000, last_end or 0)

    # ── Shaping ─────────────────────────────────────────────────────────

    def _to_out(self, soundbite: Soundbite) -> SoundbiteOut:
        return SoundbiteOut(
            id=soundbite.id,
            meeting_id=soundbite.meeting_id,
            title=soundbite.title,
            start_ms=soundbite.start_ms,
            end_ms=soundbite.end_ms,
            auto_generated=soundbite.auto_generated,
            created_at=soundbite.created_at,
        )

    def _transcript_for(self, meeting: Meeting) -> Transcript:
        """The transcript in the AI layer's shape — same join as
        `MeetingService._transcript_for_ai`, duplicated rather than reached
        into: a private method of another service is not an interface."""
        rows = self.db.execute(
            select(TranscriptSegment, Speaker.label)
            .join(Speaker, TranscriptSegment.speaker_id == Speaker.id)
            .where(TranscriptSegment.meeting_id == meeting.id)
            .order_by(TranscriptSegment.sequence)
        ).all()
        return Transcript(
            segments=[
                SegmentInput(
                    speaker=label,
                    text=segment.text,
                    start_ms=segment.start_ms,
                    end_ms=segment.end_ms,
                )
                for segment, label in rows
            ],
            reference_date=meeting.started_at.date() if meeting.started_at else None,
        )
