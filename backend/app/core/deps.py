"""FastAPI dependencies (T-04.8)."""

from __future__ import annotations

from typing import TYPE_CHECKING, Annotated

from fastapi import Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.exceptions import ServiceUnavailableError
from app.db.session import get_db
from app.models import User
from app.schemas.common import DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

DbSession = Annotated["Session", Depends(get_db)]


def get_current_user(db: DbSession) -> User:
    """The signed-in user.

    Authentication is out of scope per the assignment, so this returns the
    seeded default user. It is deliberately a DEPENDENCY rather than a module
    constant or a global: every route already declares that it needs a user, so
    swapping in real auth means changing this function's body and nothing else.
    No route signature changes, no call sites move.

    Ordering by id rather than picking arbitrarily keeps it deterministic, which
    matters for the visual-regression snapshots in T-41.
    """
    user = db.execute(select(User).order_by(User.id).limit(1)).scalar_one_or_none()
    if user is None:
        # Actionable rather than a bare 500 — this is what a fresh clone hits
        # before it has been seeded, and the fix is one command.
        raise ServiceUnavailableError(
            "No users exist yet. Run `make seed` to populate the demo data.",
            code="NOT_SEEDED",
        )
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


class PaginationParams(BaseModel):
    """Shared `?page=&page_size=` handling.

    `page_size` is CLAMPED rather than rejected (test T04-C). A client asking
    for 500 has made a reasonable request we will not serve in full; answering
    with 100 is more useful than a 422 telling them to ask again.
    """

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=DEFAULT_PAGE_SIZE, ge=1)

    @property
    def limit(self) -> int:
        return min(self.page_size, MAX_PAGE_SIZE)

    @property
    def offset(self) -> int:
        return (self.page - 1) * self.limit


def pagination(
    page: Annotated[int, Query(ge=1, description="1-indexed page number.")] = 1,
    page_size: Annotated[
        int,
        Query(ge=1, description=f"Items per page. Clamped to {MAX_PAGE_SIZE}."),
    ] = DEFAULT_PAGE_SIZE,
) -> PaginationParams:
    return PaginationParams(page=page, page_size=page_size)


Pagination = Annotated[PaginationParams, Depends(pagination)]
