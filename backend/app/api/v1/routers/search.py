"""Global search endpoint."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query

from app.core.deps import DbSession
from app.schemas.search import SearchResults
from app.services.search import SearchService

router = APIRouter(tags=["search"])


@router.get(
    "/search",
    response_model=SearchResults,
    summary="Search meetings and transcripts",
    description=(
        "FTS5-ranked, grouped into title matches and transcript matches. "
        "Snippets carry match RANGES rather than markup — the client wraps them, "
        "so transcript text containing HTML is rendered rather than executed. "
        "Queries shorter than two characters return nothing."
    ),
)
def search(
    db: DbSession,
    q: Annotated[str, Query(description="Search term. Treated literally, not as a pattern.")],
    limit: Annotated[int, Query(ge=1, le=50, description="Max hits per group.")] = 5,
) -> SearchResults:
    return SearchService(db).search(q, limit=limit)
