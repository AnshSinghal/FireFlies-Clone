"""Export orchestration (T-34.1, T-34.7, T-34.9, T-34.11).

One service, two entry points: a single meeting as a file, or several as a
zip with one file each. Both validate everything UP FRONT — include tokens,
ids, 404/410 — and only then hand back a lazy chunk iterator, so an error can
never surface after the response headers have already been streamed.
"""

from __future__ import annotations

import tempfile
import zipfile
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.exceptions import MeetingNotFoundError, ValidationError
from app.models import Meeting
from app.services.export.blocks import ExportDocument, clock
from app.services.export.filename import export_filename
from app.services.export.markdown import render_markdown
from app.services.export.pdf import render_pdf
from app.services.export.registry import load_blocks, parse_include
from app.services.export.text import render_text
from app.services.export.word import render_docx
from app.services.meetings import MeetingService

if TYPE_CHECKING:
    from collections.abc import Iterator

    from sqlalchemy.orm import Session

    from app.schemas.export import ExportFormat

#: StreamingResponse chunk size for the formats that render to bytes at once.
CHUNK_BYTES = 64 * 1024

#: A zip larger than this spills from memory to disk (SpooledTemporaryFile).
SPOOL_BYTES = 32 * 1024 * 1024

MEDIA_TYPES: dict[str, str] = {
    "md": "text/markdown; charset=utf-8",
    "txt": "text/plain; charset=utf-8",
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}
ZIP_MEDIA_TYPE = "application/zip"


@dataclass(frozen=True)
class ExportFile:
    """What the router needs to build a download response — nothing more."""

    filename: str
    media_type: str
    chunks: Iterator[bytes]


class ExportService:
    """Stateless apart from the session it was handed."""

    def __init__(self, db: Session) -> None:
        self.db = db

    def export_meeting(
        self, meeting_id: int, *, format: ExportFormat, include: str | None
    ) -> ExportFile:
        """One meeting, one file.

        `get()` runs before anything renders, so a deleted meeting answers
        410 MEETING_DELETED — never an export of a deleted meeting and never
        an empty file.
        """
        sections = parse_include(include)
        meeting = MeetingService(self.db).get(meeting_id)
        document = self._document(meeting, sections)
        return ExportFile(
            filename=export_filename(meeting.title, meeting.started_at.date(), format),
            media_type=MEDIA_TYPES[format],
            chunks=self._chunks(document, format),
        )

    def export_zip(self, ids: str, *, format: ExportFormat, include: str | None) -> ExportFile:
        """Several meetings, one zip, one file per meeting (T-34.9).

        All-or-nothing: a missing or deleted id fails the WHOLE request with a
        404 naming the offenders, because a bulk download that silently ships
        7 of the 9 files the user selected looks complete and is not.
        """
        sections = parse_include(include)
        meetings = self._meetings(self._parse_ids(ids))
        stamp = datetime.now(UTC).date().isoformat()
        return ExportFile(
            filename=f"meetings-export-{stamp}.zip",
            media_type=ZIP_MEDIA_TYPE,
            chunks=self._zip_chunks(meetings, sections, format),
        )

    # ── Assembly ────────────────────────────────────────────────────────────

    def _document(self, meeting: Meeting, sections: tuple[str, ...]) -> ExportDocument:
        exported = datetime.now(UTC)
        metadata = [
            ("Date", _human_date(meeting.started_at)),
            ("Duration", clock(meeting.duration_seconds * 1000)),
            ("Host", meeting.host.name),
        ]
        participants = ", ".join(p.display_name for p in meeting.participants)
        if participants:
            metadata.append(("Participants", participants))
        metadata.append(("Exported", _human_date(exported)))

        return ExportDocument(
            title=meeting.title,
            metadata=tuple(metadata),
            blocks=load_blocks(self.db, meeting, sections),
        )

    def _chunks(self, document: ExportDocument, format: ExportFormat) -> Iterator[bytes]:
        """Byte chunks for a StreamingResponse (T-34.7).

        Markdown and text stream as they render — block by block, never the
        whole document in one string. PDF and DOCX are container formats that
        cannot be emitted incrementally, so they render once and re-chunk.
        """
        if format == "md":
            return (chunk.encode("utf-8") for chunk in render_markdown(document))
        if format == "txt":
            return (chunk.encode("utf-8") for chunk in render_text(document))
        if format == "pdf":
            return _rechunk(render_pdf(document))
        return _rechunk(render_docx(document))

    def _zip_chunks(
        self, meetings: list[Meeting], sections: tuple[str, ...], format: ExportFormat
    ) -> Iterator[bytes]:
        """Build the archive lazily, spilling to disk past `SPOOL_BYTES`.

        Lazy so the (possibly slow) rendering happens while the response
        streams rather than before the first byte; spooled so a big bulk
        export bounds memory at one meeting's rendered file plus the spool.
        """
        with tempfile.SpooledTemporaryFile(max_size=SPOOL_BYTES) as spool:
            with zipfile.ZipFile(spool, "w", zipfile.ZIP_DEFLATED) as archive:
                used: set[str] = set()
                for meeting in meetings:
                    document = self._document(meeting, sections)
                    name = _dedupe(
                        export_filename(meeting.title, meeting.started_at.date(), format), used
                    )
                    archive.writestr(name, b"".join(self._chunks(document, format)))
            spool.seek(0)
            while chunk := spool.read(CHUNK_BYTES):
                yield chunk

    # ── Bulk id handling ────────────────────────────────────────────────────

    def _parse_ids(self, raw: str) -> list[int]:
        tokens = [token.strip() for token in raw.split(",") if token.strip()]
        if not tokens:
            raise ValidationError("ids= selects no meetings.", details={"ids": raw})
        try:
            parsed = [int(token) for token in tokens]
        except ValueError as error:
            raise ValidationError(
                "ids= must be a comma-separated list of meeting ids.",
                details={"ids": raw},
            ) from error
        # De-duplicated but ORDER-PRESERVING: the zip lists files in the order
        # the user selected the meetings.
        return list(dict.fromkeys(parsed))

    def _meetings(self, meeting_ids: list[int]) -> list[Meeting]:
        """Resolve every id or fail naming the ones that did not resolve.

        `host` is eager-loaded here because `_document` reads it per meeting —
        without it a 20-meeting bulk export costs 20 extra host queries.
        """
        rows = self.db.execute(
            select(Meeting).where(Meeting.id.in_(meeting_ids)).options(selectinload(Meeting.host))
        ).scalars()
        by_id = {meeting.id: meeting for meeting in rows}

        missing = [i for i in meeting_ids if i not in by_id]
        deleted = [i for i in meeting_ids if i in by_id and by_id[i].deleted_at is not None]
        if missing or deleted:
            raise MeetingNotFoundError(
                "Some meetings do not exist or were deleted.",
                details={"missing": missing, "deleted": deleted},
            )
        return [by_id[i] for i in meeting_ids]


def _rechunk(payload: bytes) -> Iterator[bytes]:
    for offset in range(0, len(payload), CHUNK_BYTES):
        yield payload[offset : offset + CHUNK_BYTES]


def _dedupe(name: str, used: set[str]) -> str:
    """Two meetings titled alike on the same day must not collide in the zip."""
    candidate = name
    counter = 2
    while candidate in used:
        stem, dot, extension = name.rpartition(".")
        candidate = f"{stem}-{counter}{dot}{extension}"
        counter += 1
    used.add(candidate)
    return candidate


def _human_date(moment: datetime) -> str:
    """`24 July 2026` — locale-independent, no platform-specific strftime flags."""
    return f"{moment.day} {moment:%B %Y}"
