"""AskFred (T-37): one question in, one grounded answer out."""

from __future__ import annotations

from fastapi import APIRouter, Request

from app.ai import AIProviderDep
from app.api.responses import NOT_FOUND_OR_GONE, RATE_LIMITED, VALIDATION
from app.core.deps import DbSession
from app.core.rate_limit import AI_RATE_LIMIT, limiter
from app.schemas.ask import AskRequest, AskResponse
from app.services.ask import AskService

router = APIRouter(prefix="/meetings", tags=["ask"])


@router.post(
    "/{meeting_id}/ask",
    response_model=AskResponse,
    responses={**NOT_FOUND_OR_GONE, **RATE_LIMITED, **VALIDATION},
    summary="Ask a question about this meeting",
    description=(
        "Retrieval first, then generation: the answer is built from the "
        "segments that actually match the question, and every response carries "
        "citations back into the transcript — or says plainly that the meeting "
        "does not cover it. History is truncated server-side to the last six "
        "turns. Rate limited with the other model-calling endpoints."
    ),
)
@limiter.limit(AI_RATE_LIMIT)
def ask(
    # slowapi reads the client address from a parameter named exactly
    # `request`; renaming or dropping it silently disables the limit.
    request: Request,  # noqa: ARG001
    db: DbSession,
    meeting_id: int,
    payload: AskRequest,
    provider: AIProviderDep,
) -> AskResponse:
    return AskService(db).ask(meeting_id, payload, provider)
