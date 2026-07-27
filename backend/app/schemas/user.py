"""User-facing representations."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class UserRef(BaseModel):
    """The minimum needed to render an avatar and a name.

    Deliberately not the full user record: this is embedded in every meeting
    row, so anything added here is paid for 20 times per page.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    avatar_url: str | None = None


class UserOut(UserRef):
    """The signed-in user's own record, from `/me`."""

    email: str = Field(description="Only ever returned for the current user.")


class TeamMemberOut(UserRef):
    """A row of the Team page's members table (T-30.4).

    No email — `UserOut` establishes that email is only ever returned for the
    current user, and a placeholder page is not a reason to widen that.
    `role` is presentation-only until real auth exists: the seeded default
    user reads as the workspace admin, everyone else as a member.
    """

    role: str = Field(description="'Admin' for the seeded default user, else 'Member'.")
    meetings_hosted: int = Field(ge=0)
