"""Domain enumerations.

`StrEnum` so a member serialises straight to JSON and compares equal to a plain
string, which keeps Pydantic schemas and test assertions readable. (`(str, Enum)`
is the pre-3.11 spelling of the same idea.)

SQLAlchemy stores these as VARCHAR plus a CHECK constraint. The constraint is
named via the convention in db/base.py so Alembic can recreate it under SQLite's
batch mode.
"""

from __future__ import annotations

from enum import Enum, StrEnum

from sqlalchemy import Enum as SAEnum


def enum_column[E: Enum](enum_cls: type[E], name: str) -> SAEnum:
    """Build the column type for a domain enum.

    `values_callable` is the important argument and the reason this helper
    exists. By default SQLAlchemy persists an enum's MEMBER NAME, so
    `MediaType.AUDIO` would be stored as `"AUDIO"` and the CHECK constraint
    would permit only the uppercase forms — while Pydantic, the JSON API, the
    seed fixtures and every test assertion use `"audio"`. The mismatch is
    invisible through the ORM, which translates both ways, and only surfaces
    when something reads the database directly: a raw SQL filter, a seed file,
    a hand-written migration.

    Storing the VALUE keeps one spelling from the database to the browser.

    `native_enum=False` renders as VARCHAR + CHECK, which is what SQLite
    supports; `validate_strings=True` rejects an unknown string on write rather
    than letting it reach the constraint.
    """
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        validate_strings=True,
        values_callable=lambda enum: [member.value for member in enum],
    )


class MediaType(StrEnum):
    AUDIO = "audio"
    VIDEO = "video"
    NONE = "none"


class MeetingSource(StrEnum):
    UPLOAD = "upload"
    MANUAL = "manual"
    SEED = "seed"
    INTEGRATION = "integration"


class Visibility(StrEnum):
    PRIVATE = "private"
    TEAM = "team"
    PUBLIC = "public"


class ProcessingStatus(StrEnum):
    PENDING = "pending"
    PROCESSING = "processing"
    READY = "ready"
    FAILED = "failed"


class ParticipantRole(StrEnum):
    HOST = "host"
    ATTENDEE = "attendee"
    INVITED = "invited"


class SummarySectionKind(StrEnum):
    """Only the REPEATING parts of a summary.

    Deliberately narrower than PLAN.md's four-value enum. The overview is a
    scalar on `summaries`, and keywords have their own table — including them
    here gave each of those two homes with nothing deciding which wins. See
    docs/schema.md "Two problems found while drawing this".
    """

    OUTLINE = "outline"
    NOTES = "notes"


class ActionItemStatus(StrEnum):
    OPEN = "open"
    COMPLETED = "completed"


class ActionItemSource(StrEnum):
    AI = "ai"
    MANUAL = "manual"


class HighlightColor(StrEnum):
    AMBER = "amber"
    GREEN = "green"
    BLUE = "blue"
    PINK = "pink"
