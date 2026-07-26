"""Global cross-meeting search.

Minimal implementation to back the topbar dropdown (T-08.3). T-35 extends this
with query syntax (quoted phrases, `-exclusion`, `speaker:`), filters, ranking
transparency and pagination.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from app.db.search import search_segments
from app.models import Meeting
from app.schemas.common import MatchRange
from app.schemas.search import MeetingHit, SearchResults, TranscriptHit

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

#: Delimiters the FTS `snippet()` function wraps matches in. Chosen to be
#: characters that cannot appear in transcript text, so splitting on them is
#: unambiguous — and they are stripped before the snippet reaches the client.
OPEN, CLOSE = "\x02", "\x03"

MIN_QUERY_LENGTH = 2


def _extract_ranges(marked: str) -> tuple[str, list[MatchRange]]:
    """Turn a delimiter-marked snippet into plain text plus offsets.

    The alternative — sending `<b>` tags and letting the client inject them — is
    an XSS hole the moment a transcript contains markup. Offsets keep the
    rendering decision on the client, where it can be done safely.
    """
    plain: list[str] = []
    ranges: list[MatchRange] = []
    cursor = 0
    start: int | None = None

    for char in marked:
        if char == OPEN:
            start = cursor
        elif char == CLOSE:
            if start is not None:
                ranges.append(MatchRange(start=start, end=cursor))
                start = None
        else:
            plain.append(char)
            cursor += 1

    return "".join(plain), ranges


def _title_ranges(title: str, query: str) -> list[MatchRange]:
    """Case-insensitive match offsets in a title.

    `re.escape` because a user typing `a.*b` into a search box means those
    characters literally — treating it as a pattern is both wrong and a way to
    hang the server on a pathological expression.
    """
    return [
        MatchRange(start=m.start(), end=m.end())
        for m in re.finditer(re.escape(query), title, re.IGNORECASE)
    ]


class SearchService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def search(self, query: str, *, limit: int = 5) -> SearchResults:
        cleaned = query.strip()
        if len(cleaned) < MIN_QUERY_LENGTH:
            # One character matches most of the corpus; answering with nothing
            # is more useful than answering with everything.
            return SearchResults(query=cleaned, meetings=[], transcripts=[], total=0)

        # `autoescape` so a title search for `50%` looks for that, rather than
        # letting LIKE read the `%` as a wildcard.
        by_title = (
            Meeting.not_deleted()
            .where(Meeting.title.icontains(cleaned, autoescape=True))
            .order_by(Meeting.started_at.desc())
            .limit(limit)
        )
        meetings = [
            MeetingHit(
                id=meeting.id,
                title=meeting.title,
                started_at=meeting.started_at.isoformat(),
                duration_seconds=meeting.duration_seconds,
                matches=_title_ranges(meeting.title, cleaned),
            )
            for meeting in self.db.execute(by_title).scalars()
        ]

        transcripts: list[TranscriptHit] = []
        for hit in search_segments(self.db, cleaned, limit=limit, highlight=(OPEN, CLOSE)):
            snippet, ranges = _extract_ranges(hit.snippet)
            transcripts.append(
                TranscriptHit(
                    segment_id=hit.segment_id,
                    meeting_id=hit.meeting_id,
                    meeting_title=hit.meeting_title,
                    speaker=hit.speaker_label,
                    start_ms=hit.start_ms,
                    snippet=snippet,
                    matches=ranges,
                )
            )

        return SearchResults(
            query=cleaned,
            meetings=meetings,
            transcripts=transcripts,
            total=len(meetings) + len(transcripts),
        )
