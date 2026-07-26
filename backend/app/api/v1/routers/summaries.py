"""Summary endpoints.

Only the regeneration route exists at this stage — it is the one that needs the
rate limiter, and T-23/T-29 fill in the actual generation.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.api.responses import NOT_FOUND_OR_GONE, RATE_LIMITED
from app.core.deps import DbSession
from app.core.rate_limit import AI_RATE_LIMIT, limiter
from app.schemas.summary import SummaryOut
from app.services.meetings import MeetingService

router = APIRouter(prefix="/meetings", tags=["summaries"])


@router.get(
    "/{meeting_id}/summary",
    response_model=SummaryOut,
    responses=NOT_FOUND_OR_GONE,
    summary="Get a meeting summary",
    description=(
        "The stored summary. T-20 builds the full panel on this; the details "
        "drawer uses the overview alone."
    ),
)
def get_summary(db: DbSession, meeting_id: int) -> SummaryOut:
    service = MeetingService(db)
    meeting = service.get(meeting_id)
    return service.to_summary(meeting)


@router.post(
    "/{meeting_id}/summary/regenerate",
    response_model=SummaryOut,
    summary="Regenerate a meeting summary",
    description=(
        "Rate limited to 10 requests per minute — this is the endpoint that "
        "calls a model, and an accidental double-click should not double the bill."
    ),
    responses={**NOT_FOUND_OR_GONE, **RATE_LIMITED},
)
@limiter.limit(AI_RATE_LIMIT)
def regenerate_summary(
    # Unused by the handler, but slowapi inspects the signature for a parameter
    # named exactly `request` to read the client address from — renaming it or
    # dropping it silently disables the rate limit.
    request: Request,  # noqa: ARG001
    db: DbSession,
    meeting_id: int,
) -> SummaryOut:
    service = MeetingService(db)
    meeting = service.get(meeting_id)

    # T-29 swaps this for a real provider call. The endpoint exists now so the
    # contract, the rate limit and the error envelope are settled before the
    # thing that costs money is wired in.
    return service.to_summary(meeting)
