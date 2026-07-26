"""Meeting list filters as composable query builders (T-11.4).

Every filter is a function `(stmt, value) -> stmt`, registered in `FILTERS`, and
the service folds the active ones over the base statement. Adding a filter means
writing a function and adding one dict entry — never threading it through a
sixty-line `if` chain that every future filter also has to survive.

The other reason for the shape: each filter is independently testable against a
statement, so T-11.13's "every filter individually, then three combinations" is
a loop rather than thirteen near-identical test bodies.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from sqlalchemy import Select, func, or_, select

from app.db.search import to_fts_query, transcript_fts
from app.models import (
    ActionItem,
    Channel,
    Meeting,
    Participant,
    Speaker,
    Summary,
    Tag,
    TranscriptSegment,
    User,
)
from app.models.enums import ActionItemStatus, MeetingSource

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

type MeetingStmt = Select[tuple[Meeting]]


@dataclass(frozen=True, slots=True)
class MeetingFilters:
    """Everything `GET /meetings` can narrow by (T-11.1).

    A dataclass rather than loose kwargs, so the set is enumerable — the
    router, the facets endpoint and the tests all read from one definition.
    """

    q: str | None = None
    host: str | None = None
    participant: str | None = None
    from_date: date | None = None
    to_date: date | None = None
    min_duration: int | None = None
    max_duration: int | None = None
    #: Tag NAMES. Tags have no slug — the name is the identity, uniquely
    #: constrained, and what the chip displays.
    tags: tuple[str, ...] = ()
    channel: str | None = None
    has_action_items: bool | None = None
    source: MeetingSource | None = None

    def active(self) -> dict[str, Any]:
        """Only the filters the caller actually set.

        Checks for None and emptiness rather than truthiness: `has_action_items
        =False` is a real filter meaning "meetings with nothing outstanding",
        and `min_duration=0` is a real bound. Truthiness would drop both.
        """
        values: dict[str, Any] = {}
        for name in FILTERS:
            value = getattr(self, name)
            if value is None or (isinstance(value, tuple) and not value):
                continue
            values[name] = value
        return values


# ── Individual filters ──────────────────────────────────────────────────────
#
# Each takes a statement and one value and returns a new statement. None of them
# may assume another has run, and none may reorder or limit.


def _filter_q(stmt: MeetingStmt, value: str) -> MeetingStmt:
    """Free text across title, overview, participant names and the transcript.

    The transcript arm is an `IN (subquery)`, not a join. A join would return a
    meeting once per matching segment — fifty duplicate rows for a well-matched
    meeting, which silently corrupts both the page and the total.
    """
    term = value.strip()
    if not term:
        return stmt

    clauses = [
        Meeting.title.icontains(term, autoescape=True),
        Meeting.summary.has(Summary.overview.icontains(term, autoescape=True)),
        Meeting.participants.any(Participant.display_name.icontains(term, autoescape=True)),
    ]

    # `to_fts_query` because FTS5 parses its argument as a query language and a
    # bare `a.*b` is a syntax error, not a non-match (ADR-022).
    match = to_fts_query(term)
    if match:
        clauses.append(Meeting.id.in_(_meeting_ids_matching_transcript(match)))

    return stmt.where(or_(*clauses))


def _meeting_ids_matching_transcript(match: str) -> Select[tuple[int]]:
    matching_segments = select(transcript_fts.c.segment_id).where(
        transcript_fts.c.transcript_fts.op("MATCH")(match)
    )
    return select(TranscriptSegment.meeting_id).where(TranscriptSegment.id.in_(matching_segments))


def _filter_host(stmt: MeetingStmt, value: str) -> MeetingStmt:
    """By host NAME, not id — the filter panel shows people, not primary keys."""
    return stmt.where(Meeting.host.has(User.name.icontains(value, autoescape=True)))


def _filter_participant(stmt: MeetingStmt, value: str) -> MeetingStmt:
    return stmt.where(
        Meeting.participants.any(Participant.display_name.icontains(value, autoescape=True))
    )


def _filter_from_date(stmt: MeetingStmt, value: date) -> MeetingStmt:
    """Inclusive start, interpreted in UTC (T-11.9)."""
    start = datetime.combine(value, datetime.min.time(), tzinfo=UTC)
    return stmt.where(Meeting.started_at >= start)


def _filter_to_date(stmt: MeetingStmt, value: date) -> MeetingStmt:
    """Inclusive END — `to=2026-07-26` includes everything ON the 26th.

    This is the most common filter bug there is. `started_at <= to` compares
    against midnight and silently drops the whole final day, so a user
    filtering "up to today" sees nothing from today and concludes the filter is
    broken. The rule is `< to + 1 day`, and it is written once, here.
    """
    end = datetime.combine(value, datetime.min.time(), tzinfo=UTC) + timedelta(days=1)
    return stmt.where(Meeting.started_at < end)


def _filter_min_duration(stmt: MeetingStmt, value: int) -> MeetingStmt:
    return stmt.where(Meeting.duration_seconds >= value)


def _filter_max_duration(stmt: MeetingStmt, value: int) -> MeetingStmt:
    return stmt.where(Meeting.duration_seconds <= value)


def _filter_tags(stmt: MeetingStmt, value: tuple[str, ...]) -> MeetingStmt:
    """ALL of the given tags, not any.

    Tags narrow. Selecting `#product` and `#q3` and getting back everything
    tagged either one is the opposite of what two active chips imply.
    """
    for name in value:
        stmt = stmt.where(Meeting.tags.any(Tag.name == name))
    return stmt


def _filter_channel(stmt: MeetingStmt, value: str) -> MeetingStmt:
    return stmt.where(Meeting.channel.has(Channel.slug == value))


def _filter_has_action_items(stmt: MeetingStmt, value: bool) -> MeetingStmt:
    """Whether the meeting has any OPEN action items.

    "Has action items" in a review context means outstanding ones — a meeting
    whose tasks are all finished is not the one being looked for.
    """
    outstanding = Meeting.action_items.any(ActionItem.status == ActionItemStatus.OPEN)
    return stmt.where(outstanding if value else ~outstanding)


def _filter_source(stmt: MeetingStmt, value: MeetingSource) -> MeetingStmt:
    return stmt.where(Meeting.source == value)


#: Registry. Keys are `MeetingFilters` attribute names. Order is irrelevant —
#: every filter is an independent AND.
#:
#: The values are deliberately typed loosely: each function takes its own value
#: type, and a precise signature would need a per-filter generic that buys
#: nothing. `MeetingFilters` is where the types are actually enforced.
FILTERS: dict[str, Callable[[MeetingStmt, Any], MeetingStmt]] = {
    "q": _filter_q,
    "host": _filter_host,
    "participant": _filter_participant,
    "from_date": _filter_from_date,
    "to_date": _filter_to_date,
    "min_duration": _filter_min_duration,
    "max_duration": _filter_max_duration,
    "tags": _filter_tags,
    "channel": _filter_channel,
    "has_action_items": _filter_has_action_items,
    "source": _filter_source,
}


def apply_filters(stmt: MeetingStmt, filters: MeetingFilters) -> MeetingStmt:
    """Fold every active filter over the statement."""
    for name, value in filters.active().items():
        stmt = FILTERS[name](stmt, value)
    return stmt


@dataclass(frozen=True, slots=True)
class MatchContext:
    """Why a meeting matched, when the reason is not visible in the row (T-11.3).

    A title hit needs no explanation — the user can see it. A transcript hit
    looks like a false positive unless the row shows the line that matched.
    """

    snippet: str
    speaker: str
    start_ms: int


def transcript_match_contexts(
    db: Session, meeting_ids: list[int], query: str
) -> dict[int, MatchContext]:
    """The best transcript hit per meeting, in ONE query.

    Called after the page is fetched, with only the ids on that page, so it
    costs a single statement rather than one per row.
    """
    match = to_fts_query(query)
    if not match or not meeting_ids:
        return {}

    # A participant's real name when the speaker was matched to one, the raw
    # diarisation label ("Speaker 2") when they were not.
    speaker_label = func.coalesce(Participant.display_name, Speaker.label)

    stmt = (
        select(
            TranscriptSegment.meeting_id,
            func.snippet(transcript_fts.c.transcript_fts, 0, "", "", "…", 16).label("snippet"),
            speaker_label.label("speaker"),
            TranscriptSegment.start_ms,
        )
        .select_from(transcript_fts)
        .join(TranscriptSegment, TranscriptSegment.id == transcript_fts.c.segment_id)
        .join(Speaker, Speaker.id == TranscriptSegment.speaker_id)
        .outerjoin(Participant, Participant.id == Speaker.participant_id)
        .where(transcript_fts.c.transcript_fts.op("MATCH")(match))
        .where(TranscriptSegment.meeting_id.in_(meeting_ids))
        # bm25 is negative-is-better, so ASC puts the strongest hit first.
        .order_by(func.bm25(transcript_fts.c.transcript_fts))
    )

    best: dict[int, MatchContext] = {}
    for row in db.execute(stmt).mappings():
        # Rows arrive best-first, so the first one seen per meeting wins.
        if row["meeting_id"] in best:
            continue
        best[row["meeting_id"]] = MatchContext(
            snippet=row["snippet"], speaker=row["speaker"], start_ms=row["start_ms"]
        )
    return best


@dataclass(frozen=True, slots=True)
class Facets:
    """What the filter panel can offer, derived from real data (T-11.8)."""

    hosts: list[str] = field(default_factory=list)
    participants: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    channels: list[str] = field(default_factory=list)
    min_duration: int = 0
    max_duration: int = 0


def build_facets(db: Session) -> Facets:
    """Distinct values across non-deleted meetings.

    Derived rather than hardcoded, so the panel can never offer an option that
    matches nothing — which is how a filter panel loses the user's trust on the
    first click.
    """
    live = Meeting.deleted_at.is_(None)

    hosts = db.execute(
        select(User.name).join(Meeting, Meeting.host_id == User.id).where(live).distinct()
    ).scalars()

    participants = db.execute(
        select(Participant.display_name)
        .join(Meeting, Meeting.id == Participant.meeting_id)
        .where(live)
        .distinct()
    ).scalars()

    tags = db.execute(select(Tag.name).join(Tag.meetings).where(live).distinct()).scalars()

    channels = db.execute(
        select(Channel.slug).join(Meeting, Meeting.channel_id == Channel.id).where(live).distinct()
    ).scalars()

    bounds = db.execute(
        select(func.min(Meeting.duration_seconds), func.max(Meeting.duration_seconds)).where(live)
    ).one()

    return Facets(
        hosts=sorted(hosts),
        participants=sorted(participants),
        tags=sorted(tags),
        channels=sorted(channels),
        min_duration=int(bounds[0] or 0),
        max_duration=int(bounds[1] or 0),
    )
