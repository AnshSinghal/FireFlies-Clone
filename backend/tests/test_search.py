"""Global search (T-08.3, extended in T-35)."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.services.search import SearchService
from tests.factories import make_full_meeting, make_meeting, make_segments, make_speaker, make_user


@pytest.fixture
def populated(db: Session) -> Session:
    user = make_user(db)
    meeting = make_meeting(db, host=user, title="Q3 Product Roadmap Sync")
    make_segments(
        db,
        meeting,
        [make_speaker(db, meeting)],
        count=5,
        text="We should revisit the pricing model before the quarter closes.",
    )
    db.commit()
    return db


def test_title_and_transcript_hits_are_grouped_separately(populated: Session) -> None:
    """A title match means 'this meeting is about X'; a transcript match means
    'X was said at 18:42'. Flattening them loses that."""
    results = SearchService(populated).search("roadmap")
    assert len(results.meetings) == 1
    assert results.meetings[0].title == "Q3 Product Roadmap Sync"

    results = SearchService(populated).search("pricing")
    assert results.transcripts
    assert results.transcripts[0].start_ms is not None


def test_snippets_carry_ranges_not_markup(populated: Session) -> None:
    """The client wraps matches itself, so transcript HTML cannot execute."""
    results = SearchService(populated).search("pricing")
    hit = results.transcripts[0]

    assert "<" not in hit.snippet
    assert "\x02" not in hit.snippet and "\x03" not in hit.snippet
    assert hit.matches
    # Ranges must actually point at the term.
    matched = hit.snippet[hit.matches[0].start : hit.matches[0].end]
    assert "pric" in matched.lower()


def test_title_ranges_locate_the_term(populated: Session) -> None:
    hit = SearchService(populated).search("roadmap").meetings[0]
    assert hit.matches
    assert hit.title[hit.matches[0].start : hit.matches[0].end].lower() == "roadmap"


def test_a_regex_metacharacter_query_is_literal(populated: Session) -> None:
    """`a.*b` typed into a search box means those characters, not a pattern."""
    results = SearchService(populated).search("a.*b")
    assert results.meetings == []
    # And crucially it does not 500: FTS5 parses its bound query as a query
    # language, so unescaped punctuation is a syntax error, not a non-match.
    assert results.transcripts == []


@pytest.mark.parametrize("query", ["", " ", "a"])
def test_short_queries_return_nothing(populated: Session, query: str) -> None:
    # One character matches most of the corpus; nothing beats everything.
    assert SearchService(populated).search(query).total == 0


def test_search_excludes_deleted_meetings(populated: Session) -> None:
    from datetime import UTC, datetime

    from app.models import Meeting

    meeting = populated.execute(Meeting.not_deleted()).scalars().first()
    assert meeting is not None
    meeting.deleted_at = datetime.now(UTC)
    populated.commit()

    results = SearchService(populated).search("pricing")
    assert results.transcripts == []


def test_search_endpoint_returns_the_envelope(client: TestClient, db: Session) -> None:
    make_full_meeting(db)
    body = client.get("/api/v1/search", params={"q": "pricing"}).json()

    assert body["query"] == "pricing"
    assert set(body) >= {"query", "meetings", "transcripts", "total"}


def test_search_endpoint_requires_a_query(client: TestClient) -> None:
    assert client.get("/api/v1/search").status_code == 422


@pytest.mark.parametrize(
    "query",
    ["a.*b", 'quote " mark', "paren (", "star *", "colon :", "caret ^", "dash -term", "NEAR("],
)
def test_fts_punctuation_never_raises(populated: Session, query: str) -> None:
    """A search box that 500s on punctuation is worse than one that finds nothing."""
    SearchService(populated).search(query)


def test_to_fts_query_quotes_tokens_and_prefixes_the_last() -> None:
    from app.db.search import to_fts_query

    # Prefix on the trailing token so results narrow while typing.
    assert to_fts_query("pricing model") == '"pricing" "model"*'
    # Punctuation is stripped, not interpreted.
    assert to_fts_query("a.*b") == ""
    assert to_fts_query('say "hi"') == '"say" "hi"*'
    assert to_fts_query("   ") == ""
