"""Transcript reads and edits (T-17.2 to T-17.6).

Split out of `MeetingService` because it is a different concern with different
performance characteristics: everything here is shaped by the fact that one
meeting holds ~1,200 rows.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from sqlalchemy import func, select, update
from sqlalchemy.orm import selectinload

from app.core.exceptions import SegmentNotFoundError, SpeakerNotFoundError, ValidationError
from app.models import Speaker, TranscriptSegment
from app.schemas.common import MatchRange
from app.schemas.transcript import (
    SegmentOut,
    SegmentUpdate,
    SpeakerRef,
    SpeakerUpdate,
    TranscriptPage,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

#: One page. Large enough that a 55-minute meeting is six requests rather than
#: sixty, small enough that the first paint is not waiting on 400KB of text.
DEFAULT_PAGE_SIZE = 200
MAX_PAGE_SIZE = 500


class TranscriptService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def page(
        self,
        meeting_id: int,
        *,
        cursor: int | None = None,
        limit: int = DEFAULT_PAGE_SIZE,
        query: str | None = None,
    ) -> TranscriptPage:
        """A page of segments, ordered by `sequence`.

        CURSOR pagination on `sequence`, not offset. Offset pagination re-scans
        every skipped row, and — worse — shifts under concurrent edits, so a
        segment inserted while the client is paging is either duplicated or
        skipped. A cursor names a position rather than a count.
        """
        limit = max(1, min(limit, MAX_PAGE_SIZE))

        stmt = select(TranscriptSegment).where(TranscriptSegment.meeting_id == meeting_id)
        if cursor is not None:
            stmt = stmt.where(TranscriptSegment.sequence > cursor)

        term = (query or "").strip()
        if term:
            # Server-side search, so a long meeting does not have to be fully
            # downloaded before it can be searched (T-17.3). Literal, not a
            # pattern: `autoescape` keeps `%` and `_` as characters.
            stmt = stmt.where(TranscriptSegment.text.icontains(term, autoescape=True))

        rows = list(
            self.db.execute(stmt.order_by(TranscriptSegment.sequence).limit(limit + 1)).scalars()
        )

        # One row over the limit tells us whether there is a next page without
        # a second COUNT query.
        has_more = len(rows) > limit
        rows = rows[:limit]

        return TranscriptPage(
            segments=[self._to_segment(row, term) for row in rows],
            speakers=self._speakers_for(rows),
            next_cursor=rows[-1].sequence if has_more and rows else None,
            total=self._total(meeting_id, term),
        )

    def _total(self, meeting_id: int, term: str) -> int:
        stmt = (
            select(func.count())
            .select_from(TranscriptSegment)
            .where(TranscriptSegment.meeting_id == meeting_id)
        )
        if term:
            # The total describes the SEARCH when there is one — "12 matches",
            # not "1,200 segments" — which is what the find bar counts.
            stmt = stmt.where(TranscriptSegment.text.icontains(term, autoescape=True))
        return int(self.db.execute(stmt).scalar_one())

    def _speakers_for(self, rows: list[TranscriptSegment]) -> list[SpeakerRef]:
        """The distinct speakers on this page, fetched in one statement."""
        ids = {row.speaker_id for row in rows}
        if not ids:
            return []

        speakers = self.db.execute(select(Speaker).where(Speaker.id.in_(ids))).scalars()
        return [SpeakerRef.model_validate(speaker) for speaker in speakers]

    @staticmethod
    def _to_segment(row: TranscriptSegment, term: str) -> SegmentOut:
        return SegmentOut(
            id=row.id,
            sequence=row.sequence,
            start_ms=row.start_ms,
            end_ms=row.end_ms,
            speaker_id=row.speaker_id,
            text=row.text,
            is_edited=row.is_edited,
            matches=_find_ranges(row.text, term) if term else None,
        )

    # ── Edits ───────────────────────────────────────────────────────────────

    def update_segment(self, segment_id: int, payload: SegmentUpdate) -> SegmentOut:
        """Edit a line's text and/or reassign its speaker (T-17.5).

        Three side effects, all of them load-bearing:

        - `is_edited` is set, so the UI can mark corrected lines.
        - `original_text` is captured ONCE, so an edit is reversible and a
          second edit does not overwrite the original with the first edit.
        - The summary is marked stale, because a summary derived from text that
          has since changed is worse than no summary — it is confidently wrong.

        The FTS index needs no explicit maintenance: it is kept by triggers on
        `transcript_segments`, which fire on this UPDATE.
        """
        segment = self.db.get(TranscriptSegment, segment_id)
        if segment is None:
            raise SegmentNotFoundError(details={"segment_id": segment_id})

        if payload.speaker_id is not None:
            speaker = self.db.get(Speaker, payload.speaker_id)
            # Cross-meeting reassignment would silently corrupt both meetings'
            # transcripts, and the id is client-supplied.
            if speaker is None or speaker.meeting_id != segment.meeting_id:
                raise ValidationError(
                    "That speaker does not belong to this meeting",
                    details={"speaker_id": payload.speaker_id},
                )
            segment.speaker_id = payload.speaker_id

        if payload.text is not None and payload.text != segment.text:
            if segment.original_text is None:
                segment.original_text = segment.text
            segment.text = payload.text
            segment.is_edited = True

            if segment.meeting.summary is not None:
                segment.meeting.summary.is_stale = True

        self.db.commit()
        self.db.refresh(segment)
        return self._to_segment(segment, "")

    def rename_speaker(self, speaker_id: int, payload: SpeakerUpdate) -> SpeakerRef:
        """Rename a speaker across the whole meeting (T-17.6).

        ONE statement, not one per segment. The label lives on `speakers` and
        segments reference it, so a rename is a single UPDATE however long the
        transcript is — which is the reason the schema is shaped that way.
        """
        speaker = self.db.get(Speaker, speaker_id)
        if speaker is None:
            raise SpeakerNotFoundError(details={"speaker_id": speaker_id})

        values: dict[str, object] = {}
        if payload.label is not None:
            values["label"] = payload.label
        if payload.participant_id is not None:
            values["participant_id"] = payload.participant_id

        if values:
            self.db.execute(update(Speaker).where(Speaker.id == speaker_id).values(**values))
            self.db.commit()
            self.db.refresh(speaker)

        return SpeakerRef.model_validate(speaker)

    def speakers(self, meeting_id: int) -> list[SpeakerRef]:
        rows = self.db.execute(
            select(Speaker)
            .where(Speaker.meeting_id == meeting_id)
            .order_by(Speaker.id)
            .options(selectinload(Speaker.participant))
        ).scalars()
        return [SpeakerRef.model_validate(row) for row in rows]


def _find_ranges(text: str, term: str) -> list[MatchRange]:
    """Case-insensitive literal match offsets.

    `re.escape` because a user searching for `c++` means those characters.
    Compiling input as a pattern is both wrong and a way to hang the server on
    a pathological expression.
    """
    return [
        MatchRange(start=m.start(), end=m.end())
        for m in re.finditer(re.escape(term), text, re.IGNORECASE)
    ]
