"""Full-text search over transcript segments.

**The whole reason this module exists is one bug.**

`transcript_fts` is maintained by triggers on `transcript_segments`. Soft-deleting
a *meeting* sets `meetings.deleted_at` and never touches its segments — so the
segments remain in the FTS index and a naive `SELECT ... FROM transcript_fts
MATCH ?` happily returns hits from meetings the user has deleted.

Cascading the soft delete into segments was rejected: it would make restore
lossy and turn one UPDATE into thousands. Instead every FTS query joins back to
`meetings` and filters `deleted_at IS NULL`, and that join lives HERE rather
than being retyped at each call site. Search paths must go through this module.

See docs/schema.md, "Two problems found while drawing this".
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

from sqlalchemy import text

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

#: Runs of word characters and apostrophes. Everything else — `*`, `"`, `:`,
#: `(`, `-`, `^`, `NEAR` punctuation — is FTS5 *syntax*, and a user typing it
#: into a search box means the character, not the operator.
_TOKEN = re.compile(r"[\w']+", re.UNICODE)

#: Single characters are dropped: as a prefix term `a*` matches most of the
#: corpus, which is slow and useless. Same reasoning as the service's
#: two-character floor, applied per token.
_MIN_TOKEN_LENGTH = 2


def to_fts_query(raw: str) -> str:
    """Turn user input into a safe FTS5 MATCH expression.

    Interpolating raw input is not an injection risk here — the value is bound,
    so it cannot escape into SQL — but FTS5 parses the bound string as its own
    query language. `a.*b` raises `fts5: syntax error near "."` and a search box
    that 500s on punctuation is worse than one that finds nothing.

    Each token is quoted as a phrase (so it is matched literally) and joined by
    implicit AND. The final token gets a `*` so results narrow as the user types
    rather than appearing only on word boundaries.

    Returns `""` when nothing usable survives; callers treat that as no match.
    """
    tokens = [t for t in _TOKEN.findall(raw) if len(t) >= _MIN_TOKEN_LENGTH]
    if not tokens:
        return ""

    # Double quotes are the only character meaningful *inside* a phrase, and
    # FTS5 escapes them by doubling.
    quoted = [f'"{t.replace(chr(34), chr(34) * 2)}"' for t in tokens]
    quoted[-1] += "*"
    return " ".join(quoted)


@dataclass(frozen=True, slots=True)
class SegmentHit:
    """One ranked transcript match."""

    segment_id: int
    meeting_id: int
    meeting_title: str
    start_ms: int
    speaker_label: str
    snippet: str
    rank: float


#: bm25() returns a NEGATIVE score where more negative is more relevant, so the
#: ordering is ASC. Weights favour the text column; the UNINDEXED columns
#: contribute nothing to relevance by definition.
_SEARCH_SQL = text(
    """
    SELECT
        f.segment_id                              AS segment_id,
        s.meeting_id                              AS meeting_id,
        m.title                                   AS meeting_title,
        s.start_ms                                AS start_ms,
        COALESCE(p.display_name, sp.label)        AS speaker_label,
        snippet(transcript_fts, 0, :open, :close, '…', 24) AS snippet,
        bm25(transcript_fts)                      AS rank
    FROM transcript_fts AS f
    JOIN transcript_segments AS s ON s.id = f.segment_id
    JOIN meetings           AS m ON m.id = s.meeting_id
    JOIN speakers           AS sp ON sp.id = s.speaker_id
    LEFT JOIN participants  AS p ON p.id = sp.participant_id
    WHERE transcript_fts MATCH :query
      -- The line this module exists for.
      AND m.deleted_at IS NULL
      AND (:meeting_id IS NULL OR s.meeting_id = :meeting_id)
    ORDER BY rank
    LIMIT :limit OFFSET :offset
    """
)


def search_segments(
    session: Session,
    query: str,
    *,
    meeting_id: int | None = None,
    limit: int = 20,
    offset: int = 0,
    highlight: tuple[str, str] = ("[", "]"),
) -> list[SegmentHit]:
    """Ranked transcript search, excluding soft-deleted meetings.

    `highlight` delimits matched terms inside the snippet. Plain markers by
    default, never HTML — T-35.2 requires the server to return structured
    ranges rather than markup the client would have to trust.
    """
    match = to_fts_query(query)
    if not match:
        return []

    rows = session.execute(
        _SEARCH_SQL,
        {
            "query": match,
            "meeting_id": meeting_id,
            "limit": limit,
            "offset": offset,
            "open": highlight[0],
            "close": highlight[1],
        },
    ).mappings()

    return [
        SegmentHit(
            segment_id=row["segment_id"],
            meeting_id=row["meeting_id"],
            meeting_title=row["meeting_title"],
            start_ms=row["start_ms"],
            speaker_label=row["speaker_label"],
            snippet=row["snippet"],
            rank=row["rank"],
        )
        for row in rows
    ]


def fts_row_count(session: Session) -> int:
    """Raw index size, ignoring soft deletes. For diagnostics and tests only."""
    return int(session.execute(text("SELECT count(*) FROM transcript_fts")).scalar_one())
