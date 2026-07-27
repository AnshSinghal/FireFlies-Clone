"""Global cross-meeting search (T-08.3, T-35).

Two callers, one service. The topbar dropdown wants a handful of hits fast;
the `/search` page wants the T-35.3 query syntax, host and date filters, a
real total, and pagination. Both go through `search()` — the page simply asks
for more.
"""

from __future__ import annotations

import re
from typing import TYPE_CHECKING

from app.db.search import count_segments, search_segments
from app.models import Meeting, User
from app.schemas.common import MatchRange
from app.schemas.search import MeetingHit, SearchResults, TranscriptHit
from app.services.search_query import parse_query

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

    def search(
        self,
        query: str,
        *,
        limit: int = 5,
        offset: int = 0,
        host: str | None = None,
        scope: str = "all",
    ) -> SearchResults:
        cleaned = query.strip()
        empty = SearchResults(
            query=cleaned, meetings=[], transcripts=[], total=0, has_more=False, offset=offset
        )
        if len(cleaned) < MIN_QUERY_LENGTH:
            # One character matches most of the corpus; answering with nothing
            # is more useful than answering with everything.
            return empty

        # The T-35.3 syntax: phrases, exclusions, speaker: and date filters all
        # live in the query string, because that is where people type them.
        parsed = parse_query(cleaned)
        if not parsed.has_text:
            return empty

        # Title matching uses the TEXT terms only — `speaker:` and dates are
        # transcript concepts. The first include term drives the highlight.
        title_term = parsed.include[0].text if parsed.include else cleaned

        meetings: list[MeetingHit] = []
        title_count = 0
        if scope in ("all", "meetings"):
            conditions = [
                Meeting.title.icontains(term.text, autoescape=True) for term in parsed.include
            ]
            by_title = (
                Meeting.not_deleted()
                .where(*conditions)
                .order_by(Meeting.started_at.desc())
                .limit(limit)
            )
            if host is not None:
                by_title = by_title.where(Meeting.host.has(User.name.ilike(host)))
            if parsed.before is not None:
                by_title = by_title.where(Meeting.started_at < parsed.before.isoformat())
            if parsed.after is not None:
                by_title = by_title.where(Meeting.started_at >= parsed.after.isoformat())

            rows = list(self.db.execute(by_title).scalars())
            # Counted on EVERY page, included only on the first: `total` must
            # not change as the client walks transcript pages, and re-sending
            # the same titles on page two would duplicate them on append.
            title_count = len(rows)
            if offset == 0:
                meetings = [
                    MeetingHit(
                        id=meeting.id,
                        title=meeting.title,
                        started_at=meeting.started_at.isoformat(),
                        duration_seconds=meeting.duration_seconds,
                        matches=_title_ranges(meeting.title, title_term),
                    )
                    for meeting in rows
                ]

        fts = parsed.to_fts()
        before = parsed.before.isoformat() if parsed.before else None
        after = parsed.after.isoformat() if parsed.after else None

        transcripts: list[TranscriptHit] = []
        transcript_total = 0
        if scope in ("all", "transcript"):
            for hit in search_segments(
                self.db,
                cleaned,
                fts_query=fts,
                limit=limit,
                offset=offset,
                highlight=(OPEN, CLOSE),
                speaker=parsed.speaker,
                host=host,
                before=before,
                after=after,
            ):
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
            transcript_total = count_segments(
                self.db,
                fts,
                speaker=parsed.speaker,
                host=host,
                before=before,
                after=after,
            )

        return SearchResults(
            query=cleaned,
            meetings=meetings,
            transcripts=transcripts,
            # The REAL total, not the page length — "N results for x" has to
            # describe the corpus, and Load more needs to know when to stop.
            total=title_count + transcript_total,
            has_more=offset + len(transcripts) < transcript_total,
            offset=offset,
        )
