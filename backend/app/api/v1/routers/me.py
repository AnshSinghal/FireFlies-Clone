"""The signed-in user."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.responses import UNAVAILABLE
from app.core.deps import CurrentUser
from app.schemas.user import UserOut

router = APIRouter(tags=["me"])


@router.get(
    "/me",
    response_model=UserOut,
    summary="Current user",
    description=(
        "Authentication is out of scope for this build: this returns the seeded "
        "default user. It is a dependency rather than a constant, so swapping in "
        "real auth changes one function and no route signatures."
    ),
    responses=UNAVAILABLE,
)
def read_me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user, from_attributes=True)
