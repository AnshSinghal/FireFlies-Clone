"""Soundbite endpoints (T-33.1, T-33.8).

Collection routes hang off the meeting (`/meetings/{id}/soundbites`); the item
route addresses the clip directly (`/soundbites/{id}`) — the comments
precedent: the id is globally unique, and repeating the meeting id would only
add a mismatch case to validate.

No download endpoint on purpose: ffmpeg is not available on the deploy host,
so T-33.10 ships as a disabled button with an explanatory tooltip rather than
a route that produces a corrupt file.
"""

from __future__ import annotations

from fastapi import APIRouter, Request, status

from app.ai import AIProviderDep
from app.api.responses import NOT_FOUND, NOT_FOUND_OR_GONE, RATE_LIMITED
from app.core.deps import CurrentUser, DbSession
from app.core.rate_limit import AI_RATE_LIMIT, limiter
from app.schemas.soundbite import SoundbiteCreate, SoundbiteListOut, SoundbiteOut
from app.schemas.soundbite import SoundbiteProposalListOut as ProposalListOut
from app.services.meetings import MeetingService
from app.services.soundbites import SoundbiteService

router = APIRouter(tags=["soundbites"])


@router.get(
    "/meetings/{meeting_id}/soundbites",
    response_model=SoundbiteListOut,
    responses=NOT_FOUND_OR_GONE,
    summary="List soundbites",
    description="Every clip of the meeting, ordered by start time.",
)
def list_soundbites(db: DbSession, meeting_id: int) -> SoundbiteListOut:
    meeting = MeetingService(db).get(meeting_id)
    return SoundbiteService(db).list_for(meeting)


@router.get(
    "/meetings/{meeting_id}/soundbites/proposals",
    response_model=ProposalListOut,
    responses={**NOT_FOUND_OR_GONE, **RATE_LIMITED},
    summary="Propose auto-generated soundbites",
    description=(
        "Up to three clip candidates from the segments with the highest "
        "keyword density. Deterministic per meeting and never persisted — "
        "saving one is a plain POST with `auto_generated=true`."
    ),
)
@limiter.limit(AI_RATE_LIMIT)
def propose_soundbites(
    # Unused by the handler, but slowapi inspects the signature for a parameter
    # named exactly `request` to read the client address from — renaming it or
    # dropping it silently disables the rate limit.
    request: Request,  # noqa: ARG001
    db: DbSession,
    meeting_id: int,
    provider: AIProviderDep,
) -> ProposalListOut:
    meeting = MeetingService(db).get(meeting_id)
    return SoundbiteService(db).proposals(meeting, provider)


@router.post(
    "/meetings/{meeting_id}/soundbites",
    response_model=SoundbiteOut,
    status_code=status.HTTP_201_CREATED,
    responses=NOT_FOUND_OR_GONE,
    summary="Create a soundbite",
    description=(
        "A named clip of the meeting. The range must be 3 seconds to 3 "
        "minutes long and end inside the meeting."
    ),
)
def create_soundbite(
    db: DbSession, meeting_id: int, payload: SoundbiteCreate, user: CurrentUser
) -> SoundbiteOut:
    meeting = MeetingService(db).get(meeting_id)
    return SoundbiteService(db).create(meeting, payload, creator=user)


@router.delete(
    "/soundbites/{soundbite_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses=NOT_FOUND,
    summary="Delete a soundbite",
    description=(
        "Hard delete — a clip is a pointer into the transcript, and two "
        "integers recreate it. Nothing to restore, so no tombstone."
    ),
)
def delete_soundbite(db: DbSession, soundbite_id: int) -> None:
    SoundbiteService(db).delete(soundbite_id)
