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

from sqlalchemy import Integer, String, column, table, text

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

#: The FTS5 virtual table, declared so it can be composed into ORM queries
#: instead of being reached through raw SQL at every call site.
#:
#: It is not a model: FTS5 tables have no primary key and Alembic creates this
#: one by hand, so declaring it as a mapped class would put a lie in the
#: metadata that autogenerate would then try to "fix".
transcript_fts = table(
    "transcript_fts",
    column("segment_id", Integer),
    column("text", String),
    #: The table name is also a queryable column in FTS5 — `tbl MATCH ?` is how
    #: a full-table match is expressed.
    column("transcript_fts", String),
)

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
#: The filters T-35 adds, shared verbatim between the row query and the count
#: query — two copies of a WHERE clause is how a total stops matching its list.
_SEARCH_WHERE = """
    WHERE transcript_fts MATCH :query
      -- The line this module exists for.
      AND m.deleted_at IS NULL
      AND (:meeting_id IS NULL OR s.meeting_id = :meeting_id)
      AND (:speaker IS NULL
           OR COALESCE(p.display_name, sp.label) LIKE '%' || :speaker || '%')
      -- By NAME, because that is what the facets sidebar has. Exact but
      -- case-insensitive: the names come from our own facet list, not typing.
      AND (:host IS NULL
           OR m.host_id IN (SELECT u.id FROM users AS u WHERE u.name = :host COLLATE NOCASE))
      AND (:before IS NULL OR date(m.started_at) < date(:before))
      AND (:after IS NULL OR date(m.started_at) >= date(:after))
"""

_SEARCH_FROM = """
    FROM transcript_fts AS f
    JOIN transcript_segments AS s ON s.id = f.segment_id
    JOIN meetings           AS m ON m.id = s.meeting_id
    JOIN speakers           AS sp ON sp.id = s.speaker_id
    LEFT JOIN participants  AS p ON p.id = sp.participant_id
"""

_SEARCH_SQL = text(
    f"""
    SELECT
        f.segment_id                              AS segment_id,
        s.meeting_id                              AS meeting_id,
        m.title                                   AS meeting_title,
        s.start_ms                                AS start_ms,
        COALESCE(p.display_name, sp.label)        AS speaker_label,
        snippet(transcript_fts, 0, :open, :close, '…', 24) AS snippet,
        bm25(transcript_fts)                      AS rank
    {_SEARCH_FROM}
    {_SEARCH_WHERE}
    ORDER BY rank
    LIMIT :limit OFFSET :offset
    """
)

_COUNT_SQL = text(
    f"""
    SELECT count(*)
    {_SEARCH_FROM}
    {_SEARCH_WHERE}
    """
)


def search_segments(
    session: Session,
    query: str,
    *,
    meeting_id: int | None = None,
    speaker: str | None = None,
    host: str | None = None,
    before: str | None = None,
    after: str | None = None,
    limit: int = 20,
    offset: int = 0,
    highlight: tuple[str, str] = ("[", "]"),
    fts_query: str | None = None,
) -> list[SegmentHit]:
    """Ranked transcript search, excluding soft-deleted meetings.

    `highlight` delimits matched terms inside the snippet. Plain markers by
    default, never HTML — T-35.2 requires the server to return structured
    ranges rather than markup the client would have to trust.

    `fts_query` bypasses `to_fts_query` for callers that built their own MATCH
    expression through the T-35.3 syntax parser; `query` remains the plain-text
    path the find bar and topbar use.
    """
    match = fts_query if fts_query is not None else to_fts_query(query)
    if not match:
        return []

    rows = session.execute(
        _SEARCH_SQL,
        {
            "query": match,
            "meeting_id": meeting_id,
            "speaker": speaker,
            "host": host,
            "before": before,
            "after": after,
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


def count_segments(
    session: Session,
    fts_query: str,
    *,
    meeting_id: int | None = None,
    speaker: str | None = None,
    host: str | None = None,
    before: str | None = None,
    after: str | None = None,
) -> int:
    """The real total behind a paginated search (T-35.8).

    `len(page)` says how many came back, which is the one number the UI already
    knows. Shares `_SEARCH_WHERE` with the row query so the two cannot drift.
    """
    if not fts_query:
        return 0

    return int(
        session.execute(
            _COUNT_SQL,
            {
                "query": fts_query,
                "meeting_id": meeting_id,
                "speaker": speaker,
                "host": host,
                "before": before,
                "after": after,
            },
        ).scalar()
        or 0
    )
