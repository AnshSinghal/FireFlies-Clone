"""Tag endpoints (T-36.1).

Collection and item routes live at `/tags`; the two meeting-scoped routes hang
off the meeting (`/meetings/{id}/tags`), same split as comments. Merge is a
DELETE parameter rather than a `/merge` action route — "delete this tag,
reassigning its meetings to that one" is what a merge IS, and it keeps the
path verb-free (see docs/decisions.md).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Query, status

from app.ai import AIProviderDep
from app.api.responses import CONFLICT, NOT_FOUND, NOT_FOUND_OR_GONE, VALIDATION
from app.core.deps import DbSession
from app.schemas.tag import (
    MeetingTagsUpdate,
    TagCreate,
    TagList,
    TagOut,
    TagProposalList,
    TagUpdate,
)
from app.services.meetings import MeetingService
from app.services.tags import TagService

router = APIRouter(tags=["tags"])


@router.get(
    "/tags",
    response_model=TagList,
    summary="List tags",
    description=(
        "Every tag with its live usage count, sorted by name "
        "(case-insensitively). Counts exclude soft-deleted meetings, and an "
        "unused tag still appears showing zero — the settings page lists it "
        "either way. Names are stored without the leading `#`; add the glyph "
        "at render time."
    ),
)
def list_tags(db: DbSession) -> TagList:
    return TagList(items=TagService(db).list_tags())


@router.post(
    "/tags",
    response_model=TagOut,
    status_code=status.HTTP_201_CREATED,
    responses={**VALIDATION, **CONFLICT},
    summary="Create a tag",
    description=(
        "Names are unique case-insensitively — creating `Sales` next to "
        "`sales` is a **409** naming the existing tag. A leading `#` is "
        "stripped before validation; 1-24 characters after that. Omitting "
        "`color_index` leaves it null, meaning the client derives the colour "
        "from the name via the shared speaker-colour hash."
    ),
)
def create_tag(db: DbSession, payload: TagCreate) -> TagOut:
    return TagService(db).create(payload)


@router.patch(
    "/tags/{tag_id}",
    response_model=TagOut,
    responses={**NOT_FOUND, **VALIDATION, **CONFLICT},
    summary="Rename or recolour a tag",
    description=(
        "Partial update. A rename propagates everywhere automatically — "
        "meetings reference tags by id — and collides with existing names "
        "under the same case-insensitive 409 rule as create. Sending "
        "`color_index: null` drops a pinned colour and returns the tag to its "
        "hash-derived one."
    ),
)
def update_tag(db: DbSession, tag_id: int, payload: TagUpdate) -> TagOut:
    return TagService(db).update(tag_id, payload)


@router.delete(
    "/tags/{tag_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={**NOT_FOUND, **VALIDATION},
    summary="Delete a tag, optionally merging it into another",
    description=(
        "Without `merge_into`: the tag and its meeting associations are "
        "removed outright. With `merge_into`: every meeting carrying this tag "
        "gains the surviving one first (no duplicates), THEN the tag is "
        "removed — which is the merge operation. The target must exist and "
        "must not be the tag being deleted."
    ),
)
def delete_tag(
    db: DbSession,
    tag_id: int,
    merge_into: Annotated[
        int | None,
        Query(description="Id of the surviving tag to reassign this tag's meetings to."),
    ] = None,
) -> None:
    TagService(db).delete(tag_id, merge_into=merge_into)


@router.put(
    "/meetings/{meeting_id}/tags",
    response_model=TagList,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Set a meeting's tags",
    description=(
        "REPLACES the meeting's tag list with exactly `tag_ids` — set "
        "semantics, so the editor popover applies its checkbox state in one "
        "request and an empty list clears everything. Duplicate ids collapse; "
        "more than 10 distinct tags is a **422** with code `TAG_LIMIT`; an "
        "unknown id is a **404** listing every missing one."
    ),
)
def set_meeting_tags(db: DbSession, meeting_id: int, payload: MeetingTagsUpdate) -> TagList:
    # Through `get` first, so a deleted meeting answers 410 rather than
    # silently re-tagging something no list shows.
    meeting = MeetingService(db).get(meeting_id)
    return TagList(items=TagService(db).set_meeting_tags(meeting, payload.tag_ids))


@router.get(
    "/meetings/{meeting_id}/tags/proposals",
    response_model=TagProposalList,
    responses=NOT_FOUND_OR_GONE,
    summary="Propose tags for a meeting",
    description=(
        "Up to 5 deterministic suggestions from the AI provider's top "
        "transcript terms, excluding tags the meeting already carries. "
        "`tag_id` is set when a tag with that name exists, so accepting it is "
        "a plain `PUT`; when null, create the tag first. Nothing is persisted "
        "— dismissals are the client's business."
    ),
)
def propose_tags(db: DbSession, meeting_id: int, provider: AIProviderDep) -> TagProposalList:
    meeting = MeetingService(db).get(meeting_id)
    return TagProposalList(items=TagService(db).propose(meeting, provider))
