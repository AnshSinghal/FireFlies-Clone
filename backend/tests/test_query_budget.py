"""N+1 guards on the two hot endpoints (T-43.10, case T43-E).

Route-level on purpose, where `test_meetings_list.py`'s existing guard is
service-level: response serialisation is where accidental lazy loads hide —
a schema field that touches an unloaded relationship costs one SELECT per
row, and only a guard wrapped around the whole request sees it.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from tests.factories import make_full_meeting, make_meeting, make_user

if TYPE_CHECKING:
    from collections.abc import Callable
    from contextlib import AbstractContextManager

    from fastapi.testclient import TestClient
    from sqlalchemy.orm import Session

    QueryGuard = Callable[[int], AbstractContextManager[list[str]]]

# Measured floors: 9 SELECTs for a 20-row list page, 7 for a detail. Budgets
# are floor + 2. Tight enough that one per-row lazy load on a
# 20-row page (≈ +20 SELECTs) fails loudly; loose enough that adding one
# deliberate query is not a test-editing ceremony.
LIST_BUDGET = 11
DETAIL_BUDGET = 9


def test_t43_e_list_endpoint_stays_within_its_query_budget(
    client: TestClient,
    db: Session,
    assert_max_queries: QueryGuard,
) -> None:
    host = make_user(db, name="Budget Host")
    for i in range(20):
        make_meeting(db, host=host, title=f"Budget filler {i}")
    db.commit()

    with assert_max_queries(LIST_BUDGET):
        response = client.get("/api/v1/meetings", params={"page_size": 20})

    assert response.status_code == 200
    assert len(response.json()["items"]) == 20


def test_t43_e_detail_endpoint_stays_within_its_query_budget(
    client: TestClient,
    db: Session,
    assert_max_queries: QueryGuard,
) -> None:
    meeting = make_full_meeting(db)
    db.commit()

    with assert_max_queries(DETAIL_BUDGET):
        response = client.get(f"/api/v1/meetings/{meeting.id}")

    assert response.status_code == 200
    assert response.json()["id"] == meeting.id
