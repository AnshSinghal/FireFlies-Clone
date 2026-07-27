"""Global search (T-08.3, extended in T-35)."""

from __future__ import annotations

import re
import time

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models import Meeting, Speaker, TranscriptSegment
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


def test_t43_9_search_goes_through_the_fts_index_not_a_scan(db: Session) -> None:
    """`EXPLAIN QUERY PLAN` on the real search SQL (T-43.9).

    The plan must show the FTS5 virtual-table lookup. If someone "simplifies"
    the query into a LIKE over `transcript_segments`, results still come back
    and every other test still passes — only the plan betrays that search has
    become a full-table scan.
    """

    from app.db.search import _SEARCH_SQL

    plan_rows = db.execute(
        text(f"EXPLAIN QUERY PLAN {_SEARCH_SQL.text}"),
        {
            "query": "pricing",
            "meeting_id": None,
            # T-35 added these filters to the shared WHERE clause.
            "speaker": None,
            "host": None,
            "before": None,
            "after": None,
            "limit": 20,
            "offset": 0,
            "open": "[",
            "close": "]",
        },
    ).all()
    plan = " | ".join(str(row) for row in plan_rows)

    # The FTS5 MATCH drives the query: the virtual table is scanned via its
    # index (`SCAN f VIRTUAL TABLE INDEX 0:M...`), and every joined base table
    # is reached by primary key, never by walking the whole table.
    assert "VIRTUAL TABLE INDEX" in plan, plan
    assert re.search(r"\bSCAN (transcript_segments|meetings|speakers|s|m|sp|p)\b", plan) is None, (
        f"full-table scan crept in: {plan}"
    )


class TestGlobalSearch:
    """The /search page's contract (T-35, cases T35-A → T35-F)."""

    @pytest.fixture()
    def corpus(self, db: Session) -> dict[str, Meeting]:
        """Three meetings with known, distinct content."""
        pricing = make_meeting(db, title="Q3 pricing sync")
        sarah = make_speaker(db, pricing, label="Sarah Chen", color_index=0)
        marcus = make_speaker(db, pricing, label="Marcus Patel", color_index=1)
        _segments(
            db,
            pricing,
            [
                (sarah, "The pricing model needs a usage tier."),
                (marcus, "Pricing again — and churn is up this month."),
                (sarah, "Let's finalise the pricing model on Friday."),
            ],
        )

        churn = make_meeting(db, title="Churn review", host=make_user(db, name="Grace Hopper"))
        grace = make_speaker(db, churn, label="Grace Hopper", color_index=0)
        _segments(db, churn, [(grace, "Churn pricing pressure in enterprise.")])

        unrelated = make_meeting(db, title="Design crit", host=make_user(db, name="Ada Lovelace"))
        ada = make_speaker(db, unrelated, label="Ada Lovelace", color_index=0)
        _segments(db, unrelated, [(ada, "The new onboarding flow looks great.")])

        db.commit()
        return {"pricing": pricing, "churn": churn, "unrelated": unrelated}

    def test_t35a_a_term_finds_ranked_snippets(
        self, client: TestClient, corpus: dict[str, Meeting]
    ) -> None:
        body = client.get("/api/v1/search", params={"q": "pricing"}).json()

        # Both meetings that say it, none that do not.
        meeting_ids = {hit["meeting_id"] for hit in body["transcripts"]}
        assert corpus["pricing"].id in meeting_ids
        assert corpus["churn"].id in meeting_ids
        assert corpus["unrelated"].id not in meeting_ids

        # Every snippet carries the term and offsets that point at it.
        for hit in body["transcripts"]:
            assert "pricing" in hit["snippet"].lower()
            assert hit["matches"], "a hit with no match ranges cannot be highlighted"
            first = hit["matches"][0]
            marked = hit["snippet"][first["start"] : first["end"]].lower()
            assert "pricing" in marked or marked in "pricing"

        # And the total is the corpus's, not the page's.
        assert body["total"] >= len(body["transcripts"])

    def test_t35b_a_quoted_phrase_matches_only_the_phrase(
        self, client: TestClient, corpus: dict[str, Meeting]
    ) -> None:
        body = client.get("/api/v1/search", params={"q": '"pricing model"'}).json()

        snippets = [hit["snippet"].lower() for hit in body["transcripts"]]
        assert snippets, "the phrase exists in the corpus"
        assert all("pricing model" in snippet for snippet in snippets)
        # "Churn pricing pressure" contains the word but not the phrase.
        assert corpus["churn"].id not in {hit["meeting_id"] for hit in body["transcripts"]}

    def test_t35c_a_minus_excludes(self, client: TestClient, corpus: dict[str, Meeting]) -> None:
        body = client.get("/api/v1/search", params={"q": "pricing -churn"}).json()

        snippets = [hit["snippet"].lower() for hit in body["transcripts"]]
        assert snippets
        assert all("churn" not in snippet for snippet in snippets)

    def test_t35d_speaker_filter_narrows_to_that_voice(
        self, client: TestClient, corpus: dict[str, Meeting]
    ) -> None:
        body = client.get("/api/v1/search", params={"q": "speaker:Sarah pricing"}).json()

        assert body["transcripts"], "Sarah says 'pricing' twice"
        assert all(hit["speaker"] == "Sarah Chen" for hit in body["transcripts"])

    # The EXPLAIN QUERY PLAN claim lives in `test_t43_9_...` above — T-43
    # landed the stronger version (a no-SCAN regex over every base table)
    # while this suite was in flight, and one strong test beats two twins.

    def test_t35f_a_large_corpus_answers_quickly(self, client: TestClient, db: Session) -> None:
        """Sub-200ms over 500 segments (T-35.11).

        Generous against the plan's own number — the point is catching an
        accidental O(n) re-rank in Python, not benchmarking SQLite.
        """
        meeting = make_meeting(db, title="Marathon planning session")
        speaker = make_speaker(db, meeting, label="Speaker 1", color_index=0)
        _segments(
            db,
            meeting,
            [
                (speaker, f"Line {i} discusses budget planning and roadmap topic {i % 7}.")
                for i in range(500)
            ],
        )
        db.commit()

        start = time.perf_counter()
        response = client.get("/api/v1/search", params={"q": "budget roadmap"})
        elapsed_ms = (time.perf_counter() - start) * 1000

        assert response.status_code == 200
        assert response.json()["total"] >= 500
        assert elapsed_ms < 200, f"took {elapsed_ms:.0f}ms"

    def test_pagination_is_stable_with_a_real_total(
        self, client: TestClient, corpus: dict[str, Meeting]
    ) -> None:
        first = client.get("/api/v1/search", params={"q": "pricing", "limit": 2}).json()
        assert len(first["transcripts"]) == 2
        assert first["has_more"] is True

        second = client.get(
            "/api/v1/search", params={"q": "pricing", "limit": 2, "offset": 2}
        ).json()

        # No overlap between pages, and the totals agree.
        first_ids = {hit["segment_id"] for hit in first["transcripts"]}
        second_ids = {hit["segment_id"] for hit in second["transcripts"]}
        assert not first_ids & second_ids
        assert second["total"] == first["total"]
        # Titles are sent once, on the first page only — appending would
        # otherwise duplicate them.
        assert second["meetings"] == []


def _segments(
    db: Session,
    meeting: Meeting,
    lines: list[tuple[Speaker, str]],
) -> None:
    for index, (speaker, line) in enumerate(lines):
        db.add(
            TranscriptSegment(
                meeting_id=meeting.id,
                speaker_id=speaker.id,
                sequence=index,
                start_ms=index * 10_000,
                end_ms=index * 10_000 + 8_000,
                text=line,
            )
        )
    db.flush()
    # The seeder rebuilds FTS explicitly; tests write through the triggers, so
    # nothing more is needed — which is itself part of what is under test.
