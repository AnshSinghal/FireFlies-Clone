"""Tag business logic (T-36).

Everything the API does to a tag happens here; the router parses and returns.
The invariants the schema cannot express live in this module:

- Case-insensitive uniqueness (T-36.10). SQLite's BINARY collation means the
  plain `uq_tags_name` constraint would happily store `Sales` next to `sales`,
  so the check is two-layered: a service lookup over `lower(name)` that raises
  a 409 NAMING the existing tag, backed by the `uq_tags_name_lower` functional
  index that closes the race two concurrent creates would otherwise win
  together (see the model and the migration).
- The 10-tag cap per meeting, applied AFTER de-duplication — twelve ids that
  collapse to nine distinct tags are a sloppy request, not an oversized one.
- Merge-on-delete (T-36.6): `DELETE /tags/{id}?merge_into=` unions the doomed
  tag's meetings onto the survivor without duplicates, then removes the tag.
  Modelling merge as a delete parameter keeps the path verb-free.

Usage counts are computed live and always exclude soft-deleted meetings — the
settings page shows them, and the delete confirm names the affected count, so
a number that included ghosts would overstate the blast radius.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import func, insert, literal, select
from sqlalchemy.exc import IntegrityError

from app.ai import SegmentInput, Transcript
from app.core.exceptions import (
    DuplicateTagError,
    TagLimitError,
    TagNotFoundError,
    ValidationError,
)
from app.models import Meeting, Speaker, Tag, TranscriptSegment, meeting_tags
from app.schemas.tag import TagOut, TagProposal

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

    from app.ai import AIProvider
    from app.schemas.tag import TagCreate, TagUpdate

#: T-36.10. Enforced here rather than in the schema so the failure carries the
#: stable TAG_LIMIT code instead of a generic length error.
MAX_TAGS_PER_MEETING = 10

#: T-36.4: "up to 5" suggested chips.
PROPOSAL_LIMIT = 5

#: What a tag name may be — mirrors the schema's constraint for names that
#: arrive from the AI provider rather than from a validated request body.
NAME_MAX_CHARS = 24


class TagService:
    """Stateless apart from the session it was handed."""

    def __init__(self, db: Session) -> None:
        self.db = db

    # ── Reads ───────────────────────────────────────────────────────────────

    def get(self, tag_id: int) -> Tag:
        tag = self.db.get(Tag, tag_id)
        if tag is None:
            raise TagNotFoundError(details={"tag_id": tag_id})
        return tag

    def list_tags(self) -> list[TagOut]:
        """Every tag with its live usage count, in ONE query.

        An OUTER join on purpose — a tag nobody uses yet must still appear on
        the settings page, showing zero — with the `deleted_at IS NULL` filter
        in the JOIN condition rather than a WHERE, which would silently drop
        those zero-count rows (the same reasoning as the sidebar's channel
        counts). Sorted case-insensitively by name: `Zebra` between `apple`
        and `zulu` is what a human calls sorted.
        """
        rows = self.db.execute(
            select(Tag, func.count(Meeting.id))
            .outerjoin(meeting_tags, meeting_tags.c.tag_id == Tag.id)
            .outerjoin(
                Meeting,
                (Meeting.id == meeting_tags.c.meeting_id) & (Meeting.deleted_at.is_(None)),
            )
            .group_by(Tag.id)
            .order_by(func.lower(Tag.name), Tag.name)
        ).all()
        return [self._to_out(tag, usage=int(count)) for tag, count in rows]

    def _usage_of(self, tag_id: int) -> int:
        return int(
            self.db.execute(
                select(func.count())
                .select_from(meeting_tags)
                .join(Meeting, Meeting.id == meeting_tags.c.meeting_id)
                .where(meeting_tags.c.tag_id == tag_id, Meeting.deleted_at.is_(None))
            ).scalar_one()
        )

    def _usage_counts(self, tag_ids: list[int]) -> dict[int, int]:
        """Live usage for several tags in one grouped query, not one each."""
        if not tag_ids:
            return {}
        rows = self.db.execute(
            select(meeting_tags.c.tag_id, func.count())
            .select_from(meeting_tags)
            .join(Meeting, Meeting.id == meeting_tags.c.meeting_id)
            .where(meeting_tags.c.tag_id.in_(tag_ids), Meeting.deleted_at.is_(None))
            .group_by(meeting_tags.c.tag_id)
        ).all()
        return {row[0]: int(row[1]) for row in rows}

    @staticmethod
    def _to_out(tag: Tag, *, usage: int) -> TagOut:
        return TagOut(id=tag.id, name=tag.name, color_index=tag.color_index, usage_count=usage)

    # ── Writes ──────────────────────────────────────────────────────────────

    def _ensure_name_free(self, name: str, *, exclude_id: int | None = None) -> None:
        """The case-insensitive duplicate check (T-36.10, case T36-J).

        `exclude_id` lets a tag be renamed to a different CASING of itself —
        `sales` → `Sales` is a legitimate edit, not a collision.
        """
        existing = self.db.execute(
            select(Tag).where(func.lower(Tag.name) == name.lower())
        ).scalar_one_or_none()
        if existing is not None and existing.id != exclude_id:
            raise DuplicateTagError(
                f'A tag named "{existing.name}" already exists.',
                details={"existing_id": existing.id, "existing_name": existing.name},
            )

    def create(self, payload: TagCreate) -> TagOut:
        """A new tag; `color_index` stays null unless the client pinned one."""
        self._ensure_name_free(payload.name)
        tag = Tag(name=payload.name, color_index=payload.color_index)
        self.db.add(tag)
        try:
            self.db.flush()
        except IntegrityError as error:
            # The functional index caught a race the check above missed. Same
            # answer as the check: a 409, never a 500.
            self.db.rollback()
            raise DuplicateTagError(
                f'A tag named "{payload.name}" already exists.',
                details={"existing_name": payload.name},
            ) from error
        self.db.commit()
        self.db.refresh(tag)
        return self._to_out(tag, usage=0)

    def update(self, tag_id: int, payload: TagUpdate) -> TagOut:
        """Rename and/or recolour (T-36.6).

        A rename propagates BY CONSTRUCTION: meetings reference the tag by id
        through `meeting_tags`, so there is nothing to cascade — every chip
        renders the new name on its next read (case T36-F).

        `model_fields_set` rather than `is not None`, because `color_index:
        null` is a real edit — "drop the pinned colour, go back to the hash".
        """
        tag = self.get(tag_id)
        sent = payload.model_fields_set

        if "name" in sent and payload.name is not None:
            self._ensure_name_free(payload.name, exclude_id=tag.id)
            tag.name = payload.name
        if "color_index" in sent:
            tag.color_index = payload.color_index

        self.db.commit()
        self.db.refresh(tag)
        return self._to_out(tag, usage=self._usage_of(tag.id))

    def delete(self, tag_id: int, *, merge_into: int | None = None) -> None:
        """Remove a tag; with `merge_into`, reassign its meetings first.

        The merge (T-36.6, case T36-G) is one INSERT..SELECT: every meeting
        carrying the doomed tag gains the survivor, EXCEPT the ones that
        already have it — the composite primary key on `meeting_tags` would
        reject duplicates, and filtering them out here is what makes a merge
        of overlapping tags succeed rather than 500.

        Without `merge_into` this is a hard delete: the association rows go
        with the tag (FK CASCADE plus the ORM's secondary handling), so no
        meeting is left pointing at a ghost (the ❌ case in the plan).
        """
        tag = self.get(tag_id)

        if merge_into is not None:
            if merge_into == tag_id:
                raise ValidationError(
                    "A tag cannot be merged into itself.", details={"tag_id": tag_id}
                )
            survivor = self.get(merge_into)

            already_tagged = select(meeting_tags.c.meeting_id).where(
                meeting_tags.c.tag_id == survivor.id
            )
            gains = (
                select(meeting_tags.c.meeting_id, literal(survivor.id))
                .where(meeting_tags.c.tag_id == tag.id)
                .where(meeting_tags.c.meeting_id.not_in(already_tagged))
            )
            self.db.execute(insert(meeting_tags).from_select(["meeting_id", "tag_id"], gains))

        self.db.delete(tag)
        self.db.commit()
        # The merge INSERT is Core and the association-row deletes happen on
        # the tag's side of the relationship — neither touches any `Meeting
        # .tags` collection already loaded in this session. Expire, so a
        # caller holding one (a long-lived session, the shared test session)
        # re-reads the truth instead of serving a deleted tag.
        self.db.expire_all()

    def set_meeting_tags(self, meeting: Meeting, tag_ids: list[int]) -> list[TagOut]:
        """Replace a meeting's tags with exactly `tag_ids` — set semantics.

        De-duplicates FIRST (preserving order), then applies the cap: the
        eleventh distinct tag is the error (case T36-I), a repeated id is not.
        Unknown ids are a 404 listing every missing one, so a client that sent
        three bad ids learns about all three in one round trip.
        """
        ordered = list(dict.fromkeys(tag_ids))
        if len(ordered) > MAX_TAGS_PER_MEETING:
            raise TagLimitError(details={"limit": MAX_TAGS_PER_MEETING, "requested": len(ordered)})

        tags: list[Tag] = []
        if ordered:
            found = {
                tag.id: tag
                for tag in self.db.execute(select(Tag).where(Tag.id.in_(ordered))).scalars()
            }
            missing = [tag_id for tag_id in ordered if tag_id not in found]
            if missing:
                raise TagNotFoundError(details={"missing_tag_ids": missing})
            tags = [found[tag_id] for tag_id in ordered]

        meeting.tags = tags
        self.db.commit()

        counts = self._usage_counts([tag.id for tag in tags])
        return [self._to_out(tag, usage=counts.get(tag.id, 0)) for tag in tags]

    # ── Proposals (T-36.4) ──────────────────────────────────────────────────

    def propose(self, meeting: Meeting, provider: AIProvider) -> list[TagProposal]:
        """Up to five suggested tags from the transcript's top terms.

        Deterministic because the provider is (the mock's TF-IDF has a stable
        tie-break), which is what keeps the Suggested chips still between
        refreshes. Terms the meeting is ALREADY tagged with are dropped —
        suggesting what is applied is noise — compared case-insensitively,
        because `Sales` and `sales` are one tag. When a tag with the proposed
        name exists anywhere, `tag_id` links it so accepting is a plain PUT;
        otherwise the client creates it first.

        Nothing is persisted: a proposal the user never saw should not exist,
        and dismissals are a per-browser preference the server has no business
        storing.
        """
        candidates = provider.propose_tags(self._transcript_of(meeting))
        taken = {tag.name.lower() for tag in meeting.tags}

        # Resolve every candidate's existing tag in ONE query, not one each.
        lowered = [candidate.lower() for candidate in candidates]
        existing: dict[str, Tag] = {}
        if lowered:
            for tag in self.db.execute(
                select(Tag).where(func.lower(Tag.name).in_(lowered))
            ).scalars():
                existing[tag.name.lower()] = tag

        proposals: list[TagProposal] = []
        seen: set[str] = set()
        for candidate in candidates:
            name = candidate.strip().lstrip("#").strip()
            key = name.lower()
            # Provider output is unvalidated input to the tag system: hold it
            # to the same rules a request body would face.
            if not name or len(name) > NAME_MAX_CHARS or key in taken or key in seen:
                continue
            seen.add(key)
            match = existing.get(key)
            proposals.append(TagProposal(name=name, tag_id=match.id if match else None))
            if len(proposals) == PROPOSAL_LIMIT:
                break
        return proposals

    def _transcript_of(self, meeting: Meeting) -> Transcript:
        """The meeting's transcript in the shape the AI layer speaks.

        A copy of `MeetingService._transcript_for_ai` rather than a call to
        it: importing `MeetingService` here while it grows tag concerns would
        be one refactor away from a cycle, and the query is twelve lines with
        an explicit spec. `reference_date` rides along for interface parity —
        keyword extraction never consults it.
        """
        rows = self.db.execute(
            select(TranscriptSegment, Speaker.label)
            .join(Speaker, TranscriptSegment.speaker_id == Speaker.id)
            .where(TranscriptSegment.meeting_id == meeting.id)
            .order_by(TranscriptSegment.sequence)
        ).all()
        return Transcript(
            segments=[
                SegmentInput(
                    speaker=label,
                    text=segment.text,
                    start_ms=segment.start_ms,
                    end_ms=segment.end_ms,
                )
                for segment, label in rows
            ],
            reference_date=meeting.started_at.date() if meeting.started_at else None,
        )
