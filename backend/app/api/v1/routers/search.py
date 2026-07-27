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
    q: Annotated[
        str,
        Query(
            description=(
                "Search term. Supports quoted phrases, `-exclusion`, "
                "`speaker:Name`, `before:` and `after:` dates (T-35.3); "
                "everything else is matched literally, never as a pattern."
            )
        ),
    ],
    limit: Annotated[int, Query(ge=1, le=50, description="Max hits per group.")] = 5,
    offset: Annotated[int, Query(ge=0, description="Into the transcript hits only.")] = 0,
    host: Annotated[
        str | None,
        Query(description="Restrict to one host, by exact name (the facets list supplies them)."),
    ] = None,
    scope: Annotated[
        str,
        Query(pattern="^(all|meetings|transcript)$", description="Which groups to return."),
    ] = "all",
) -> SearchResults:
    return SearchService(db).search(q, limit=limit, offset=offset, host=host, scope=scope)
