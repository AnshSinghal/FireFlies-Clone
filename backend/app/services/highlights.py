"""Highlight & bookmark business logic (T-32).

The invariants the schema cannot express live here: the segment must belong to
the highlighted meeting, the range must fit the segment's CURRENT text, and a
text edit invalidates the ranges over it (T-32.11) — deleted rather than
recomputed, because offsets into a sentence that no longer exists are not
recoverable, and a garbled range is worse than a vanished one.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import delete, select
from sqlalchemy.orm import selectinload

from app.core.exceptions import HighlightNotFoundError, ValidationError
from app.models import Bookmark, Highlight, TranscriptSegment
from app.schemas.highlight import BookmarkOut, HighlightOut

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models import Meeting, User
    from app.schemas.highlight import HighlightCreate, HighlightUpdate

#: Bookmark snippets are recognisers, not transcripts — one line is plenty.
_SNIPPET_MAX = 140


class HighlightService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Highlights ──────────────────────────────────────────────────────

    def list_highlights(self, meeting: Meeting) -> list[HighlightOut]:
        """Every highlight, transcript order — the flyout groups by colour
        client-side, and a meeting has dozens of highlights at most."""
        rows = (
            self.db.execute(
                select(Highlight)
                .where(Highlight.meeting_id == meeting.id)
                .options(selectinload(Highlight.segment).selectinload(TranscriptSegment.speaker))
            )
            .scalars()
            .all()
        )
        out = [self._to_out(row) for row in rows]
        out.sort(key=lambda h: (h.start_ms, h.start_offset, h.id))
        return out

    def create(self, meeting: Meeting, payload: HighlightCreate, *, author: User) -> HighlightOut:
        segment = self._segment_of(meeting, payload.segment_id)

        if payload.end_offset > len(segment.text):
            # The client selected against text the server no longer has —
            # a stale tab, or a race with an edit. Refuse loudly.
            raise ValidationError(
                "That range does not fit the segment's text.",
                details={"segment_length": len(segment.text)},
            )

        highlight = Highlight(
            meeting_id=meeting.id,
            segment_id=segment.id,
            created_by=author.id,
            start_offset=payload.start_offset,
            end_offset=payload.end_offset,
            color=payload.color,
            note=payload.note,
        )
        self.db.add(highlight)
        self.db.commit()
        self.db.refresh(highlight)
        return self._to_out(highlight)

    def update(
        self, highlight_id: int, payload: HighlightUpdate, *, fields_set: set[str]
    ) -> HighlightOut:
        highlight = self._get(highlight_id)

        if payload.color is not None:
            highlight.color = payload.color
        if "note" in fields_set:
            # Explicit null CLEARS; an absent field leaves the note alone.
            highlight.note = payload.note

        self.db.commit()
        self.db.refresh(highlight)
        return self._to_out(highlight)

    def remove(self, highlight_id: int) -> None:
        self.db.delete(self._get(highlight_id))
        self.db.commit()

    def invalidate_for_segment(self, segment_id: int) -> None:
        """Drop every highlight on a segment whose text just changed (T-32.11).

        Called by the transcript service INSIDE its edit transaction, so an
        edit and its invalidation commit or fail together.
        """
        self.db.execute(delete(Highlight).where(Highlight.segment_id == segment_id))

    # ── Bookmarks ───────────────────────────────────────────────────────

    def list_bookmarks(self, meeting: Meeting) -> list[BookmarkOut]:
        rows = (
            self.db.execute(
                select(Bookmark)
                .where(Bookmark.meeting_id == meeting.id, Bookmark.is_active.is_(True))
                .options(selectinload(Bookmark.segment).selectinload(TranscriptSegment.speaker))
            )
            .scalars()
            .all()
        )
        out = [self._bookmark_out(row) for row in rows]
        out.sort(key=lambda b: (b.start_ms, b.id))
        return out

    def set_bookmark(self, meeting: Meeting, segment_id: int, *, user: User) -> BookmarkOut:
        """Idempotent PUT: bookmarking a bookmarked segment is a no-op, not
        an error — the unique constraint makes the row single, `is_active`
        makes the toggle cheap."""
        segment = self._segment_of(meeting, segment_id)
        existing = self._bookmark_row(segment.id, user)

        if existing is None:
            existing = Bookmark(
                meeting_id=meeting.id,
                segment_id=segment.id,
                created_by=user.id,
                is_active=True,
            )
            self.db.add(existing)
        else:
            existing.is_active = True

        self.db.commit()
        self.db.refresh(existing)
        return self._bookmark_out(existing)

    def clear_bookmark(self, meeting: Meeting, segment_id: int, *, user: User) -> None:
        """Idempotent DELETE: un-bookmarking a plain segment succeeds silently."""
        segment = self._segment_of(meeting, segment_id)
        existing = self._bookmark_row(segment.id, user)
        if existing is not None and existing.is_active:
            existing.is_active = False
            self.db.commit()

    # ── Guards ──────────────────────────────────────────────────────────

    def _get(self, highlight_id: int) -> Highlight:
        highlight = self.db.get(Highlight, highlight_id)
        if highlight is None:
            raise HighlightNotFoundError(details={"highlight_id": highlight_id})
        return highlight

    def _segment_of(self, meeting: Meeting, segment_id: int) -> TranscriptSegment:
        segment = self.db.get(TranscriptSegment, segment_id)
        if segment is None or segment.meeting_id != meeting.id:
            raise ValidationError("That segment is not part of this meeting.")
        return segment

    def _bookmark_row(self, segment_id: int, user: User) -> Bookmark | None:
        return self.db.execute(
            select(Bookmark).where(
                Bookmark.segment_id == segment_id, Bookmark.created_by == user.id
            )
        ).scalar_one_or_none()

    # ── Shaping ─────────────────────────────────────────────────────────

    def _to_out(self, highlight: Highlight) -> HighlightOut:
        segment = highlight.segment
        return HighlightOut(
            id=highlight.id,
            segment_id=segment.id,
            start_ms=segment.start_ms,
            speaker=segment.speaker.label,
            start_offset=highlight.start_offset,
            end_offset=highlight.end_offset,
            color=highlight.color,
            note=highlight.note,
            # Sliced at READ time: if this ever comes back empty or odd, the
            # offsets have drifted from the text — visible, not garbled.
            text=segment.text[highlight.start_offset : highlight.end_offset],
            created_at=highlight.created_at,
        )

    def _bookmark_out(self, bookmark: Bookmark) -> BookmarkOut:
        segment = bookmark.segment
        return BookmarkOut(
            id=bookmark.id,
            segment_id=segment.id,
            start_ms=segment.start_ms,
            speaker=segment.speaker.label,
            snippet=_clip(segment.text, _SNIPPET_MAX),
            created_at=bookmark.created_at,
        )


def _clip(text: str, limit: int) -> str:
    """Whole-word clip with an ellipsis, mirroring the ask service's."""
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0]
    return f"{cut}…"
