"""PDF generator (T-34.5, T-34.6) — ReportLab Platypus.

Why ReportLab and not WeasyPrint: both Docker images are `python:3.13-slim`
with ZERO apt packages, and the prod image runs non-root with a read-only
`/app`. WeasyPrint drags in the pango/cairo/gdk-pixbuf C stack, which would
mean growing both Dockerfiles; ReportLab is a pure wheel and deploys with no
image change at all. Recorded in docs/decisions.md.

Page-break discipline (T-34.6): every transcript turn and every action item is
wrapped in `KeepTogether`, and the heading styles carry `keepWithNext` so a
section title is never orphaned at the foot of a page — the difference between
a designed PDF and an HTML dump.

`Page N of M` needs the total before the last page exists, so pages are
buffered: `_DecoratedCanvas` snapshots each page's state in `showPage()` and
replays them in `save()`, stamping the branded header and the footer once the
count is known — the standard two-pass canvas recipe.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from functools import partial
from typing import TYPE_CHECKING, Any, assert_never
from xml.sax.saxutils import escape

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas
from reportlab.platypus import KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.services.export import blocks, palette
from app.services.export.blocks import clock, task_suffix

if TYPE_CHECKING:
    from app.services.export.blocks import Block, ExportDocument

MARGIN = 54
PAGE_WIDTH, PAGE_HEIGHT = LETTER

#: Room for the header band above the frame and the footer below it.
TOP_MARGIN = 92
BOTTOM_MARGIN = 64

# ── Type scale — Helvetica standing in for Inter, same steps as the app ──────

_TITLE = ParagraphStyle(
    "ExportTitle",
    fontName="Helvetica-Bold",
    fontSize=19,
    leading=24,
    textColor=HexColor(palette.INK),
    spaceAfter=12,
)
_H2 = ParagraphStyle(
    "ExportHeading",
    fontName="Helvetica-Bold",
    fontSize=13,
    leading=17,
    textColor=HexColor(palette.INK),
    spaceBefore=18,
    spaceAfter=6,
    # A heading alone at the foot of a page is exactly the orphan T-34.6 bans.
    keepWithNext=1,
)
_H3 = ParagraphStyle(
    "ExportSubheading",
    fontName="Helvetica-Bold",
    fontSize=11,
    leading=14,
    textColor=HexColor(palette.SECONDARY),
    spaceBefore=10,
    spaceAfter=4,
    keepWithNext=1,
)
_BODY = ParagraphStyle(
    "ExportBody",
    fontName="Helvetica",
    fontSize=10,
    leading=15,
    textColor=HexColor(palette.INK),
    spaceAfter=4,
)
_LIST = ParagraphStyle("ExportListItem", parent=_BODY, leftIndent=14, bulletIndent=2, spaceAfter=3)
_TURN = ParagraphStyle("ExportTurn", parent=_BODY, leading=14.5, spaceAfter=7)
_NOTE = ParagraphStyle("ExportNote", parent=_BODY, leading=14.5, spaceAfter=5)
#: A reply, indented one step — the flyout's 32px offset at this type scale.
_NOTE_REPLY = ParagraphStyle("ExportNoteReply", parent=_NOTE, leftIndent=22)
_META_LABEL = ParagraphStyle(
    "ExportMetaLabel",
    fontName="Helvetica-Bold",
    fontSize=9,
    leading=13,
    textColor=HexColor(palette.SECONDARY),
)
_META_VALUE = ParagraphStyle(
    "ExportMetaValue", parent=_BODY, fontSize=9.5, leading=13, spaceAfter=0
)


def render_pdf(document: ExportDocument) -> bytes:
    """The whole document as PDF bytes.

    Built in memory: ReportLab cannot emit a page until it knows where every
    flowable on it lands, so a PDF has no true streaming mode. The service
    chunks the returned bytes for the `StreamingResponse` instead.
    """
    buffer = io.BytesIO()
    template = SimpleDocTemplate(
        buffer,
        pagesize=LETTER,
        leftMargin=MARGIN,
        rightMargin=MARGIN,
        topMargin=TOP_MARGIN,
        bottomMargin=BOTTOM_MARGIN,
        title=document.title,
        author=palette.APP_NAME,
    )

    story: list[Any] = [Paragraph(escape(document.title), _TITLE)]
    if document.metadata:
        story.append(_metadata_table(document.metadata))
        story.append(Spacer(1, 8))
    for block in document.blocks:
        story.extend(_flowables(block))

    exported = datetime.now(UTC)
    template.build(
        story,
        canvasmaker=partial(
            _DecoratedCanvas,
            meeting_title=document.title,
            exported=f"Exported {exported.day} {exported:%B %Y}",
        ),
    )
    return buffer.getvalue()


def _metadata_table(metadata: tuple[tuple[str, str], ...]) -> Any:
    rows = [
        [Paragraph(escape(label), _META_LABEL), Paragraph(escape(value), _META_VALUE)]
        for label, value in metadata
    ]
    table = Table(rows, colWidths=[95, PAGE_WIDTH - 2 * MARGIN - 95], hAlign="LEFT")
    table.setStyle(
        TableStyle(
            [
                ("LINEBELOW", (0, 0), (-1, -1), 0.5, HexColor(palette.BORDER)),
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return table


def _flowables(block: Block) -> list[Any]:
    match block:
        case blocks.Heading(text):
            return [Paragraph(escape(text), _H2)]
        case blocks.Subheading(text):
            return [Paragraph(escape(text), _H3)]
        case blocks.Paragraph(text):
            return [Paragraph(escape(text), _BODY)]
        case blocks.Bullets(items):
            return [Paragraph(escape(item), _LIST, bulletText="•") for item in items]
        case blocks.Outline(entries):
            return [
                Paragraph(
                    f'<font color="{palette.MUTED}">[{clock(entry.start_ms)}]</font>'
                    f"  {escape(entry.title)}",
                    _LIST,
                )
                for entry in entries
            ]
        case blocks.Checklist(tasks):
            # Each item in its own KeepTogether: an action item split across a
            # page break reads as two half-tasks (T-34.6).
            return [KeepTogether([Paragraph(_task_markup(task), _LIST)]) for task in tasks]
        case blocks.Transcript(turns):
            return [
                KeepTogether(
                    [
                        Paragraph(
                            f"<b>{escape(turn.speaker)}</b> "
                            f'<font color="{palette.MUTED}">[{clock(turn.start_ms)}]</font> '
                            f"{escape(turn.text)}",
                            _TURN,
                        )
                    ]
                )
                for turn in turns
            ]
        case blocks.Discussion(notes):
            # Same page-break discipline as a turn: a comment split across
            # pages reads as two half-comments (T-34.6).
            return [
                KeepTogether([Paragraph(_note_markup(note), _NOTE_REPLY if note.depth else _NOTE)])
                for note in notes
            ]
        case _:
            assert_never(block)


def _note_markup(note: blocks.Note) -> str:
    """Bold author, muted markers, then the body — a tombstone is muted italic."""
    if note.deleted:
        return f'<i><font color="{palette.MUTED}">{blocks.DELETED_NOTE}</font></i>'
    meta = blocks.note_meta(note)
    stamp = f' <font color="{palette.MUTED}">{escape(meta)}</font>' if meta else ""
    return f"<b>{escape(note.author)}</b>{stamp}  {escape(note.text)}"


def _task_markup(task: blocks.Task) -> str:
    """A checkbox glyph plus the task text.

    Helvetica has no ballot-box glyphs, so the boxes come from ZapfDingbats —
    one of the fonts every PDF viewer ships: `o` is the open square, `4` the
    heavy check. A completed task is struck through and muted, the same way
    the UI de-emphasises it.
    """
    suffix = task_suffix(task)
    meta = f'<font color="{palette.MUTED}" size="9">{escape(suffix)}</font>' if suffix else ""
    if task.done:
        glyph = f'<font name="ZapfDingbats" color="{palette.ACCENT}">4</font>'
        struck = f'<strike><font color="{palette.MUTED}">{escape(task.text)}</font></strike>'
        return f"{glyph} {struck}{meta}"
    glyph = f'<font name="ZapfDingbats" color="{palette.MUTED}">o</font>'
    return f"{glyph} {escape(task.text)}{meta}"


class _DecoratedCanvas(canvas.Canvas):  # type: ignore[misc]
    """Buffers pages so `Page N of M` can be stamped once M is known."""

    def __init__(self, *args: Any, meeting_title: str, exported: str, **kwargs: Any) -> None:
        super().__init__(*args, **kwargs)
        self._meeting_title = meeting_title
        self._exported = exported
        self._pages: list[dict[str, Any]] = []

    def showPage(self) -> None:  # ReportLab's camelCase API spelling
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self) -> None:
        total = len(self._pages)
        for state in self._pages:
            self.__dict__.update(state)
            self._decorate(total)
            super().showPage()
        super().save()

    # ── Chrome ──────────────────────────────────────────────────────────────

    def _decorate(self, total: int) -> None:
        self._header()
        self._footer(total)

    def _header(self) -> None:
        """The branded band: drawn mark, wordmark, meeting title, accent rule."""
        base = PAGE_HEIGHT - 46
        scale = 13 / 24  # the Topbar mark is drawn on a 24-unit viewbox

        # The same two offset rounded rectangles the frontend draws — never
        # the trademarked Fireflies asset. SVG is y-down, PDF y-up, hence the
        # `24 - (y + h)` flips.
        self.setFillColor(HexColor(palette.BRAND_MARK))
        self.roundRect(
            MARGIN + 2 * scale,
            base + (24 - 11) * scale,
            9 * scale,
            7 * scale,
            2.5 * scale,
            stroke=0,
            fill=1,
        )
        self.setFillColor(HexColor(palette.BRAND_AMBER))
        self.roundRect(
            MARGIN + 13 * scale,
            base + (24 - 20) * scale,
            9 * scale,
            11 * scale,
            2.5 * scale,
            stroke=0,
            fill=1,
        )

        text_x = MARGIN + 13 + 6
        self.setFillColor(HexColor(palette.INK))
        self.setFont("Helvetica-Bold", 9.5)
        self.drawString(text_x, base + 2, palette.APP_NAME)

        name_width = stringWidth(palette.APP_NAME, "Helvetica-Bold", 9.5)
        title_x = text_x + name_width + 8
        self.setFillColor(HexColor(palette.SECONDARY))
        self.setFont("Helvetica", 9.5)
        available = PAGE_WIDTH - MARGIN - title_x
        self.drawString(title_x, base + 2, _fit(self._meeting_title, 9.5, available))

        # A subtle full-width rule with a short accent segment — the same
        # border-plus-accent language the app's surfaces use.
        rule_y = base - 8
        self.setStrokeColor(HexColor(palette.BORDER))
        self.setLineWidth(0.75)
        self.line(MARGIN, rule_y, PAGE_WIDTH - MARGIN, rule_y)
        self.setStrokeColor(HexColor(palette.ACCENT))
        self.setLineWidth(2)
        self.line(MARGIN, rule_y, MARGIN + 64, rule_y)

    def _footer(self, total: int) -> None:
        rule_y = BOTTOM_MARGIN - 18
        self.setStrokeColor(HexColor(palette.BORDER))
        self.setLineWidth(0.75)
        self.line(MARGIN, rule_y, PAGE_WIDTH - MARGIN, rule_y)

        self.setFillColor(HexColor(palette.MUTED))
        self.setFont("Helvetica", 8)
        self.drawString(MARGIN, rule_y - 12, self._exported)
        self.drawRightString(
            PAGE_WIDTH - MARGIN, rule_y - 12, f"Page {self._pageNumber} of {total}"
        )


def _fit(text: str, size: float, max_width: float) -> str:
    """Truncate with an ellipsis so a long title cannot collide with the edge."""
    if stringWidth(text, "Helvetica", size) <= max_width:
        return text
    while text and stringWidth(f"{text}…", "Helvetica", size) > max_width:
        text = text[:-1]
    return f"{text.rstrip()}…"
