"""Workspace member listing (T-30.4)."""

from __future__ import annotations

from fastapi import APIRouter

from app.core.deps import DbSession, Pagination
from app.schemas.common import Page
from app.schemas.user import TeamMemberOut
from app.services.users import UserService

router = APIRouter(prefix="/users", tags=["users"])


@router.get(
    "",
    response_model=Page[TeamMemberOut],
    summary="List workspace members",
    description=(
        "Everyone in the (single, seeded) workspace, for the Team page. "
        "Emails are deliberately absent — those are only ever returned for "
        "the current user via /me."
    ),
)
def list_users(db: DbSession, pagination: Pagination) -> Page[TeamMemberOut]:
    return UserService(db).list_members(pagination)
