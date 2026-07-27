"""The format-neutral document model every export renders from (T-34).

Section loaders (registry.py) turn database rows into these blocks; each format
renderer (markdown/text/pdf/word) knows how to draw every block type. That
split is what makes a future section — comments, highlights — a one-line
registration: its loader emits blocks the renderers can already draw, so no
renderer changes with it.
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


Block = Heading | Subheading | Paragraph | Bullets | Outline | Checklist | Transcript


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
