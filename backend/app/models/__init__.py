"""SQLAlchemy models.

Importing this package registers every mapper on `Base.metadata`, which is what
Alembic's autogenerate and the test fixtures rely on. Import models FROM HERE
rather than from their individual modules, so a partially-populated metadata can
never produce a migration that drops half the schema.
"""

from __future__ import annotations

from app.db.base import Base
from app.models.action_item import ActionItem
from app.models.channel import Channel
from app.models.comment import Comment, CommentMention
from app.models.enums import (
    ActionItemSource,
    ActionItemStatus,
    HighlightColor,
    MediaType,
    MeetingSource,
    ParticipantRole,
    ProcessingStatus,
    SummarySectionKind,
    Visibility,
)
from app.models.highlight import Bookmark, Highlight
from app.models.keyword import Keyword
from app.models.meeting import Meeting
from app.models.participant import Participant
from app.models.soundbite import Soundbite
from app.models.speaker import Speaker
from app.models.summary import Summary, SummarySection
from app.models.tag import Tag, meeting_tags
from app.models.transcript import TranscriptSegment
from app.models.user import User

__all__ = [
    "ActionItem",
    "ActionItemSource",
    "ActionItemStatus",
    "Base",
    "Bookmark",
    "Channel",
    "Comment",
    "CommentMention",
    "Highlight",
    "HighlightColor",
    "Keyword",
    "MediaType",
    "Meeting",
    "MeetingSource",
    "Participant",
    "ParticipantRole",
    "ProcessingStatus",
    "Soundbite",
    "Speaker",
    "Summary",
    "SummarySection",
    "SummarySectionKind",
    "Tag",
    "TranscriptSegment",
    "User",
    "Visibility",
    "meeting_tags",
]
