"""Export endpoints (T-34.1, T-34.9).

Route order is load-bearing twice over: the static bulk path `/export` is
declared before `/{meeting_id}/export` in this file, and this ROUTER is
registered ahead of the meetings router in `routers/__init__.py` — otherwise
`GET /meetings/export` is captured by `GET /meetings/{meeting_id}` and dies as
a 422 trying to parse `"export"` as an id.
"""

from __future__ import annotations

from typing import Annotated, Any

from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse

from app.api.responses import NOT_FOUND_OR_GONE, VALIDATION
from app.core.deps import DbSession
from app.schemas.export import ExportFormat
from app.services.export import ExportFile, ExportService

router = APIRouter(prefix="/meetings", tags=["export"])

_FORMAT_DOC = "The file format to render."
_INCLUDE_DOC = (
    "Comma-separated sections: `summary`, `transcript`, `actions`, `comments`, "
    "`highlights`. Omitted means all of them."
)

#: Binary endpoints have no response_model, so the payload types are declared
#: here for OpenAPI instead.
_FILE_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": (
            "The exported file, as an attachment. `Content-Disposition` carries "
            "the sanitised `<slug-of-title>-<date>.<ext>` filename."
        ),
        "content": {
            "application/pdf": {"schema": {"type": "string", "format": "binary"}},
            "text/markdown": {"schema": {"type": "string"}},
            "text/plain": {"schema": {"type": "string"}},
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
                "schema": {"type": "string", "format": "binary"}
            },
        },
    },
}
_ZIP_RESPONSES: dict[int | str, dict[str, Any]] = {
    200: {
        "description": "A zip archive with one file per requested meeting.",
        "content": {"application/zip": {"schema": {"type": "string", "format": "binary"}}},
    },
    404: {
        **NOT_FOUND_OR_GONE[404],
        "description": "One or more ids are unknown or deleted; `details` lists them.",
    },
}


def _attachment(result: ExportFile) -> StreamingResponse:
    return StreamingResponse(
        result.chunks,
        media_type=result.media_type,
        headers={"Content-Disposition": f'attachment; filename="{result.filename}"'},
    )


@router.get(
    "/export",
    summary="Export several meetings as a zip archive",
    description=(
        "One file per meeting, all in the requested format (T-34.9). "
        "All-or-nothing: an unknown or deleted id fails the whole request with "
        "a 404 naming the offenders, rather than shipping a zip that silently "
        "misses files."
    ),
    responses={**_ZIP_RESPONSES, **VALIDATION},
)
def export_meetings(
    db: DbSession,
    ids: Annotated[str, Query(description="Comma-separated meeting ids.")],
    format: Annotated[ExportFormat, Query(description=_FORMAT_DOC)],
    include: Annotated[str | None, Query(description=_INCLUDE_DOC)] = None,
) -> StreamingResponse:
    return _attachment(ExportService(db).export_zip(ids, format=format, include=include))


@router.get(
    "/{meeting_id}/export",
    summary="Export a meeting as a file",
    description=(
        "The meeting rendered to `pdf`, `md`, `txt` or `docx`, streamed as a "
        "download (T-34.7). `include=` picks sections; the five canonical "
        "summary sections come from `summary` + `actions`."
    ),
    responses={**_FILE_RESPONSES, **NOT_FOUND_OR_GONE, **VALIDATION},
)
def export_meeting(
    db: DbSession,
    meeting_id: int,
    format: Annotated[ExportFormat, Query(description=_FORMAT_DOC)],
    include: Annotated[str | None, Query(description=_INCLUDE_DOC)] = None,
) -> StreamingResponse:
    return _attachment(ExportService(db).export_meeting(meeting_id, format=format, include=include))
