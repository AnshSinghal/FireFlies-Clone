"""The format-neutral document model every export renders from (T-34).

Section loaders (registry.py) turn database rows into these blocks; each format
renderer (markdown/text/pdf/word) knows how to draw every block type. That
split is what keeps a new section cheap: a loader that reuses existing block
types costs one `register_section` call and no renderer changes at all.

`Discussion` is the one case that needed a new type — threading and the
resolved/tombstone markers are shape no existing block carries — so wiring
T-31's comments in cost four small renderer cases on top of the loader. The
exhaustive `match` in each renderer is what made that safe: adding a member to
`Block` turns every unhandled format into a type error rather than a silently
missing section.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import date


def clock(ms: int) -> str:
    """Milliseconds → ``MM:SS``, or ``H:MM:SS`` past the hour.

    Formatting happens HERE, at the presentation edge — the database and the
    API speak integer milliseconds only (see the hard rule in CLAUDE.md).
    """
    total = ms // 1000
    hours, remainder = divmod(total, 3600)
    minutes, seconds = divmod(remainder, 60)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes:02d}:{seconds:02d}"


@dataclass(frozen=True)
class Heading:
    """A section heading — `##` in Markdown, `====`-underlined in text."""

    text: str


@dataclass(frozen=True)
class Subheading:
    """A chapter heading inside a section (a Bullet-Point Notes chapter)."""

    text: str


@dataclass(frozen=True)
class Paragraph:
    text: str


@dataclass(frozen=True)
class Bullets:
    items: tuple[str, ...]


@dataclass(frozen=True)
class OutlineItem:
    start_ms: int
    title: str


@dataclass(frozen=True)
class Outline:
    """Meeting Outline entries — a timestamped bullet per chapter."""

    entries: tuple[OutlineItem, ...]


@dataclass(frozen=True)
class Task:
    """One action item. `done` maps to `- [x]` / a checked glyph."""

    done: bool
    text: str
    assignee: str | None
    due: date | None


@dataclass(frozen=True)
class Checklist:
    items: tuple[Task, ...]


@dataclass(frozen=True)
class Turn:
    """One transcript line: who said what, and when."""

    speaker: str
    start_ms: int
    text: str


@dataclass(frozen=True)
class Transcript:
    turns: tuple[Turn, ...]


#: What a tombstoned comment reads as, in every format — the same words the
#: comment flyout shows, so an export never invents wording the UI does not use.
DELETED_NOTE = "Comment deleted"


@dataclass(frozen=True)
class Note:
    """One comment. `depth` is 0 for the comment that opens a thread, 1 for a
    reply — T-31 allows no third level, so renderers indent one step and never
    recurse.

    `deleted` is the tombstone: a parent whose replies outlived it. It keeps
    its slot in the thread but carries no author, timestamp or words.
    """

    author: str
    start_ms: int | None
    text: str
    resolved: bool
    deleted: bool
    depth: int


@dataclass(frozen=True)
class Discussion:
    """The comment stream, FLATTENED — each thread's opener then its replies.

    Flat rather than nested because `depth` already carries the only nesting
    the schema permits, and a flat tuple is what every renderer wants: one
    loop, one indent multiplier, no recursion in four places.
    """

    notes: tuple[Note, ...]


Block = Heading | Subheading | Paragraph | Bullets | Outline | Checklist | Transcript | Discussion


def note_meta(note: Note) -> str:
    """``[04:32] (resolved)`` — the markers shared so no two formats drift.

    Only a thread's opener is anchored: a reply inherits its parent's
    timestamp, so repeating it under every reply is noise.
    """
    parts = [
        part
        for part in (
            f"[{clock(note.start_ms)}]" if note.start_ms is not None else None,
            "(resolved)" if note.resolved else None,
        )
        if part
    ]
    return " ".join(parts)


def task_suffix(task: Task) -> str:
    """``(Sarah Chen · due 2026-07-28)`` — shared so no two formats drift."""
    parts = [
        part
        for part in (task.assignee, f"due {task.due.isoformat()}" if task.due else None)
        if part
    ]
    return f" ({' · '.join(parts)})" if parts else ""


@dataclass(frozen=True)
class ExportDocument:
    """A whole export: title, the metadata block, then the selected sections."""

    title: str
    metadata: tuple[tuple[str, str], ...]
    blocks: tuple[Block, ...]
