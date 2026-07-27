"""Meetings list API (T-11, cases T11-A → T11-M).

Structured to match how the filters are built: every one individually first,
then combinations, then the boundaries. Because each filter is a function over
a statement, "test every filter" is a loop rather than eleven copies of the same
test body.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta

import pytest
from fastapi import status
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Channel, Meeting, Tag
from app.models.enums import ActionItemStatus, MeetingSource
from app.services.meeting_filters import FILTERS, MeetingFilters, TagSelection, apply_filters
from app.services.meetings import MeetingService
from tests.factories import (
    make_action_items,
    make_meeting,
    make_participant,
    make_segments,
    make_speaker,
    make_summary,
    make_user,
)

ANCHOR = datetime(2026, 7, 26, 9, 0, tzinfo=UTC)


@pytest.fixture
def library(db: Session) -> Session:
    """A small, deliberately varied library.

    Every row differs from every other along at least two axes, so a filter
    that matches by accident is visible.
    """
    sarah = make_user(db, name="Sarah Okonkwo")
    marcus = make_user(db, name="Marcus Bell")

    product = Channel(name="Product", slug="product")
    sales = Channel(name="Sales", slug="sales")
    db.add_all([product, sales])
    db.flush()

    q3 = Tag(name="q3", color_index=0)
    urgent = Tag(name="urgent", color_index=1)
    db.add_all([q3, urgent])
    db.flush()

    # Two meetings today, one yesterday, one a week back.
    roadmap = make_meeting(
        db,
        host=sarah,
        title="Q3 Product Roadmap Sync",
        started_at=ANCHOR,
        duration_seconds=1800,
        channel_id=product.id,
        source=MeetingSource.INTEGRATION,
    )
    roadmap.tags = [q3, urgent]
    speakers = [make_speaker(db, roadmap, label="Speaker 1")]
    make_segments(db, roadmap, speakers, count=3, text="the pricing model needs revisiting")
    roadmap.duration_seconds = 1800
    make_participant(db, roadmap, display_name="Priya Raghunathan")
    make_summary(db, roadmap)
    make_action_items(db, roadmap, count=2)

    standup = make_meeting(
        db,
        host=marcus,
        title="Weekly Engineering Standup",
        started_at=ANCHOR + timedelta(hours=3),
        duration_seconds=600,
        channel_id=product.id,
        source=MeetingSource.SEED,
    )
    standup.tags = [q3]
    make_participant(db, standup, display_name="Dev Patel")

    discovery = make_meeting(
        db,
        host=sarah,
        title="Acme Corp — Discovery Call",
        started_at=ANCHOR - timedelta(days=1),
        duration_seconds=2700,
        channel_id=sales.id,
        source=MeetingSource.UPLOAD,
    )
    make_participant(db, discovery, display_name="Priya Raghunathan")
    items = make_action_items(db, discovery, count=2)
    for item in items:
        item.status = ActionItemStatus.COMPLETED

    make_meeting(
        db,
        host=marcus,
        title="All-Hands: Q2 Results",
        started_at=ANCHOR - timedelta(days=7),
        duration_seconds=3600,
        source=MeetingSource.MANUAL,
    )

    db.commit()
    return db


def titles(payload: dict) -> list[str]:
    return [item["title"] for item in payload["items"]]


# ── Envelope and defaults ───────────────────────────────────────────────────


def test_t11_a_no_params_returns_everything_newest_first(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings").json()

    assert body["total"] == 4
    assert body["page"] == 1
    assert body["has_next"] is False
    assert body["total_pages"] == 1
    # Newest first, and the two "today" meetings ordered within the day.
    assert titles(body) == [
        "Weekly Engineering Standup",
        "Q3 Product Roadmap Sync",
        "Acme Corp — Discovery Call",
        "All-Hands: Q2 Results",
    ]


def test_t11_m_the_row_shape_never_contains_a_transcript(client: TestClient, library: Session):
    """The deduction T-04.4 warns about: 1,200 segments per row, 20 rows a page."""
    body = client.get("/api/v1/meetings").json()

    serialised = str(body)
    for forbidden in ("segments", "transcript", "sections"):
        assert forbidden not in serialised

    row = body["items"][0]
    assert set(row) >= {"id", "title", "started_at", "duration_seconds", "action_item_counts"}


def test_a_soft_deleted_meeting_disappears_from_the_list(client: TestClient, library: Session):
    meeting = library.execute(Meeting.not_deleted()).scalars().first()
    assert meeting is not None
    meeting.deleted_at = datetime.now(UTC)
    library.commit()

    body = client.get("/api/v1/meetings").json()
    assert body["total"] == 3
    assert meeting.title not in titles(body)


# ── Search (T11-B, T11-C, T11-D) ────────────────────────────────────────────


def test_t11_b_q_matches_the_title(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"q": "roadmap"}).json()
    assert titles(body) == ["Q3 Product Roadmap Sync"]


def test_t11_c_q_is_case_insensitive(client: TestClient, library: Session):
    lower = client.get("/api/v1/meetings", params={"q": "roadmap"}).json()
    upper = client.get("/api/v1/meetings", params={"q": "ROADMAP"}).json()
    assert titles(lower) == titles(upper) == ["Q3 Product Roadmap Sync"]


def test_t11_d_a_transcript_hit_explains_itself(client: TestClient, library: Session):
    """A word that appears ONLY in a transcript still finds the meeting."""
    body = client.get("/api/v1/meetings", params={"q": "revisiting"}).json()

    assert titles(body) == ["Q3 Product Roadmap Sync"]

    context = body["items"][0]["match_context"]
    assert context is not None, "a transcript hit with no explanation looks like a false positive"
    assert "revisit" in context["snippet"].lower()
    assert context["start_ms"] >= 0
    assert context["speaker"]


def test_match_context_is_absent_when_the_title_already_explains_the_hit(
    client: TestClient, library: Session
):
    # The row shows the reason; a "why this matched" line would be noise.
    body = client.get("/api/v1/meetings", params={"q": "roadmap"}).json()
    assert body["items"][0]["match_context"] is None


def test_q_matches_a_participant_name(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"q": "Priya"}).json()
    assert set(titles(body)) == {"Q3 Product Roadmap Sync", "Acme Corp — Discovery Call"}


def test_q_returns_each_meeting_once_however_many_segments_match(
    client: TestClient, library: Session
):
    """A JOIN would return the meeting once per matching segment.

    Three segments all contain the term. If the transcript arm were a join
    rather than an `IN (subquery)`, this page would have three identical rows
    and `total` would say 3.
    """
    body = client.get("/api/v1/meetings", params={"q": "pricing"}).json()

    assert body["total"] == 1
    assert len(body["items"]) == 1


@pytest.mark.parametrize("query", ["a.*b", 'quote " mark', "NEAR(", "-x", "zzzqqq"])
def test_a_query_that_matches_nothing_is_an_empty_page_not_an_error(
    client: TestClient, library: Session, query: str
):
    response = client.get("/api/v1/meetings", params={"q": query})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["items"] == []


# ── Dates (T11-E, T11-F) ────────────────────────────────────────────────────


def test_t11_e_a_single_day_range_returns_that_day(client: TestClient, library: Session):
    day = ANCHOR.date().isoformat()
    body = client.get("/api/v1/meetings", params={"from": day, "to": day}).json()

    assert body["total"] == 2
    assert set(titles(body)) == {"Q3 Product Roadmap Sync", "Weekly Engineering Standup"}


def test_t11_f_the_end_date_is_inclusive(client: TestClient, library: Session):
    """The most common filter bug: `to` compared against midnight.

    `started_at <= to` drops everything on the final day, so filtering "up to
    today" shows nothing from today.
    """
    body = client.get("/api/v1/meetings", params={"to": ANCHOR.date().isoformat()}).json()

    assert "Q3 Product Roadmap Sync" in titles(body)
    # …including a meeting three hours into that same day.
    assert "Weekly Engineering Standup" in titles(body)


def test_the_start_date_is_inclusive_too(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"from": ANCHOR.date().isoformat()}).json()
    assert body["total"] == 2


def test_a_range_that_excludes_everything_is_empty_not_an_error(
    client: TestClient, library: Session
):
    body = client.get("/api/v1/meetings", params={"from": "2020-01-01", "to": "2020-01-02"}).json()
    assert body["items"] == []
    assert body["total"] == 0


# ── Every other filter, individually ────────────────────────────────────────


def test_host_filter(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"host": "Sarah"}).json()
    assert set(titles(body)) == {"Q3 Product Roadmap Sync", "Acme Corp — Discovery Call"}


def test_participant_filter(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"participant": "Dev Patel"}).json()
    assert titles(body) == ["Weekly Engineering Standup"]


def test_duration_bounds(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"min_duration": 2000}).json()
    assert set(titles(body)) == {"Acme Corp — Discovery Call", "All-Hands: Q2 Results"}

    body = client.get("/api/v1/meetings", params={"max_duration": 900}).json()
    assert titles(body) == ["Weekly Engineering Standup"]


def test_channel_filter(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"channel": "sales"}).json()
    assert titles(body) == ["Acme Corp — Discovery Call"]


def test_source_filter(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"source": "integration"}).json()
    assert titles(body) == ["Q3 Product Roadmap Sync"]


def _tag_ids(library: Session) -> tuple[int, int]:
    q3 = library.execute(select(Tag).where(Tag.name == "q3")).scalar_one()
    urgent = library.execute(select(Tag).where(Tag.name == "urgent")).scalar_one()
    return q3.id, urgent.id


def test_tags_filter_defaults_to_or(client: TestClient, library: Session):
    """Two selected tags mean UNION by default (T-36.8, case T36-D).

    DELIBERATE flip of the pre-T-36 AND-only behaviour: tags are categories,
    and two chips usually mean "sales and also urgent stuff". `urgent` alone
    matches one meeting; adding `q3` must WIDEN to two, not narrow.
    """
    q3_id, urgent_id = _tag_ids(library)

    one = client.get("/api/v1/meetings", params={"tags": str(urgent_id)}).json()
    assert titles(one) == ["Q3 Product Roadmap Sync"]

    both = client.get("/api/v1/meetings", params={"tags": f"{q3_id},{urgent_id}"}).json()
    assert set(titles(both)) == {"Q3 Product Roadmap Sync", "Weekly Engineering Standup"}
    assert both["total"] == 2


def test_tags_mode_and_narrows_to_the_intersection(client: TestClient, library: Session):
    """The labelled AND toggle (T-36.8, case T36-E): only the meeting carrying
    BOTH tags survives, and the total follows."""
    q3_id, urgent_id = _tag_ids(library)

    body = client.get(
        "/api/v1/meetings",
        params={"tags": f"{q3_id},{urgent_id}", "tags_mode": "and"},
    ).json()

    assert titles(body) == ["Q3 Product Roadmap Sync"]
    assert body["total"] == 1


def test_a_non_numeric_tags_param_is_a_422_not_an_empty_page(client: TestClient, library: Session):
    """Ids, not names: a name in the URL after the switch should FAIL loudly —
    an empty page would read as "no meetings match" and hide the client bug."""
    response = client.get("/api/v1/meetings", params={"tags": "q3"})
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_has_action_items_means_OUTSTANDING_ones(client: TestClient, library: Session):
    """The discovery call has action items, but they are all completed.

    "Has action items" in a review context means outstanding work; a meeting
    whose tasks are finished is not the one being looked for.
    """
    body = client.get("/api/v1/meetings", params={"has_action_items": "true"}).json()
    assert titles(body) == ["Q3 Product Roadmap Sync"]

    body = client.get("/api/v1/meetings", params={"has_action_items": "false"}).json()
    assert "Acme Corp — Discovery Call" in titles(body)


def test_every_registered_filter_is_reachable_from_the_dataclass(db: Session):
    """`FILTERS` and `MeetingFilters` must not drift apart.

    A filter added to one and not the other either silently never runs or
    raises a KeyError on the first request that uses it.
    """
    for name in FILTERS:
        assert hasattr(MeetingFilters(), name), f"{name} is in FILTERS but not MeetingFilters"


def test_a_false_filter_value_is_not_dropped():
    """`has_action_items=False` is a real filter, not an absent one."""
    assert "has_action_items" in MeetingFilters(has_action_items=False).active()
    assert "min_duration" in MeetingFilters(min_duration=0).active()
    assert MeetingFilters().active() == {}
    assert "tags" in MeetingFilters(tags=TagSelection(ids=(1,))).active()


# ── Combinations (T11-G) ────────────────────────────────────────────────────


def test_t11_g_participant_and_action_items_intersect(client: TestClient, library: Session):
    body = client.get(
        "/api/v1/meetings",
        params={"participant": "Priya Raghunathan", "has_action_items": "true"},
    ).json()

    # Priya is in two meetings; only one has outstanding work.
    assert titles(body) == ["Q3 Product Roadmap Sync"]


def test_host_channel_and_date_combine(client: TestClient, library: Session):
    body = client.get(
        "/api/v1/meetings",
        params={
            "host": "Sarah",
            "channel": "product",
            "from": ANCHOR.date().isoformat(),
        },
    ).json()
    assert titles(body) == ["Q3 Product Roadmap Sync"]


def test_search_and_duration_combine(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"q": "q3", "max_duration": 2000}).json()
    assert titles(body) == ["Q3 Product Roadmap Sync"]


def test_a_combination_matching_nothing_returns_an_empty_page(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings", params={"host": "Sarah", "source": "manual"}).json()
    assert body["items"] == []
    assert body["total"] == 0
    assert body["total_pages"] == 0


def test_the_total_is_computed_through_the_same_filters_as_the_page(
    client: TestClient, library: Session
):
    """If `count` and the page query diverge, the last page comes back empty."""
    body = client.get("/api/v1/meetings", params={"host": "Sarah", "page_size": 1}).json()
    assert body["total"] == 2
    assert len(body["items"]) == 1
    assert body["has_next"] is True


# ── Sorting (T11-H, T11-I) ──────────────────────────────────────────────────


def test_t11_h_ascending_and_descending_are_exact_reverses(client: TestClient, library: Session):
    up = titles(client.get("/api/v1/meetings", params={"sort": "title"}).json())
    down = titles(client.get("/api/v1/meetings", params={"sort": "-title"}).json())

    assert up == sorted(up)
    assert down == list(reversed(up))


def test_t11_i_an_unknown_sort_is_rejected_and_the_table_survives(
    client: TestClient, library: Session
):
    response = client.get("/api/v1/meetings", params={"sort": "DROP TABLE meetings"})

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["error"]["code"] == "INVALID_SORT"

    # Still there.
    assert client.get("/api/v1/meetings").json()["total"] == 4


def test_sorting_is_stable_across_pages(client: TestClient, library: Session):
    """Equal sort keys need a tiebreak or rows repeat and vanish between pages.

    All four meetings sorted by a constant would otherwise come back in
    whatever order SQLite chose that time.
    """
    first = client.get("/api/v1/meetings", params={"sort": "title", "page_size": 2}).json()
    second = client.get(
        "/api/v1/meetings", params={"sort": "title", "page_size": 2, "page": 2}
    ).json()

    assert set(titles(first)).isdisjoint(titles(second))
    assert len(titles(first) + titles(second)) == 4


# ── Pagination (T11-J, T11-K) ───────────────────────────────────────────────


def test_t11_j_a_middle_page_returns_the_right_slice(client: TestClient, library: Session):
    everything = titles(client.get("/api/v1/meetings").json())

    page2 = client.get("/api/v1/meetings", params={"page": 2, "page_size": 3}).json()

    assert titles(page2) == everything[3:6]
    assert page2["has_next"] is False
    assert page2["total_pages"] == 2


def test_t11_k_a_page_past_the_end_is_empty_and_still_200(client: TestClient, library: Session):
    response = client.get("/api/v1/meetings", params={"page": 99})

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["items"] == []
    # The total still describes the collection, not the page.
    assert body["total"] == 4


def test_page_size_is_clamped_rather_than_rejected(client: TestClient, library: Session):
    response = client.get("/api/v1/meetings", params={"page_size": 5000})
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["page_size"] <= 100


# ── N+1 (T11-L) ─────────────────────────────────────────────────────────────


def test_t11_l_a_full_page_costs_a_bounded_number_of_statements(
    db: Session, library: Session, query_counter: list[str]
):
    """The assertion is on STATEMENT COUNT, because the results look identical
    either way — which is exactly why an N+1 regression goes unnoticed."""
    # One host for all the filler: `make_meeting` would otherwise create a new
    # user per call with the same default email and hit the unique constraint.
    filler_host = make_user(db, name="Filler Host")
    for i in range(16):
        make_meeting(
            db,
            host=filler_host,
            title=f"Filler {i}",
            started_at=ANCHOR - timedelta(days=30 + i),
        )
    db.commit()

    query_counter.clear()
    items, total = MeetingService(db).list_page(limit=20, offset=0)

    assert len(items) == 20
    assert total == 20

    selects = [s for s in query_counter if s.strip().upper().startswith("SELECT")]

    """
    DEVIATION from T11-L, which asks for ≤ 4.

    The floor for this data model is 8: the page query, the count, four
    `selectinload`s for the collections a row renders (participants, tags,
    keywords, summary), and two grouped aggregates (action-item counts,
    participant totals). Reaching 4 would mean denormalising counts onto
    `meetings` or dropping fields from the row — trading a real correctness
    surface for a number.

    What the case is actually protecting is that the count does not GROW with
    the page, which the test below asserts directly. This bound exists so a new
    eager relationship cannot quietly add statements: it caught exactly that —
    `segments`, `speakers`, `action_items` and `summary.sections` were all
    `lazy="selectin"`, so every Notebook page was loading ~1,200 transcript
    segments per meeting behind a response that did not contain them.
    """
    assert len(selects) <= 9, "\n".join(selects)

    # And nothing heavy came along for the ride.
    joined = " ".join(selects)
    assert "FROM transcript_segments" not in joined
    assert "FROM summary_sections" not in joined


def test_the_statement_count_does_not_grow_with_the_page(
    db: Session, library: Session, query_counter: list[str]
):
    service = MeetingService(db)

    query_counter.clear()
    service.list_page(limit=2, offset=0)
    small = len([s for s in query_counter if s.strip().upper().startswith("SELECT")])

    filler_host = make_user(db, name="Filler Host")
    for i in range(16):
        make_meeting(
            db,
            host=filler_host,
            title=f"Filler {i}",
            started_at=ANCHOR - timedelta(days=30 + i),
        )
    db.commit()

    query_counter.clear()
    service.list_page(limit=20, offset=0)
    large = len([s for s in query_counter if s.strip().upper().startswith("SELECT")])

    assert large == small, "statement count scales with rows — that is the N+1"


# ── Facets (T11-8) ──────────────────────────────────────────────────────────


def test_facets_are_derived_from_real_data(client: TestClient, library: Session):
    body = client.get("/api/v1/meetings/facets").json()

    assert "Sarah Okonkwo" in body["hosts"]
    assert "Priya Raghunathan" in body["participants"]
    # Tags carry id (the filter key), colour and a live count (T-36.5): the
    # chip cloud draws all three. q3 is on two meetings, urgent on one.
    tags = {facet["name"]: facet for facet in body["tags"]}
    assert set(tags) == {"q3", "urgent"}
    assert tags["q3"]["count"] == 2
    assert tags["urgent"]["count"] == 1
    assert set(tags["q3"]) == {"id", "name", "color_index", "count"}
    assert set(body["channels"]) == {"product", "sales"}
    assert body["min_duration"] == 600
    assert body["max_duration"] == 3600


def test_facets_exclude_deleted_meetings(client: TestClient, library: Session):
    """A filter that offers an option matching nothing loses the user's trust."""
    sales_meeting = (
        library.execute(Meeting.not_deleted().where(Meeting.title.contains("Acme"))).scalars().one()
    )
    sales_meeting.deleted_at = datetime.now(UTC)
    library.commit()

    body = client.get("/api/v1/meetings/facets").json()
    assert "sales" not in body["channels"]


# ── Conditional requests (T-11.11) ──────────────────────────────────────────


def test_a_repeat_request_with_a_matching_etag_is_a_304(client: TestClient, library: Session):
    first = client.get("/api/v1/meetings")
    etag = first.headers["etag"]

    assert first.headers["cache-control"] == "no-cache"
    assert etag.startswith('W/"')

    second = client.get("/api/v1/meetings", headers={"If-None-Match": etag})
    assert second.status_code == status.HTTP_304_NOT_MODIFIED
    # RFC 9110: a 304 carries no body.
    assert second.content == b""
    assert second.headers["etag"] == etag


def test_the_etag_changes_when_the_data_does(client: TestClient, library: Session):
    """`no-cache` means revalidate, so a stale list after an edit is the bug
    this guards against."""
    before = client.get("/api/v1/meetings").headers["etag"]

    meeting = library.execute(Meeting.not_deleted()).scalars().first()
    assert meeting is not None
    meeting.title = "Renamed"
    library.commit()

    after = client.get("/api/v1/meetings").headers["etag"]
    assert before != after

    # And the old validator no longer short-circuits.
    assert (
        client.get("/api/v1/meetings", headers={"If-None-Match": before}).status_code
        == status.HTTP_200_OK
    )


def test_different_filters_get_different_etags(client: TestClient, library: Session):
    everything = client.get("/api/v1/meetings").headers["etag"]
    filtered = client.get("/api/v1/meetings", params={"host": "Sarah"}).headers["etag"]
    assert everything != filtered


# ── Statement-level filter unit tests ───────────────────────────────────────


def test_apply_filters_is_order_independent(db: Session):
    """Each filter is an independent AND; folding order must not matter."""
    a = MeetingFilters(host="Sarah", min_duration=100)
    b = MeetingFilters(min_duration=100, host="Sarah")

    sql_a = str(apply_filters(Meeting.not_deleted(), a))
    sql_b = str(apply_filters(Meeting.not_deleted(), b))
    assert sql_a == sql_b


def test_an_empty_filter_set_changes_nothing(db: Session):
    base = Meeting.not_deleted()
    assert str(apply_filters(base, MeetingFilters())) == str(base)


def test_the_to_date_filter_uses_a_half_open_upper_bound(db: Session):
    sql = str(apply_filters(Meeting.not_deleted(), MeetingFilters(to_date=date(2026, 7, 26))))
    # `<` and not `<=`: the bound is the START of the next day.
    assert "meetings.started_at <" in sql
    assert "meetings.started_at <=" not in sql


# ── Bulk operations (T-14.5, T-14.6) ────────────────────────────────────────


def test_bulk_delete_reports_partial_failure(client: TestClient, library: Session):
    """An already-deleted id is REPORTED, not fatal.

    Aborting the batch would leave the user guessing which of three deletes
    happened; the partial result is what lets the UI say "2 of 3 deleted".
    """
    ids = [m.id for m in library.execute(Meeting.not_deleted()).scalars()][:2]

    body = client.post("/api/v1/meetings/bulk-delete", json={"ids": [*ids, 9999]}).json()

    assert body["deleted"] == 2
    assert body["failed"] == [9999]
    assert client.get("/api/v1/meetings").json()["total"] == 2


def test_bulk_restore_undoes_a_bulk_delete(client: TestClient, library: Session):
    ids = [m.id for m in library.execute(Meeting.not_deleted()).scalars()][:2]
    client.post("/api/v1/meetings/bulk-delete", json={"ids": ids})
    assert client.get("/api/v1/meetings").json()["total"] == 2

    body = client.post("/api/v1/meetings/bulk-restore", json={"ids": ids}).json()

    assert body["restored"] == 2
    assert body["failed"] == []
    assert client.get("/api/v1/meetings").json()["total"] == 4


def test_bulk_restore_reports_ids_that_were_never_deleted(client: TestClient, library: Session):
    live = [m.id for m in library.execute(Meeting.not_deleted()).scalars()][:1]

    body = client.post("/api/v1/meetings/bulk-restore", json={"ids": live}).json()

    assert body["restored"] == 0
    assert body["failed"] == live


def test_bulk_endpoints_reject_an_empty_batch(client: TestClient, library: Session):
    # A no-op request is a client bug; answering 200 hides it.
    for path in ("bulk-delete", "bulk-restore"):
        assert client.post(f"/api/v1/meetings/{path}", json={"ids": []}).status_code == 422


# ── Details drawer data (T-15) ──────────────────────────────────────────────


def test_detail_carries_attendance_and_talk_time(client: TestClient, library: Session):
    """The drawer distinguishes invited from attended, and shows how long each
    person spoke — `ParticipantRef` deliberately carries neither."""
    meeting = library.execute(Meeting.not_deleted()).scalars().first()
    assert meeting is not None

    body = client.get(f"/api/v1/meetings/{meeting.id}").json()
    participant = body["participants"][0]

    assert set(participant) >= {"attended", "talk_seconds", "email", "color_index"}
    assert isinstance(participant["attended"], bool)


def test_the_light_row_still_does_not_carry_attendance(client: TestClient, library: Session):
    """A Notebook page holds twenty rows; shipping attendance for a hundred
    people nobody looks at is exactly the weight T-04.4 warns about."""
    row = client.get("/api/v1/meetings").json()["items"][0]
    assert "talk_seconds" not in str(row)


def test_action_items_can_be_ticked_and_unticked(client: TestClient, library: Session):
    meeting = (
        library.execute(Meeting.not_deleted().where(Meeting.title.contains("Roadmap")))
        .scalars()
        .one()
    )

    items = client.get(f"/api/v1/meetings/{meeting.id}/action-items").json()
    assert len(items) == 2
    assert items[0]["status"] == "open"

    ticked = client.patch(
        f"/api/v1/meetings/action-items/{items[0]['id']}", json={"status": "completed"}
    ).json()
    assert ticked["status"] == "completed"

    # And the counts the Notebook row shows follow.
    row = next(m for m in client.get("/api/v1/meetings").json()["items"] if m["id"] == meeting.id)
    assert row["action_item_counts"] == {"open": 1, "completed": 1}

    unticked = client.patch(
        f"/api/v1/meetings/action-items/{items[0]['id']}", json={"status": "open"}
    ).json()
    assert unticked["status"] == "open"


def test_action_items_for_a_deleted_meeting_are_410_not_empty(client: TestClient, library: Session):
    """An empty list would read as "no action items" rather than "gone"."""
    from datetime import UTC as _UTC
    from datetime import datetime as _datetime

    meeting = library.execute(Meeting.not_deleted()).scalars().first()
    assert meeting is not None
    meeting.deleted_at = _datetime.now(_UTC)
    library.commit()

    response = client.get(f"/api/v1/meetings/{meeting.id}/action-items")
    assert response.status_code == status.HTTP_410_GONE


def test_ticking_an_unknown_action_item_is_404(client: TestClient, library: Session):
    response = client.patch("/api/v1/meetings/action-items/9999", json={"status": "open"})
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["error"]["code"] == "ACTION_ITEM_NOT_FOUND"
