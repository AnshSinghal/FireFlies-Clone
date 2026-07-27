"""Meeting business logic (T-04.7).

Everything the API does to a meeting happens here. Routers parse a request, call
one of these methods, and serialise the result — see `scripts/check_layering.py`,
which fails the build if a router reaches for the ORM directly.

T-11 extends `list_meetings` with the full filter set. This is the skeleton and
the contract; the shape is what matters now.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING, Any, cast

from sqlalchemy import Select, UnaryExpression, case, func, select, update
from sqlalchemy.orm import selectinload

from app.core.exceptions import (
    ActionItemNotFoundError,
    AssigneeNotInMeetingError,
    InvalidSortError,
    MeetingDeletedError,
    MeetingNotFoundError,
    ValidationError,
)
from app.models import (
    ActionItem,
    Meeting,
    Participant,
    Speaker,
    Summary,
    TranscriptSegment,
    User,
)
from app.models.enums import ActionItemSource, ActionItemStatus, MediaType, SummarySectionKind
from app.schemas.meeting import (
    ActionItemCounts,
    ActionItemCreate,
    ActionItemOut,
    ActionItemUpdate,
    ChannelRef,
    MeetingDetail,
    MeetingImport,
    MeetingListItem,
    ParticipantDetail,
    ParticipantRef,
    TagRef,
)
from app.schemas.meeting import (
    Facets as FacetsSchema,
)
from app.schemas.meeting import (
    MatchContext as MatchContextSchema,
)
from app.schemas.summary import NoteGroup, OutlineEntry, SummaryOut
from app.schemas.user import UserRef
from app.services.meeting_filters import (
    MeetingFilters,
    apply_filters,
    build_facets,
    transcript_match_contexts,
)

if TYPE_CHECKING:
    from sqlalchemy import CursorResult
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

    def count(self, filters: MeetingFilters) -> int:
        """Total matching rows, ignoring pagination.

        Counts through the SAME filter functions as the page query. Writing a
        second, hand-tuned count predicate is how `total` drifts from `items`
        and the last page ends up empty.
        """
        # `subquery()` rather than counting the ORM entity directly: several
        # filters add EXISTS clauses, and counting over the built statement is
        # the only way to be certain the two agree.
        stmt = apply_filters(self._base_query(), filters).subquery()
        return int(self.db.execute(select(func.count()).select_from(stmt)).scalar_one())

    def list_meetings(
        self,
        *,
        limit: int,
        offset: int,
        filters: MeetingFilters | None = None,
        sort: str = DEFAULT_SORT,
    ) -> list[Meeting]:
        """A page of meetings, newest first by default.

        `sort` is looked up in a WHITELIST and an unknown key is a 400, not a
        silent fallback (T-11.5). Building `ORDER BY {sort}` from user input is
        SQL injection with extra steps, and it is the one place an ORM does not
        protect you by default.
        """
        if sort not in SORTABLE:
            raise InvalidSortError(
                f"Unknown sort key: {sort!r}",
                details={"allowed": sorted(SORTABLE)},
            )

        stmt = apply_filters(self._base_query(), filters or MeetingFilters())
        stmt = stmt.order_by(SORTABLE[sort])
        # A stable tiebreak. Two meetings can share a title or a start time, and
        # without one the same row can appear on two pages while another
        # disappears — SQLite is free to return equal rows in any order.
        stmt = stmt.order_by(Meeting.id.desc())
        stmt = stmt.limit(limit).offset(offset)
        # Eager-load exactly what the light row needs. Without this the list is
        # N+1 across host, participants and tags — see T03-F and T11-L.
        stmt = stmt.options(
            selectinload(Meeting.host),
            selectinload(Meeting.participants),
            selectinload(Meeting.tags),
            selectinload(Meeting.keywords),
            selectinload(Meeting.summary),
        )
        return list(self.db.execute(stmt).scalars().all())

    def facets(self) -> FacetsSchema:
        """Filter options derived from the live data (T-11.8)."""
        raw = build_facets(self.db)
        return FacetsSchema(
            hosts=raw.hosts,
            participants=raw.participants,
            tags=raw.tags,
            channels=raw.channels,
            min_duration=raw.min_duration,
            max_duration=raw.max_duration,
        )

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
        self,
        *,
        limit: int,
        offset: int,
        filters: MeetingFilters | None = None,
        sort: str = DEFAULT_SORT,
    ) -> tuple[list[MeetingListItem], int]:
        filters = filters or MeetingFilters()
        meetings = self.list_meetings(limit=limit, offset=offset, filters=filters, sort=sort)
        total = self.count(filters)

        ids = [m.id for m in meetings]
        action_counts = self.action_item_counts(ids)
        participant_totals = self.participant_counts(ids)

        # Only when the user searched, and only for the ids on THIS page — one
        # extra statement, not one per row.
        contexts = transcript_match_contexts(self.db, ids, filters.q) if filters.q else {}

        items = []
        for meeting in meetings:
            item = self._to_list_item(
                meeting,
                action_counts.get(meeting.id, (0, 0)),
                participant_totals.get(meeting.id, 0),
            )
            context = contexts.get(meeting.id)
            # Suppressed when the title already contains the term: the row shows
            # the reason, so a "why this matched" line would be noise.
            if context and filters.q and filters.q.lower() not in meeting.title.lower():
                item.match_context = MatchContextSchema(
                    snippet=context.snippet, speaker=context.speaker, start_ms=context.start_ms
                )
            items.append(item)

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
            participants=[self._to_participant_detail(p) for p in meeting.participants],
            channel=ChannelRef.model_validate(meeting.channel) if meeting.channel else None,
            tags=[TagRef.model_validate(t) for t in meeting.tags],
            keywords=[k.term for k in meeting.keywords],
            segment_count=segment_count,
            created_at=meeting.created_at,
            updated_at=meeting.updated_at,
        )

    @staticmethod
    def _to_participant_detail(participant: Participant) -> ParticipantDetail:
        """Carry the speaker's colour index through, when they have one.

        The talk-time bar has to be the same colour as this person in the
        transcript, and the colour is assigned server-side so every surface
        agrees (ADR-013). A participant who never spoke has no speaker row and
        therefore no colour, which is correct — their bar is zero-length.
        """
        return ParticipantDetail(
            id=participant.id,
            display_name=participant.display_name,
            email=participant.email,
            # A participant has no avatar of their own — it belongs to the
            # linked user account, and an external attendee has none at all.
            # The client falls back to initials on a hashed colour.
            avatar_url=participant.user.avatar_url if participant.user else None,
            user_id=participant.user_id,
            attended=participant.attended,
            talk_seconds=participant.talk_seconds,
            color_index=participant.speaker.color_index if participant.speaker else None,
        )

    def action_items(self, meeting_id: int) -> list[ActionItemOut]:
        """Every action item on a meeting, in the order the UI shows them.

        OPEN BEFORE COMPLETED, then by due date with nulls last, then by the
        moment in the recording (T-24.1). Sorting in SQL rather than in the
        client because the Notebook drawer and the Notepad both render this
        list, and two sorts written twice are two sorts that drift.

        "Nulls last" is spelled out rather than left to the dialect: SQLite
        sorts NULL first ascending, Postgres sorts it last, and an item with no
        due date belongs at the bottom in both.
        """
        rows = self.db.execute(
            select(ActionItem)
            .where(ActionItem.meeting_id == meeting_id)
            .order_by(
                # `completed` sorts after `open` alphabetically, which is luck
                # rather than design — so the ordering is stated explicitly.
                case((ActionItem.status == ActionItemStatus.COMPLETED, 1), else_=0),
                case((ActionItem.due_date.is_(None), 1), else_=0),
                ActionItem.due_date,
                ActionItem.start_ms.is_(None),
                ActionItem.start_ms,
                ActionItem.sequence,
            )
            # The assignee's USER too: the avatar lives there, and without it
            # every row would fire its own query for one URL.
            .options(selectinload(ActionItem.assignee).selectinload(Participant.user))
        ).scalars()

        return [self._to_action_item(item) for item in rows]

    @staticmethod
    def _to_action_item(item: ActionItem) -> ActionItemOut:
        return ActionItemOut(
            id=item.id,
            meeting_id=item.meeting_id,
            text=item.text,
            status=item.status,
            due_date=item.due_date,
            assignee_name=item.assignee.display_name if item.assignee else None,
            assignee_participant_id=item.assignee_participant_id,
            # A participant has no avatar of their own — it belongs to the
            # linked user, and an external attendee has no user (see the same
            # note on `_to_participant_detail`).
            assignee_avatar_url=(
                item.assignee.user.avatar_url if item.assignee and item.assignee.user else None
            ),
            start_ms=item.start_ms,
            source=item.source,
        )

    def _check_assignee(self, meeting_id: int, participant_id: int | None) -> None:
        """The invariant the schema cannot express (see AssigneeNotInMeetingError)."""
        if participant_id is None:
            return

        participant = self.db.get(Participant, participant_id)
        if participant is None or participant.meeting_id != meeting_id:
            raise AssigneeNotInMeetingError(
                details={"participant_id": participant_id, "meeting_id": meeting_id}
            )

    def create_action_item(self, meeting_id: int, payload: ActionItemCreate) -> ActionItemOut:
        """Add an item by hand (T-24.5)."""
        self.get(meeting_id)
        self._check_assignee(meeting_id, payload.assignee_participant_id)

        # Appended: a manually added item belongs at the end of the raised
        # order, not interleaved with what the extractor found.
        highest = self.db.execute(
            select(func.max(ActionItem.sequence)).where(ActionItem.meeting_id == meeting_id)
        ).scalar()

        item = ActionItem(
            meeting_id=meeting_id,
            text=payload.text,
            assignee_participant_id=payload.assignee_participant_id,
            due_date=payload.due_date,
            start_ms=payload.start_ms,
            status=ActionItemStatus.OPEN,
            source=ActionItemSource.MANUAL,
            sequence=(highest or 0) + 1,
        )
        self.db.add(item)
        self.db.commit()
        self.db.refresh(item)

        return self._to_action_item(item)

    def update_action_item(self, item_id: int, payload: ActionItemUpdate) -> ActionItemOut:
        """A partial edit — text, assignee, due date, or the checkbox.

        `model_fields_set` rather than `is not None`, because `None` is a
        MEANINGFUL value here: clearing an assignee or a due date is a real
        edit, and treating null as "absent" would make it impossible to express.
        """
        item = self.db.get(ActionItem, item_id)
        if item is None:
            raise ActionItemNotFoundError(details={"action_item_id": item_id})

        sent = payload.model_fields_set

        if "text" in sent and payload.text is not None:
            item.text = payload.text

        if "assignee_participant_id" in sent:
            self._check_assignee(item.meeting_id, payload.assignee_participant_id)
            item.assignee_participant_id = payload.assignee_participant_id

        if "due_date" in sent:
            item.due_date = payload.due_date

        if "status" in sent and payload.status is not None:
            item.status = payload.status
            # Derived here rather than accepted from the client, so the two
            # cannot disagree.
            item.completed_at = (
                datetime.now(UTC) if payload.status == ActionItemStatus.COMPLETED else None
            )

        self.db.commit()
        self.db.refresh(item)

        return self._to_action_item(item)

    def delete_action_item(self, item_id: int) -> ActionItemOut:
        """Remove an item, RETURNING it so the client can offer Undo.

        A hard delete, unlike meetings: an action item is one line of text with
        no children, and the Undo toast re-creates it from the response. Soft
        deletion would leave rows nobody can reach for a restore path that is
        already covered.
        """
        item = self.db.get(ActionItem, item_id)
        if item is None:
            raise ActionItemNotFoundError(details={"action_item_id": item_id})

        out = self._to_action_item(item)
        self.db.delete(item)
        self.db.commit()

        return out

    def to_summary(self, meeting: Meeting) -> SummaryOut:
        """The five canonical sections, COMPOSED from four sources (T-17.7).

        The overview is a scalar on `summaries`, outline and note rows live in
        `summary_sections`, keywords have their own table, and action items
        have theirs. The API assembles them so the client never has to know
        that (ADR-015) — a client stitching four responses together is a client
        that will eventually stitch them differently from the next one.

        A meeting without a summary answers 200 with `overview: null` rather
        than 404 — "not summarised yet" is a state of the meeting, not a
        missing resource (ADR-046).
        """
        summary = meeting.summary
        if summary is None:
            return SummaryOut(
                meeting_id=meeting.id,
                provider="mock",
                keywords=[],
                outline=[],
                notes=[],
                # Nothing to be stale against. Stated rather than defaulted,
                # so the field stays required in the schema.
                is_stale=False,
            )

        sections = sorted(summary.sections, key=lambda s: s.sequence)

        outline = [
            OutlineEntry(
                title=section.title or "",
                # Not nullable in the response: an outline entry with no
                # timestamp cannot be clicked, which is the whole point of it.
                start_ms=section.start_ms or 0,
                sequence=section.sequence,
            )
            for section in sections
            if section.kind == SummarySectionKind.OUTLINE
        ]

        # GROUPED BY CHAPTER, because that is what the section is for.
        #
        # Each note row stores one bullet and repeats its chapter title, so a
        # one-row-per-group mapping produced fifteen groups for a meeting with
        # five chapters — the same heading printed four times in a row, with a
        # single bullet under each. Grouping here rather than in the client
        # keeps the response the shape the UI actually renders.
        #
        # A `dict` preserves insertion order, so the chapters stay in the order
        # their rows were sequenced, and a bullet body with several lines still
        # contributes all of them.
        grouped: dict[str | None, list[str]] = {}
        for section in sections:
            if section.kind != SummarySectionKind.NOTES:
                continue
            bullets = grouped.setdefault(section.title, [])
            bullets.extend(
                line.strip() for line in (section.body or "").splitlines() if line.strip()
            )

        notes = [
            NoteGroup(chapter=chapter, bullets=bullets) for chapter, bullets in grouped.items()
        ]

        return SummaryOut(
            meeting_id=meeting.id,
            overview=summary.overview,
            keywords=[k.term for k in meeting.keywords],
            outline=outline,
            notes=notes,
            provider=summary.provider,
            model=summary.model,
            is_stale=summary.is_stale,
            generated_at=summary.generated_at,
        )

    def regenerate_summary(self, meeting: Meeting) -> SummaryOut:
        """Regenerate, idempotently under concurrent calls (T-17.8).

        Two clicks on `Regenerate` — or a double-submit — must not produce two
        generations. The guard is a conditional UPDATE, not a read-then-write:

            UPDATE summaries SET is_generating = 1
            WHERE id = ? AND is_generating = 0

        Exactly one caller sees `rowcount == 1`; the loser returns the CURRENT
        summary rather than an error, because from the user's point of view a
        regeneration is already happening and that is what they asked for.

        A `SELECT ... then UPDATE` has a window between the two where both
        callers see "not generating" — which is precisely the race being closed,
        and it is wide enough to hit with two clicks.
        """
        summary = meeting.summary
        if summary is None:
            return SummaryOut(
                meeting_id=meeting.id,
                provider="mock",
                keywords=[],
                outline=[],
                notes=[],
                # Nothing to be stale against. Stated rather than defaulted,
                # so the field stays required in the schema.
                is_stale=False,
            )

        # `CursorResult` is what an UPDATE actually returns; the annotation on
        # `Session.execute` is the wider `Result`, which has no `rowcount`.
        claimed = cast(
            "CursorResult[Any]",
            self.db.execute(
                update(Summary)
                .where(Summary.id == summary.id, Summary.is_generating.is_(False))
                .values(is_generating=True)
            ),
        )
        self.db.commit()

        if claimed.rowcount == 0:
            # Someone else is already doing it. Answering with the current
            # summary is more useful than a 409 the UI would have to explain.
            self.db.refresh(summary)
            return self.to_summary(meeting)

        try:
            # T-29 swaps this for a real provider call. Everything around it —
            # the claim, the transaction, the stale flag — is the part that has
            # to be right before the part that costs money is wired in.
            summary.generated_at = datetime.now(UTC)
            summary.is_stale = False
        finally:
            # ALWAYS released, including on a provider failure. A stuck flag
            # would make Regenerate permanently do nothing, with no way back.
            summary.is_generating = False
            self.db.commit()

        self.db.refresh(summary)
        return self.to_summary(meeting)

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

    def create_with_transcript(self, payload: MeetingImport, *, host: User) -> Meeting:
        """A meeting and its transcript, in one transaction (T-26.7).

        Everything or nothing: a meeting that exists with half a transcript is
        worse than a failed upload, because it looks successful.
        """
        meeting = self.create(payload, host=host)

        # One speaker per distinct name, in first-appearance order — which is
        # what makes the colour indices match the order they are read in.
        speakers: dict[str, Speaker] = {}
        for segment in payload.segments:
            if segment.speaker in speakers:
                continue
            speaker = Speaker(
                meeting_id=meeting.id,
                label=segment.speaker,
                color_index=len(speakers),
            )
            self.db.add(speaker)
            speakers[segment.speaker] = speaker

        self.db.flush()

        for sequence, segment in enumerate(payload.segments):
            self.db.add(
                TranscriptSegment(
                    meeting_id=meeting.id,
                    speaker_id=speakers[segment.speaker].id,
                    sequence=sequence,
                    start_ms=segment.start_ms,
                    # A zero-length segment breaks the player's active-line
                    # resolution, so a line that ends before it starts is
                    # given a floor rather than rejected — the timings came
                    # from a file we did not write.
                    end_ms=max(segment.end_ms, segment.start_ms + 1),
                    text=segment.text,
                )
            )

        # DERIVED, never accepted from the client (the same rule `create` uses
        # for an empty meeting).
        meeting.duration_seconds = round(max(segment.end_ms for segment in payload.segments) / 1000)

        # Anyone who spoke was in the meeting, whether or not they were listed.
        existing = {
            name
            for (name,) in self.db.execute(
                select(Participant.display_name).where(Participant.meeting_id == meeting.id)
            )
        }
        for name in speakers:
            if name not in existing:
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
        scalars = payload.model_dump(
            exclude_unset=True, exclude={"participant_names", "host_participant_id"}
        )
        for field, value in scalars.items():
            setattr(meeting, field, value)

        if payload.participant_names is not None:
            self._sync_participants(meeting, payload.participant_names)

        if "host_participant_id" in payload.model_fields_set:
            self._set_host(meeting, payload.host_participant_id)

        self.db.commit()
        self.db.refresh(meeting)
        return meeting

    def _sync_participants(self, meeting: Meeting, names: list[str]) -> None:
        """Reconcile the participant list to `names`.

        MATCHED BY NAME, so a participant who survives the edit keeps their id
        — and with it their action items, their speaker link and their talk
        time. Deleting the lot and re-adding would silently orphan all three.
        """
        existing = {
            participant.display_name.lower(): participant for participant in meeting.participants
        }
        wanted = {name.lower(): name for name in names}

        for key, participant in existing.items():
            if key not in wanted:
                self.db.delete(participant)

        for key, name in wanted.items():
            if key not in existing:
                self.db.add(Participant(meeting_id=meeting.id, display_name=name))

        self.db.flush()

    def _set_host(self, meeting: Meeting, participant_id: int | None) -> None:
        """Point the meeting at a participant's linked user.

        The host is a USER — meetings are listed and filtered by host across the
        app — while the editor picks from the people who were in the room. A
        participant with no linked user cannot host, which is the honest answer
        rather than inventing an account for them.
        """
        if participant_id is None:
            return

        participant = self.db.get(Participant, participant_id)
        if participant is None or participant.meeting_id != meeting.id:
            raise ValidationError(
                "That person is not a participant in this meeting.",
                details={"participant_id": participant_id},
            )

        if participant.user_id is None:
            raise ValidationError(
                f"{participant.display_name} has no account, so they cannot be the host.",
                details={"participant_id": participant_id},
            )

        meeting.host_id = participant.user_id

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

    def bulk_restore(self, meeting_ids: list[int]) -> tuple[int, list[int]]:
        """Undo a bulk delete (T-14.5).

        Mirrors `bulk_soft_delete` exactly, including the partial result: an id
        that was never deleted is reported rather than aborting the batch, so an
        Undo that half-works says so instead of appearing to fail entirely.
        """
        restored = 0
        failed: list[int] = []

        for meeting_id in meeting_ids:
            meeting = self.db.get(Meeting, meeting_id)
            if meeting is None or meeting.deleted_at is None:
                failed.append(meeting_id)
                continue
            meeting.deleted_at = None
            restored += 1

        self.db.commit()
        return restored, failed
