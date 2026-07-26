"""Channel schemas."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class ChannelOut(BaseModel):
    """A sidebar channel, with its meeting count.

    The count is what makes the rail feel alive rather than decorative, and it
    is aggregated server-side — the alternative is the client fetching every
    meeting just to group them.
    """

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    is_private: bool
    icon: str | None = None
    meeting_count: int = Field(description="Meetings in this channel, excluding deleted.")
