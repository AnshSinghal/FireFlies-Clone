"""Channel endpoints — backs the sidebar's CHANNELS section."""

from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.deps import CurrentUser, DbSession
from app.schemas.channel import ChannelOut
from app.services.channels import ChannelService

router = APIRouter(tags=["channels"])


class SidebarChannels(BaseModel):
    """Everything the rail's CHANNELS section needs, in one request.

    The two built-in views are counts rather than channel rows — "My Meetings"
    and "All Meetings" are filters over the same data, not stored channels —
    so returning them alongside avoids the client making three calls to render
    one list.
    """

    my_meetings: int
    all_meetings: int
    channels: list[ChannelOut]


@router.get(
    "/channels",
    response_model=SidebarChannels,
    summary="List channels with counts",
    description=(
        "Channels plus the two built-in views. Counts exclude deleted meetings, "
        "and a channel with no meetings still appears, showing zero."
    ),
)
def list_channels(db: DbSession, user: CurrentUser) -> SidebarChannels:
    service = ChannelService(db)
    return SidebarChannels(
        my_meetings=service.hosted_by(user.id),
        all_meetings=service.total_meetings(),
        channels=service.list_channels(),
    )
