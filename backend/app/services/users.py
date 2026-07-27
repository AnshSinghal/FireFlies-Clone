"""Workspace members (T-30.4).

One read path. It exists so the Team placeholder page shows the real seeded
workspace instead of hardcoded names — "mock members table (from seeded
users)" per the spec, with the emphasis on FROM SEEDED USERS.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.models import Meeting, User
from app.schemas.common import Page
from app.schemas.user import TeamMemberOut

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.core.deps import PaginationParams


class UserService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_members(self, pagination: PaginationParams) -> Page[TeamMemberOut]:
        """Every seeded user, with how many meetings each hosts.

        The lowest id is the seeded default user — the same rule
        `get_current_user` applies — so the 'Admin' label lands on the person
        the app signs you in as, and the two views can never disagree.
        """
        total = self.db.execute(select(func.count()).select_from(User)).scalar_one()
        admin_id = self.db.execute(select(func.min(User.id))).scalar_one_or_none()

        rows = self.db.execute(
            select(User, func.count(Meeting.id))
            .outerjoin(
                Meeting,
                # Soft-deleted meetings stay out of the count for the same
                # reason they stay out of the Notebook: to the user they are
                # gone.
                (Meeting.host_id == User.id) & Meeting.deleted_at.is_(None),
            )
            .group_by(User.id)
            .order_by(User.id)
            .limit(pagination.limit)
            .offset(pagination.offset)
        ).all()

        members = [
            TeamMemberOut(
                id=user.id,
                name=user.name,
                avatar_url=user.avatar_url,
                role="Admin" if user.id == admin_id else "Member",
                meetings_hosted=hosted,
            )
            for user, hosted in rows
        ]
        return Page.build(
            members, page=pagination.page, page_size=pagination.limit, total=total
        )
