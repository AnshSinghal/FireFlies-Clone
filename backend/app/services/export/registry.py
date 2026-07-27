"""The pluggable `include=` section registry (T-34.1).

`include=` names DATA SOURCES, not headings: `summary` expands to four of the
five canonical sections (Keywords, Meeting Overview, Meeting Outline,
Bullet-Point Notes — ADR-015's composition, reused via `to_summary()`),
`actions` is the fifth (Action Items), and `transcript` closes the document.

`comments` joined them once T-31 landed: a loader that turns `CommentService`
rows into `blocks.py` types, plus one `register_section` call. `highlights` is
still ACCEPTED and renders nothing — a selected section with no registered
loader is skipped, so T-32 lands the same way without touching this endpoint's
contract.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import select

from app.core.exceptions import BadRequestError, ValidationError
from app.models import Speaker, TranscriptSegment
from app.models.enums import ActionItemStatus, HighlightColor
from app.services.comments import CommentService
from app.services.export.blocks import (
    Block,
    Bullets,
    Checklist,
    Discussion,
    Heading,
    Note,
    Outline,
    OutlineItem,
    Paragraph,
    Subheading,
    Task,
    Transcript,
    Turn,
    clock,
)
from app.services.highlights import HighlightService
from app.services.meetings import MeetingService

if TYPE_CHECKING:
    from collections.abc import Callable

    from sqlalchemy.orm import Session

    from app.models import Meeting
    from app.schemas.comment import CommentOut

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


def _comment_blocks(db: Session, meeting: Meeting) -> tuple[Block, ...] | None:
    """Comment threads, in the exact order the flyout lists them (T-31 → T-34).

    Goes through `CommentService.threads()` rather than the table so the export
    inherits every rule T-31 settled: timeline ordering, replies one level in,
    and tombstoned parents kept only while a live reply still hangs off them.
    Nothing is dropped here that the service did not already drop.

    Mentions need no work: they are stored as rows for STYLING, and the body
    they were parsed out of still reads `@Priya Sharma` — so plain text is
    already the right rendering.
    """
    threads = CommentService(db).threads(meeting)
    if not threads:
        return None

    notes: list[Note] = []
    for thread in threads:
        notes.append(_note(thread, depth=0))
        notes.extend(_note(reply, depth=1) for reply in thread.replies)
    return (Heading("Comments"), Discussion(tuple(notes)))


def _note(comment: CommentOut, *, depth: int) -> Note:
    return Note(
        author=comment.author.name,
        # Only the opener is anchored — a reply inherited this same timestamp
        # from its parent, and four formats repeating it reads as noise.
        start_ms=comment.start_ms if depth == 0 else None,
        # Whitespace collapses: a body is free text, and a hard line break
        # inside a Markdown list item ends the list under the reply it owns.
        text=" ".join(comment.body.split()),
        resolved=comment.is_resolved,
        deleted=comment.is_deleted,
        depth=depth,
    )


def _highlight_blocks(db: Session, meeting: Meeting) -> tuple[Block, ...] | None:
    """Highlights grouped by colour, then bookmarked moments (T-32.10).

    Goes through `HighlightService` so the excerpt text is sliced from the
    segment at read time — the export can never quote characters the offsets
    no longer cover. Pure reuse of existing block types: one Subheading per
    colour, entries as bullets, no renderer changes.
    """
    service = HighlightService(db)
    highlights = service.list_highlights(meeting)
    bookmarks = service.list_bookmarks(meeting)
    if not highlights and not bookmarks:
        return None

    blocks: list[Block] = [Heading("Highlights")]
    for color in HighlightColor:
        entries = [h for h in highlights if h.color == color]
        if not entries:
            continue
        blocks.append(Subheading(color.value.capitalize()))
        blocks.append(
            Bullets(
                tuple(
                    f"{clock(entry.start_ms)} · {entry.speaker}: “{entry.text}”"
                    + (f" — {entry.note}" if entry.note else "")
                    for entry in entries
                )
            )
        )

    if bookmarks:
        blocks.append(Subheading("Bookmarked moments"))
        blocks.append(
            Bullets(
                tuple(
                    f"{clock(mark.start_ms)} · {mark.speaker}: {mark.snippet}" for mark in bookmarks
                )
            )
        )
    return tuple(blocks)


register_section("summary", _summary_blocks)
register_section("actions", _action_blocks)
register_section("transcript", _transcript_blocks)
register_section("comments", _comment_blocks)
register_section("highlights", _highlight_blocks)
