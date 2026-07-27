"""The pluggable `include=` section registry (T-34.1).

`include=` names DATA SOURCES, not headings: `summary` expands to four of the
five canonical sections (Keywords, Meeting Overview, Meeting Outline,
Bullet-Point Notes — ADR-015's composition, reused via `to_summary()`),
`actions` is the fifth (Action Items), and `transcript` closes the document.

`comments` and `highlights` are ACCEPTED today and render nothing: their
services land on parallel branches (T-31/T-32). Wiring one in later is a single
line from its own module —

    register_section("comments", comment_blocks)

— because a loader only has to emit `blocks.py` types, which every format
renderer can already draw.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.exceptions import BadRequestError, ValidationError
from app.models import Speaker, TranscriptSegment
from app.models.enums import ActionItemStatus
from app.services.export.blocks import (
    Block,
    Bullets,
    Checklist,
    Heading,
    Outline,
    OutlineItem,
    Paragraph,
    Subheading,
    Task,
    Transcript,
    Turn,
)
from app.services.meetings import MeetingService

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

    from app.models import Meeting

    SectionLoader = Callable[[Session, Meeting], tuple[Block, ...] | None]

#: Every `include=` value the API accepts, in the order sections RENDER —
#: the five canonical summary sections, the transcript, then the
#: parallel-branch sections once they register. The caller's order is
#: deliberately ignored: two exports of the same meeting must read the same.
SECTION_ORDER: tuple[str, ...] = ("summary", "actions", "transcript", "comments", "highlights")

_LOADERS: dict[str, SectionLoader] = {}


def register_section(key: str, loader: SectionLoader) -> None:
    """Plug a data source into the export pipeline.

    `key` must already be in `SECTION_ORDER` — accepting arbitrary keys would
    let a registration typo silently create an include value the API never
    validates.
    """
    if key not in SECTION_ORDER:
        msg = f"Unknown export section {key!r}; add it to SECTION_ORDER first."
        raise ValueError(msg)
    _LOADERS[key] = loader


def parse_include(raw: str | None) -> tuple[str, ...]:
    """`"transcript, summary"` → `("summary", "transcript")` — validated, canonical order.

    Absent means ALL sections (the spec's default). An unknown token is a 422:
    the value failed to parse against the accepted vocabulary. An `include=`
    that selects nothing is a 400: every token parsed, but an export of zero
    sections is a request we will not act on.
    """
    if raw is None:
        return SECTION_ORDER

    tokens = {token.strip().lower() for token in raw.split(",") if token.strip()}
    if not tokens:
        raise BadRequestError(
            "include= selects no sections.",
            code="EMPTY_INCLUDE",
            details={"allowed": list(SECTION_ORDER)},
        )

    unknown = sorted(tokens - set(SECTION_ORDER))
    if unknown:
        raise ValidationError(
            f"Unknown include section(s): {', '.join(unknown)}.",
            details={"include": unknown, "allowed": list(SECTION_ORDER)},
        )

    return tuple(key for key in SECTION_ORDER if key in tokens)


def load_blocks(db: Session, meeting: Meeting, sections: tuple[str, ...]) -> tuple[Block, ...]:
    """Run every selected, registered loader, in canonical order.

    A selected section with no registered loader is skipped silently — that is
    the accepted-but-not-landed case (`comments`/`highlights`), not an error.
    """
    blocks: list[Block] = []
    for key in SECTION_ORDER:
        if key not in sections:
            continue
        loader = _LOADERS.get(key)
        if loader is None:
            continue
        loaded = loader(db, meeting)
        if loaded:
            blocks.extend(loaded)
    return tuple(blocks)


# ── Built-in loaders ─────────────────────────────────────────────────────────


def _summary_blocks(db: Session, meeting: Meeting) -> tuple[Block, ...] | None:
    """Keywords, Meeting Overview, Meeting Outline, Bullet-Point Notes.

    Reuses `to_summary()` — the ADR-015 composition point — rather than
    querying `summary_sections` directly, so the export can never disagree with
    the summary panel about what the five canonical sections contain. A
    meeting that was never summarised yields empty parts (ADR-046), and each
    empty part is skipped rather than rendered as a bare heading.
    """
    summary = MeetingService(db).to_summary(meeting)

    blocks: list[Block] = []
    if summary.keywords:
        blocks += [Heading("Keywords"), Paragraph(", ".join(summary.keywords))]
    if summary.overview:
        blocks += [Heading("Meeting Overview"), Paragraph(summary.overview)]
    if summary.outline:
        entries = tuple(OutlineItem(entry.start_ms, entry.title) for entry in summary.outline)
        blocks += [Heading("Meeting Outline"), Outline(entries)]
    if summary.notes:
        blocks.append(Heading("Bullet-Point Notes"))
        for group in summary.notes:
            if group.chapter:
                blocks.append(Subheading(group.chapter))
            if group.bullets:
                blocks.append(Bullets(tuple(group.bullets)))
    return tuple(blocks) or None


def _action_blocks(db: Session, meeting: Meeting) -> tuple[Block, ...] | None:
    """Action Items, in the exact order the UI lists them (`action_items()`)."""
    items = MeetingService(db).action_items(meeting.id)
    if not items:
        return None
    tasks = tuple(
        Task(
            done=item.status == ActionItemStatus.COMPLETED,
            text=item.text,
            assignee=item.assignee_name,
            due=item.due_date,
        )
        for item in items
    )
    return (Heading("Action Items"), Checklist(tasks))


def _transcript_blocks(db: Session, meeting: Meeting) -> tuple[Block, ...] | None:
    """Every transcript line, speaker label resolved, in ONE query.

    The `Meeting.segments` relationship is deliberately lazy and never touched
    here — this is the `_transcript_for_ai` join pattern, selecting only the
    three columns the renderers need so a 1,200-segment export does not hydrate
    full ORM rows it will immediately discard.
    """
    rows = db.execute(
        select(Speaker.label, TranscriptSegment.start_ms, TranscriptSegment.text)
        .join(Speaker, TranscriptSegment.speaker_id == Speaker.id)
        .where(TranscriptSegment.meeting_id == meeting.id)
        .order_by(TranscriptSegment.sequence)
    ).all()
    if not rows:
        return None
    turns = tuple(
        Turn(speaker=label, start_ms=start_ms, text=text) for label, start_ms, text in rows
    )
    return (Heading("Transcript"), Transcript(turns))


register_section("summary", _summary_blocks)
register_section("actions", _action_blocks)
register_section("transcript", _transcript_blocks)
