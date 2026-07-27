"""Highlights and bookmarks (T-32).

The interesting problem here is not storage, it is SURVIVAL: a highlight is a
pair of character offsets into text the user is also allowed to edit. Editing
the segment moves every offset after the edit point, and a naive implementation
paints the highlight over the wrong characters — the "garbled range" T-32.11
exists to forbid.

`remap_after_edit` is the answer, and it is called from `TranscriptService`
while both the old and the new text are still in hand. Nothing else can do it:
once the UPDATE has committed, the information needed to relocate the range is
gone.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import delete as sql_delete
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.exceptions import (
    BookmarkNotFoundError,
    HighlightNotFoundError,
    SegmentNotFoundError,
    ValidationError,
)
from app.models import Bookmark, Highlight, Speaker, TranscriptSegment
from app.schemas.highlight import (
    BookmarkOut,
    BookmarkToggleOut,
    HighlightCreate,
    HighlightOut,
    HighlightUpdate,
)

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.models import User

#: How much of the segment a flyout row shows. The card clamps to two lines;
#: shipping 900 characters to render 90 of them is payload nobody reads.
SNIPPET_CHARS = 180


def _snippet(text: str) -> str:
    if len(text) <= SNIPPET_CHARS:
        return text
    # Cut on a word boundary where there is one nearby, so the ellipsis does not
    # land mid-word.
    cut = text.rfind(" ", 0, SNIPPET_CHARS)
    return f"{text[: cut if cut > SNIPPET_CHARS - 30 else SNIPPET_CHARS].rstrip()}…"


class HighlightService:
    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Highlights ──────────────────────────────────────────────────────────

    def list_highlights(self, meeting_id: int) -> list[HighlightOut]:
        """Every highlight in a meeting, in reading order.

        ONE query with two joins rather than a loop over highlights fetching
        each segment — the flyout groups by colour but the seekbar and the
        transcript both want the whole set, and this is the only place it is
        assembled.
        """
        rows = self.db.execute(
            select(Highlight, TranscriptSegment, Speaker)
            .join(TranscriptSegment, Highlight.segment_id == TranscriptSegment.id)
            .join(Speaker, TranscriptSegment.speaker_id == Speaker.id)
            .where(Highlight.meeting_id == meeting_id)
            .order_by(TranscriptSegment.sequence, Highlight.start_offset)
        ).all()

        return [self._to_highlight(h, segment, speaker) for h, segment, speaker in rows]

    def create_highlight(
        self, meeting_id: int, user: User, payload: HighlightCreate
    ) -> HighlightOut:
        segment = self._segment_in(meeting_id, payload.segment_id)

        # Offsets are client-supplied and describe text the client may hold a
        # stale copy of. Clamping rather than trusting means a race with an edit
        # produces a slightly short highlight, not one that indexes past the end
        # of the string.
        start = min(payload.start_offset, len(segment.text))
        end = min(payload.end_offset, len(segment.text))
        if end <= start:
            raise ValidationError(
                "That range is empty against the current segment text",
                details={"start_offset": payload.start_offset, "end_offset": payload.end_offset},
            )

        highlight = Highlight(
            meeting_id=meeting_id,
            segment_id=segment.id,
            created_by=user.id,
            start_offset=start,
            end_offset=end,
            color=payload.color,
            note=payload.note or None,
        )
        self.db.add(highlight)
        self.db.commit()
        self.db.refresh(highlight)

        return self._to_highlight(highlight, segment, self._speaker(segment))

    def update_highlight(
        self, meeting_id: int, highlight_id: int, payload: HighlightUpdate
    ) -> HighlightOut:
        highlight = self._highlight_in(meeting_id, highlight_id)

        if payload.color is not None:
            highlight.color = payload.color
        # `model_fields_set` rather than `is not None`: the popover clears a note
        # by sending `null`, and "omitted" has to stay distinguishable from
        # "explicitly emptied".
        if "note" in payload.model_fields_set:
            highlight.note = payload.note or None

        self.db.commit()
        self.db.refresh(highlight)

        segment = highlight.segment
        return self._to_highlight(highlight, segment, self._speaker(segment))

    def delete_highlight(self, meeting_id: int, highlight_id: int) -> None:
        highlight = self._highlight_in(meeting_id, highlight_id)
        self.db.delete(highlight)
        self.db.commit()

    # ── Bookmarks ───────────────────────────────────────────────────────────

    def list_bookmarks(self, meeting_id: int, user: User) -> list[BookmarkOut]:
        rows = self.db.execute(
            select(Bookmark, TranscriptSegment, Speaker)
            .join(TranscriptSegment, Bookmark.segment_id == TranscriptSegment.id)
            .join(Speaker, TranscriptSegment.speaker_id == Speaker.id)
            .where(
                Bookmark.meeting_id == meeting_id,
                Bookmark.created_by == user.id,
                Bookmark.is_active.is_(True),
            )
            # CHRONOLOGICAL, not by when they were starred (T-32.7). The list is
            # a map of the recording, so it has to read in the recording's order.
            .order_by(TranscriptSegment.sequence)
        ).all()

        return [self._to_bookmark(b, segment, speaker) for b, segment, speaker in rows]

    def toggle_bookmark(self, meeting_id: int, user: User, segment_id: int) -> BookmarkToggleOut:
        """Star or unstar a segment.

        A TOGGLE rather than POST-and-DELETE because the UI is a toggle: `B` on a
        focused segment has to work whichever state it is in, and making the
        client track that state means it can be wrong. The unique constraint on
        `(segment_id, created_by)` is what makes this safe to call twice.
        """
        segment = self._segment_in(meeting_id, segment_id)
        existing = self._bookmark_for(segment_id, user.id)

        if existing is None:
            try:
                bookmark = Bookmark(
                    meeting_id=meeting_id,
                    segment_id=segment_id,
                    created_by=user.id,
                    is_active=True,
                )
                self.db.add(bookmark)
                self.db.commit()
            except IntegrityError:
                # Another request created the row between the SELECT above and
                # this INSERT. Real, and reachable from the UI: `B` is a
                # keypress, the client is optimistic, and two fast presses put
                # two POSTs on the wire at once — which is what the `B`-toggles
                # end-to-end case does, and what turned this from a theoretical
                # race into a 500.
                #
                # Falling through to the flip below rather than answering
                # "already bookmarked" is what makes the pair behave like two
                # toggles: the winner stars it, the loser unstars it, and the
                # final state matches the second keypress. Returning
                # `bookmarked: true` twice would leave a star on screen that the
                # user had just pressed off.
                self.db.rollback()
                existing = self._bookmark_for(segment_id, user.id)
            else:
                self.db.refresh(bookmark)
                return BookmarkToggleOut(
                    segment_id=segment_id,
                    bookmarked=True,
                    bookmark=self._to_bookmark(bookmark, segment, self._speaker(segment)),
                )

        if existing is None:  # pragma: no cover — the row cannot vanish again
            raise BookmarkNotFoundError(details={"segment_id": segment_id})

        # Flipped rather than deleted: the row is the natural place to hang
        # "un-star then undo" from, and the unique constraint means a delete
        # followed by a re-star would churn ids for no benefit.
        existing.is_active = not existing.is_active
        self.db.commit()
        self.db.refresh(existing)

        return BookmarkToggleOut(
            segment_id=segment_id,
            bookmarked=existing.is_active,
            bookmark=(
                self._to_bookmark(existing, segment, self._speaker(segment))
                if existing.is_active
                else None
            ),
        )

    def delete_bookmark(self, meeting_id: int, bookmark_id: int, user: User) -> None:
        bookmark = self.db.get(Bookmark, bookmark_id)
        if bookmark is None or bookmark.meeting_id != meeting_id or bookmark.created_by != user.id:
            raise BookmarkNotFoundError(details={"bookmark_id": bookmark_id})
        self.db.delete(bookmark)
        self.db.commit()

    # ── Surviving an edit (T-32.11) ─────────────────────────────────────────

    def remap_after_edit(self, segment_id: int, old_text: str, new_text: str) -> None:
        """Move or drop this segment's highlights after its text changed.

        Called from `TranscriptService.update_segment` BEFORE the transaction
        commits, while both strings are still available.

        The rule, chosen deliberately over the alternatives:

        - If the highlighted substring still occurs EXACTLY ONCE in the new
          text, the highlight moves to it. This covers the common edit — fixing
          a typo elsewhere in the line — with no loss.
        - Otherwise the highlight is DELETED. Ambiguity ("we" now appears four
          times) and disappearance are both cases where any surviving offset
          pair would be a guess, and a highlight painted over the wrong words is
          worse than one that is gone: the user can see it is gone.

        A diff-based remap would preserve more, but it would also silently
        preserve the wrong thing when the edit rewrote the highlighted words
        themselves, which is precisely the case that matters.
        """
        if old_text == new_text:
            return

        highlights = (
            self.db.execute(select(Highlight).where(Highlight.segment_id == segment_id))
            .scalars()
            .all()
        )
        if not highlights:
            return

        doomed: list[int] = []
        for highlight in highlights:
            quoted = old_text[highlight.start_offset : highlight.end_offset]
            first = new_text.find(quoted)
            if not quoted or first == -1 or new_text.find(quoted, first + 1) != -1:
                doomed.append(highlight.id)
                continue
            highlight.start_offset = first
            highlight.end_offset = first + len(quoted)

        if doomed:
            self.db.execute(sql_delete(Highlight).where(Highlight.id.in_(doomed)))

    # ── Internals ───────────────────────────────────────────────────────────

    def _bookmark_for(self, segment_id: int, user_id: int) -> Bookmark | None:
        return self.db.execute(
            select(Bookmark).where(
                Bookmark.segment_id == segment_id, Bookmark.created_by == user_id
            )
        ).scalar_one_or_none()

    def _segment_in(self, meeting_id: int, segment_id: int) -> TranscriptSegment:
        segment = self.db.get(TranscriptSegment, segment_id)
        # The meeting check is not paranoia: `segment_id` is client-supplied, and
        # without it a highlight could be attached to another meeting's
        # transcript and would then render on neither.
        if segment is None or segment.meeting_id != meeting_id:
            raise SegmentNotFoundError(details={"segment_id": segment_id})
        return segment

    def _highlight_in(self, meeting_id: int, highlight_id: int) -> Highlight:
        highlight = self.db.get(Highlight, highlight_id)
        if highlight is None or highlight.meeting_id != meeting_id:
            raise HighlightNotFoundError(details={"highlight_id": highlight_id})
        return highlight

    def _speaker(self, segment: TranscriptSegment) -> Speaker:
        return segment.speaker

    @staticmethod
    def _to_highlight(
        highlight: Highlight, segment: TranscriptSegment, speaker: Speaker
    ) -> HighlightOut:
        return HighlightOut(
            id=highlight.id,
            meeting_id=highlight.meeting_id,
            segment_id=highlight.segment_id,
            start_offset=highlight.start_offset,
            end_offset=highlight.end_offset,
            color=highlight.color,
            note=highlight.note,
            text=segment.text[highlight.start_offset : highlight.end_offset],
            start_ms=segment.start_ms,
            speaker_id=segment.speaker_id,
            speaker_label=speaker.label,
            created_at=highlight.created_at,
        )

    @staticmethod
    def _to_bookmark(
        bookmark: Bookmark, segment: TranscriptSegment, speaker: Speaker
    ) -> BookmarkOut:
        return BookmarkOut(
            id=bookmark.id,
            meeting_id=bookmark.meeting_id,
            segment_id=bookmark.segment_id,
            start_ms=segment.start_ms,
            speaker_id=segment.speaker_id,
            speaker_label=speaker.label,
            text=_snippet(segment.text),
            created_at=bookmark.created_at,
        )
