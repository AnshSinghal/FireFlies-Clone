"""Markdown generator (T-34.3).

Pure CommonMark — no raw HTML anywhere, because the output's whole job is to
paste cleanly into GitHub and Notion. A generator of string chunks rather than
one joined string, so a long transcript streams (T-34.7) instead of being
assembled twice.
"""

from __future__ import annotations

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


def render_markdown(document: ExportDocument) -> Iterator[str]:
    yield f"# {document.title}\n"

    if document.metadata:
        # A bullet list rather than trailing-double-space line breaks: the
        # two-space convention is invisible in an editor and half the paste
        # targets strip it, which silently merges the metadata into one line.
        yield "\n"
        for label, value in document.metadata:
            yield f"- **{label}:** {value}\n"

    for block in document.blocks:
        yield from _render_block(block)


def _render_block(block: Block) -> Iterator[str]:
    match block:
        case Heading(text):
            yield f"\n## {text}\n"
        case Subheading(text):
            yield f"\n### {text}\n"
        case Paragraph(text):
            yield f"\n{text}\n"
        case Bullets(items):
            yield "\n"
            for item in items:
                yield f"- {item}\n"
        case Outline(entries):
            yield "\n"
            for entry in entries:
                yield f"- [{clock(entry.start_ms)}] {entry.title}\n"
        case Checklist(tasks):
            yield "\n"
            for task in tasks:
                box = "x" if task.done else " "
                yield f"- [{box}] {task.text}{task_suffix(task)}\n"
        case Transcript(turns):
            # One paragraph per turn: `**Speaker** [00:14] text`. Blank lines
            # between turns are what keep them separate paragraphs after a
            # paste, rather than one run-on wall of text.
            for turn in turns:
                yield f"\n**{turn.speaker}** [{clock(turn.start_ms)}] {turn.text}\n"
        case Discussion(notes):
            # A nested bullet list, because that is the one CommonMark
            # construct that survives a paste into GitHub or Notion still
            # showing which comment a reply hangs off.
            yield "\n"
            for note in notes:
                yield f"{'  ' * note.depth}- {_note_markup(note)}\n"
        case _:
            assert_never(block)


def _note_markup(note: Note) -> str:
    if note.deleted:
        return f"*{DELETED_NOTE}*"
    meta = note_meta(note)
    lead = f"**{note.author}**" + (f" {meta}" if meta else "")
    return f"{lead} — {note.text}"
