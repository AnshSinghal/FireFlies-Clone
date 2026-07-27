"""Tag schemas, split by direction (T-36.1).

Input shapes normalise BEFORE validating: the leading `#` is a render-time
glyph, not part of the name, so `#sales` arriving from a client is stripped
server-side and then held to the same 1-24 character rule as `sales`. Doing it
in a `mode="before"` validator (rather than after the length check) is what
makes a 24-character name with a `#` in front acceptable — the contract says
the glyph never counts.

`TagOut` carries `usage_count` because both consumers need it: the settings
page shows it next to every tag, and the delete confirm names the number of
affected meetings (T-36.6). It is computed per response, never stored, and
excludes soft-deleted meetings.
"""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, Field, StringConstraints, field_validator

#: Mirrors the palette length in `seed/avatars.py` / `--ff-speaker-N` tokens.
#: A literal rather than an import: schemas importing from the seed package
#: would invert the layering, and the palette size is pinned by tests anyway.
PALETTE_SIZE = 8

TagName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]


def _strip_leading_hash(value: object) -> object:
    """`#sales` → `sales`, before any length rule runs.

    Strips every leading `#` — a user typing `##urgent` meant one tag, not a
    tag with a `#` in it — then trims again so `# sales` does not survive as
    `" sales"` with a leading space.
    """
    if isinstance(value, str):
        return value.strip().lstrip("#").strip()
    return value


class TagCreate(BaseModel):
    """A new tag (T-36.3's `Create "<query>"`, or the settings page)."""

    name: TagName
    #: Omitted (the common case) leaves the colour NULL and the client derives
    #: it from the name via the speaker-colour hash — same tag, same colour
    #: everywhere, with no round trip. Sent explicitly, it pins a palette slot.
    color_index: int | None = Field(default=None, ge=0, le=PALETTE_SIZE - 1)

    @field_validator("name", mode="before")
    @classmethod
    def _normalise(cls, value: object) -> object:
        return _strip_leading_hash(value)


class TagUpdate(BaseModel):
    """Rename and/or recolour (T-36.6). Omitted fields are left alone.

    `color_index: null` is a real edit — "go back to the hash-derived colour" —
    so the service reads `model_fields_set`, not `is not None`.
    """

    name: TagName | None = None
    color_index: int | None = Field(default=None, ge=0, le=PALETTE_SIZE - 1)

    @field_validator("name", mode="before")
    @classmethod
    def _normalise(cls, value: object) -> object:
        if value is None:
            return None
        return _strip_leading_hash(value)


class TagOut(BaseModel):
    """One tag as the settings page and the editor popover see it.

    No defaults on any field: a default makes it optional in the emitted
    OpenAPI, and the generated client then types an absence the API never
    produces (the ADR-076 defect).
    """

    id: int
    #: Stored WITHOUT the leading `#`; the chip adds the glyph at render time.
    name: str
    #: Palette slot 0-7, or null meaning "hash the name client-side".
    color_index: int | None
    usage_count: int = Field(description="Meetings carrying this tag, excluding deleted ones.")


class TagList(BaseModel):
    """`{items: [...]}` rather than a bare array, matching every other list."""

    items: list[TagOut]


class MeetingTagsUpdate(BaseModel):
    """PUT body: the FULL tag list for a meeting, set semantics (T-36.1).

    Replaces whatever is there — the editor popover applies its checkbox state
    on close, and a diff protocol would just re-derive this on the server. The
    10-tag cap is enforced in the service (after de-duplication) so the error
    is a TAG_LIMIT the client can match on, not a generic length failure.
    """

    tag_ids: list[int]


class TagProposal(BaseModel):
    """One suggested tag (T-36.4). Nothing about it is persisted.

    `tag_id` is set when a tag with this name already exists — accepting it is
    then a plain PUT — and null when accepting means creating the tag first.
    Dismissals never reach the server; they live in the client.
    """

    name: str
    tag_id: int | None


class TagProposalList(BaseModel):
    items: list[TagProposal]
