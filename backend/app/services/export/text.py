"""Plain-text generator (T-34.4).

Fixed-width friendly: `====`-underlined headings, `[MM:SS] Speaker: text`
transcript lines, everything hard-wrapped at 100 columns with `textwrap`.
No markup of any kind — this is the format for a terminal, an email body, or
a system that chokes on asterisks.
"""

from __future__ import annotations

import textwrap
from typing import TYPE_CHECKING, assert_never

from app.services.export.blocks import (
    DELETED_NOTE,
    Bullets,
    Checklist,
    Discussion,
    Heading,
    Outline,
    Paragraph,
    Subheading,
    Transcript,
    clock,
    note_meta,
    task_suffix,
)

if TYPE_CHECKING:
    from collections.abc import Iterator

    from app.services.export.blocks import Block, ExportDocument, Note

#: The spec's hard-wrap column.
WIDTH = 100

#: Continuation lines of a wrapped bullet/turn indent under the first line's
#: text rather than under its prefix, so the prefix stays scannable.
_INDENT = "    "


def render_text(document: ExportDocument) -> Iterator[str]:
    yield _underlined(document.title)

    if document.metadata:
        for label, value in document.metadata:
            yield _wrapped(f"{label}: {value}")
        yield "\n"

    for block in document.blocks:
        yield from _render_block(block)


def _underlined(text: str) -> str:
    """The heading plus a `====` rule sized to its longest wrapped line.

    Headings wrap too — a 200-character title would otherwise be the one line
    in the file that violates the 100-column promise.
    """
    lines = textwrap.wrap(text, width=WIDTH) or [text]
    rule = "=" * max(len(line) for line in lines)
    return "".join(f"{line}\n" for line in lines) + f"{rule}\n\n"


def _wrapped(text: str, *, indent: str = "", first: str = "") -> str:
    """Hard-wrap at `WIDTH`. `first` indents the opening line, `indent` the rest."""
    lines = textwrap.wrap(text, width=WIDTH, initial_indent=first, subsequent_indent=indent) or [
        first
    ]
    return "".join(f"{line}\n" for line in lines)


def _render_block(block: Block) -> Iterator[str]:
    match block:
        case Heading(text) | Subheading(text):
            yield "\n"
            yield _underlined(text)
        case Paragraph(text):
            yield _wrapped(text)
            yield "\n"
        case Bullets(items):
            for item in items:
                yield _wrapped(f"- {item}", indent="  ")
            yield "\n"
        case Outline(entries):
            for entry in entries:
                yield _wrapped(f"[{clock(entry.start_ms)}] {entry.title}", indent=_INDENT)
            yield "\n"
        case Checklist(tasks):
            for task in tasks:
                box = "[x]" if task.done else "[ ]"
                yield _wrapped(f"{box} {task.text}{task_suffix(task)}", indent=_INDENT)
            yield "\n"
        case Transcript(turns):
            for turn in turns:
                line = f"[{clock(turn.start_ms)}] {turn.speaker}: {turn.text}"
                yield _wrapped(line, indent=_INDENT)
                yield "\n"
        case Discussion(notes):
            # Indentation is the only nesting cue plain text has, so a reply
            # steps in TWICE the continuation indent: at one step a wrapped
            # comment body and a reply would begin in the same column and the
            # thread would stop being readable. A blank line opens each new
            # thread, the way one opens each transcript turn.
            for index, note in enumerate(notes):
                if note.depth == 0 and index:
                    yield "\n"
                lead = _INDENT * 2 * note.depth
                yield _wrapped(_note_line(note), first=lead, indent=lead + _INDENT)
            yield "\n"
        case _:
            assert_never(block)


def _note_line(note: Note) -> str:
    if note.deleted:
        return DELETED_NOTE
    meta = note_meta(note)
    return f"{note.author}{f' {meta}' if meta else ''}: {note.text}"
