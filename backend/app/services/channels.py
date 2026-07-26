"""Channel listing."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, select

from app.models import Channel, Meeting
from app.schemas.channel import ChannelOut

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class ChannelService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def list_channels(self) -> list[ChannelOut]:
        """Every channel with its live meeting count, in ONE query.

        A LEFT JOIN rather than a count per channel: the sidebar renders on every
        page, so a per-row query here would be an N+1 on the most-loaded
        component in the app.

        The join condition carries `deleted_at IS NULL` rather than a WHERE
        clause — in a WHERE it would filter out channels that have no live
        meetings at all, and an empty channel should still appear in the rail
        showing zero.
        """
        rows = self.db.execute(
            select(Channel, func.count(Meeting.id))
            .outerjoin(
                Meeting,
                (Meeting.channel_id == Channel.id) & (Meeting.deleted_at.is_(None)),
            )
            .group_by(Channel.id)
            .order_by(Channel.is_private, Channel.name)
        ).all()

        return [
            ChannelOut(
                id=channel.id,
                name=channel.name,
                slug=channel.slug,
                is_private=channel.is_private,
                icon=channel.icon,
                meeting_count=int(count),
            )
            for channel, count in rows
        ]

    def total_meetings(self) -> int:
        """Backs the "All Meetings" count in the rail."""
        return int(
            self.db.execute(
                select(func.count()).select_from(Meeting).where(Meeting.deleted_at.is_(None))
            ).scalar_one()
        )

    def hosted_by(self, user_id: int) -> int:
        """Backs the "My Meetings" count."""
        return int(
            self.db.execute(
                select(func.count())
                .select_from(Meeting)
                .where(Meeting.deleted_at.is_(None), Meeting.host_id == user_id)
            ).scalar_one()
        )
