"""Meeting business logic (T-04.7).

Everything the API does to a meeting happens here. Routers parse a request, call
one of these methods, and serialise the result — see `scripts/check_layering.py`,
which fails the build if a router reaches for the ORM directly.

T-11 extends `list_meetings` with the full filter set. This is the skeleton and
the contract; the shape is what matters now.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import Select, UnaryExpression, func, select
from sqlalchemy.orm import selectinload

from app.core.exceptions import MeetingDeletedError, MeetingNotFoundError
from app.models import ActionItem, Meeting, Participant, TranscriptSegment, User
from app.models.enums import ActionItemStatus, MediaType
from app.schemas.meeting import (
    ActionItemCounts,
    MeetingDetail,
    MeetingListItem,
    ParticipantRef,
    TagRef,
)
from app.schemas.user import UserRef

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.schemas.meeting import MeetingCreate, MeetingUpdate

#: How many participant avatars a Notebook row shows before collapsing to "+N".
#: The API sends a few more than the UI renders so a hover tooltip has names
#: without a second request.
PARTICIPANT_PREVIEW = 5

#: The row shows one clamped line; sending more is wasted bytes on every row.
OVERVIEW_PREVIEW_CHARS = 160

#: Explicitly typed. Without the annotation mypy widens the mixed values to
#: `object`, and `order_by(SORTABLE.get(...))` then fails to typecheck.
SORTABLE: dict[str, UnaryExpression[Any]] = {
    "started_at": Meeting.started_at.asc(),
    "-started_at": Meeting.started_at.desc(),
    "duration_seconds": Meeting.duration_seconds.asc(),
    "-duration_seconds": Meeting.duration_seconds.desc(),
    "title": Meeting.title.asc(),
    "-title": Meeting.title.desc(),
    "created_at": Meeting.created_at.asc(),
    "-created_at": Meeting.created_at.desc(),
}
DEFAULT_SORT = "-started_at"


class MeetingService:
    """Stateless apart from the session it was handed."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Reads ───────────────────────────────────────────────────────────────

    def _base_query(self) -> Select[tuple[Meeting]]:
        # Always starts from `not_deleted()`. Writing the filter by hand at each
        # call site is how a soft-deleted meeting eventually leaks into a list.
        return Meeting.not_deleted()

    def get(self, meeting_id: int) -> Meeting:
        """Fetch one meeting, distinguishing "deleted" from "never existed".

        410 vs 404 is a real difference to the client: a deleted meeting is
        restorable and the UI can offer that, while an unknown id is a dead end.
        """
        meeting = self.db.get(Meeting, meeting_id)
        if meeting is None:
            raise MeetingNotFoundError(details={"meeting_id": meeting_id})
        if meeting.deleted_at is not None:
            raise MeetingDeletedError(details={"meeting_id": meeting_id})
        return meeting

    def count(self, *, query: str | None = None) -> int:
        stmt = select(func.count()).select_from(Meeting).where(Meeting.deleted_at.is_(None))
        if query:
            stmt = stmt.where(Meeting.title.icontains(query))
        return int(self.db.execute(stmt).scalar_one())

    def list_meetings(
        self,
        *,
        limit: int,
        offset: int,
        query: str | None = None,
        sort: str = DEFAULT_SORT,
    ) -> list[Meeting]:
        """A page of meetings, newest first by default.

        `sort` is looked up in a WHITELIST rather than interpolated. Building
        `ORDER BY {sort}` from user input is a SQL injection with extra steps,
        and it is the one place an ORM does not protect you by default.
        """
        stmt = self._base_query()
        if query:
            stmt = stmt.where(Meeting.title.icontains(query))

        stmt = stmt.order_by(SORTABLE.get(sort, SORTABLE[DEFAULT_SORT]))
        stmt = stmt.limit(limit).offset(offset)
        # Eager-load exactly what the light row needs. Without this the list is
        # N+1 across host, participants and tags — see T03-F.
        stmt = stmt.options(
            selectinload(Meeting.host),
            selectinload(Meeting.participants),
            selectinload(Meeting.tags),
            selectinload(Meeting.keywords),
            selectinload(Meeting.summary),
        )
        return list(self.db.execute(stmt).scalars().all())

    def action_item_counts(self, meeting_ids: list[int]) -> dict[int, tuple[int, int]]:
        """Open/completed counts for many meetings in ONE query.

        Reading `len(meeting.action_items)` per row would be a second N+1, and a
        subtly expensive one — it loads every task to count them.
        """
        if not meeting_ids:
            return {}

        rows = self.db.execute(
            select(
                ActionItem.meeting_id,
                func.sum(func.iif(ActionItem.status == ActionItemStatus.OPEN, 1, 0)),
                func.sum(func.iif(ActionItem.status == ActionItemStatus.COMPLETED, 1, 0)),
            )
            .where(ActionItem.meeting_id.in_(meeting_ids))
            .group_by(ActionItem.meeting_id)
        ).all()

        return {row[0]: (int(row[1] or 0), int(row[2] or 0)) for row in rows}

    def participant_counts(self, meeting_ids: list[int]) -> dict[int, int]:
        if not meeting_ids:
            return {}
        rows = self.db.execute(
            select(Participant.meeting_id, func.count())
            .where(Participant.meeting_id.in_(meeting_ids))
            .group_by(Participant.meeting_id)
        ).all()
        return {row[0]: int(row[1]) for row in rows}

    # ── Presentation ────────────────────────────────────────────────────────
    #
    # Assembling the response DTOs happens here rather than in the router.
    # A row's shape depends on aggregates the router has no business fetching,
    # and keeping it here means the mapping is unit-testable without a request.

    def list_page(
        self, *, limit: int, offset: int, query: str | None = None, sort: str = DEFAULT_SORT
    ) -> tuple[list[MeetingListItem], int]:
        meetings = self.list_meetings(limit=limit, offset=offset, query=query, sort=sort)
        total = self.count(query=query)

        ids = [m.id for m in meetings]
        action_counts = self.action_item_counts(ids)
        participant_totals = self.participant_counts(ids)

        items = [
            self._to_list_item(
                meeting,
                action_counts.get(meeting.id, (0, 0)),
                participant_totals.get(meeting.id, 0),
            )
            for meeting in meetings
        ]
        return items, total

    @staticmethod
    def _to_list_item(
        meeting: Meeting, counts: tuple[int, int], participant_total: int
    ) -> MeetingListItem:
        overview = meeting.summary.overview if meeting.summary else None
        preview = None
        if overview:
            preview = overview[:OVERVIEW_PREVIEW_CHARS].rstrip()
            if len(overview) > OVERVIEW_PREVIEW_CHARS:
                preview += "…"

        return MeetingListItem(
            id=meeting.id,
            title=meeting.title,
            started_at=meeting.started_at,
            duration_seconds=meeting.duration_seconds,
            host=UserRef.model_validate(meeting.host),
            participants=[
                ParticipantRef.model_validate(p) for p in meeting.participants[:PARTICIPANT_PREVIEW]
            ],
            participant_count=participant_total,
            action_item_counts=ActionItemCounts(open=counts[0], completed=counts[1]),
            keywords=[k.term for k in meeting.keywords[:3]],
            tags=[TagRef.model_validate(t) for t in meeting.tags],
            overview_preview=preview,
            has_media=meeting.media_url is not None,
            media_type=meeting.media_type,
        )

    def to_detail(self, meeting: Meeting) -> MeetingDetail:
        segment_count = int(
            self.db.execute(
                select(func.count())
                .select_from(TranscriptSegment)
                .where(TranscriptSegment.meeting_id == meeting.id)
            ).scalar_one()
        )
        return MeetingDetail(
            id=meeting.id,
            title=meeting.title,
            description=meeting.description,
            started_at=meeting.started_at,
            duration_seconds=meeting.duration_seconds,
            language=meeting.language,
            visibility=meeting.visibility,
            source=meeting.source,
            processing_status=meeting.processing_status,
            media_type=meeting.media_type,
            media_url=meeting.media_url,
            host=UserRef.model_validate(meeting.host),
            participants=[ParticipantRef.model_validate(p) for p in meeting.participants],
            tags=[TagRef.model_validate(t) for t in meeting.tags],
            keywords=[k.term for k in meeting.keywords],
            segment_count=segment_count,
            created_at=meeting.created_at,
            updated_at=meeting.updated_at,
        )

    # ── Writes ──────────────────────────────────────────────────────────────

    def create(self, payload: MeetingCreate, *, host: User) -> Meeting:
        meeting = Meeting(
            title=payload.title,
            description=payload.description,
            started_at=payload.started_at or datetime.now(UTC),
            language=payload.language,
            visibility=payload.visibility,
            source=payload.source,
            channel_id=payload.channel_id,
            host_id=host.id,
            # Derived from the transcript at ingest, never accepted from the
            # client — a meeting with no segments genuinely has no duration.
            duration_seconds=0,
            media_type=MediaType.NONE,
        )
        self.db.add(meeting)
        self.db.flush()

        for name in dict.fromkeys(n.strip() for n in payload.participant_names if n.strip()):
            self.db.add(Participant(meeting_id=meeting.id, display_name=name))

        self.db.commit()
        self.db.refresh(meeting)
        return meeting

    def update(self, meeting_id: int, payload: MeetingUpdate) -> Meeting:
        meeting = self.get(meeting_id)

        # `exclude_unset` is what makes this a real PATCH: a field the client
        # never mentioned is left alone, while one explicitly sent as null is
        # cleared. Using the model's defaults instead would blank every field
        # the client did not resend.
        for field, value in payload.model_dump(exclude_unset=True).items():
            setattr(meeting, field, value)

        self.db.commit()
        self.db.refresh(meeting)
        return meeting

    def soft_delete(self, meeting_id: int) -> None:
        meeting = self.get(meeting_id)
        meeting.deleted_at = datetime.now(UTC)
        self.db.commit()

    def restore(self, meeting_id: int) -> Meeting:
        meeting = self.db.get(Meeting, meeting_id)
        if meeting is None:
            raise MeetingNotFoundError(details={"meeting_id": meeting_id})
        meeting.deleted_at = None
        self.db.commit()
        self.db.refresh(meeting)
        return meeting

    def bulk_soft_delete(self, meeting_ids: list[int]) -> tuple[int, list[int]]:
        """Delete many, reporting which ones failed.

        One transaction, but a partial result: an id that was already deleted is
        reported rather than aborting the whole batch, so the UI can say
        "2 of 3 deleted" (T-14.6) instead of leaving the user guessing.
        """
        now = datetime.now(UTC)
        deleted = 0
        failed: list[int] = []

        for meeting_id in meeting_ids:
            meeting = self.db.get(Meeting, meeting_id)
            if meeting is None or meeting.deleted_at is not None:
                failed.append(meeting_id)
                continue
            meeting.deleted_at = now
            deleted += 1

        self.db.commit()
        return deleted, failed
