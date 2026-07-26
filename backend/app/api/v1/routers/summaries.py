"""Summary endpoints.

Only the regeneration route exists at this stage — it is the one that needs the
rate limiter, and T-23/T-29 fill in the actual generation.
"""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.core.deps import DbSession
from app.core.rate_limit import AI_RATE_LIMIT, limiter
from app.schemas.summary import SummaryOut
from app.services.meetings import MeetingService

router = APIRouter(prefix="/meetings", tags=["summaries"])


@router.post(
    "/{meeting_id}/summary/regenerate",
    response_model=SummaryOut,
    summary="Regenerate a meeting summary",
    description=(
        "Rate limited to 10 requests per minute — this is the endpoint that "
        "calls a model, and an accidental double-click should not double the bill."
    ),
    responses={429: {"description": "Rate limit exceeded."}},
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
    return SummaryOut(
        meeting_id=meeting.id,
        overview=meeting.summary.overview if meeting.summary else None,
        provider=meeting.summary.provider if meeting.summary else "mock",
        is_stale=False,
        generated_at=meeting.summary.generated_at if meeting.summary else None,
    )
