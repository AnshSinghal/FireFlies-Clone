"""Transcript, speaker and media endpoints (T-17.2 to T-17.6, T-17.9)."""

from __future__ import annotations

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Header, Query, Response, status

from app.api.responses import NOT_FOUND_OR_GONE, VALIDATION
from app.core.config import get_settings
from app.core.deps import DbSession
from app.core.exceptions import MediaNotFoundError
from app.schemas.transcript import (
    SegmentOut,
    SegmentUpdate,
    SpeakerCreate,
    SpeakerRef,
    SpeakerUpdate,
    TranscriptPage,
)
from app.services.media import RangeNotSatisfiable, parse_range, read_range
from app.services.meetings import MeetingService
from app.services.transcript import DEFAULT_PAGE_SIZE, TranscriptService

router = APIRouter(prefix="/meetings", tags=["transcript"])


@router.get(
    "/{meeting_id}/transcript",
    response_model=TranscriptPage,
    responses=NOT_FOUND_OR_GONE,
    summary="A page of transcript segments",
    description=(
        "Cursor-paginated on `sequence`, because a 55-minute meeting is ~1,200 "
        "segments. Speakers are sent BY REFERENCE once per page rather than "
        "inlined on every segment.\n\n"
        "`?q=` filters server-side and returns match offsets, so a long "
        "transcript does not have to be downloaded before it can be searched."
    ),
)
def get_transcript(
    db: DbSession,
    meeting_id: int,
    cursor: Annotated[int | None, Query(description="`sequence` of the last segment seen.")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = DEFAULT_PAGE_SIZE,
    q: Annotated[str | None, Query(description="Filter to matching segments.")] = None,
) -> TranscriptPage:
    # Through `get` first, so a deleted meeting answers 410 rather than an
    # empty page that reads as "no transcript".
    MeetingService(db).get(meeting_id)
    return TranscriptService(db).page(meeting_id, cursor=cursor, limit=limit, query=q)


@router.get(
    "/{meeting_id}/speakers",
    response_model=list[SpeakerRef],
    responses=NOT_FOUND_OR_GONE,
    summary="Every speaker in a meeting",
)
def get_speakers(db: DbSession, meeting_id: int) -> list[SpeakerRef]:
    MeetingService(db).get(meeting_id)
    return TranscriptService(db).speakers(meeting_id)


@router.post(
    "/{meeting_id}/speakers",
    response_model=SpeakerRef,
    status_code=201,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Add a speaker",
    description=(
        "For a voice the diariser missed. The colour index continues the "
        "meeting's sequence, so the new speaker is visibly distinct from the "
        "ones already on screen."
    ),
)
def create_speaker(db: DbSession, meeting_id: int, payload: SpeakerCreate) -> SpeakerRef:
    MeetingService(db).get(meeting_id)
    return TranscriptService(db).create_speaker(meeting_id, payload)


@router.patch(
    "/segments/{segment_id}",
    response_model=SegmentOut,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Edit a transcript segment",
    description=(
        "Sets `is_edited`, captures the original text once so the edit is "
        "reversible, and marks the summary stale — a summary derived from text "
        "that has since changed is confidently wrong."
    ),
)
def update_segment(db: DbSession, segment_id: int, payload: SegmentUpdate) -> SegmentOut:
    return TranscriptService(db).update_segment(segment_id, payload)


@router.patch(
    "/speakers/{speaker_id}",
    response_model=SpeakerRef,
    responses={**NOT_FOUND_OR_GONE, **VALIDATION},
    summary="Rename a speaker",
    description=(
        "One UPDATE, however long the transcript is: the label lives on "
        "`speakers` and segments reference it."
    ),
)
def update_speaker(db: DbSession, speaker_id: int, payload: SpeakerUpdate) -> SpeakerRef:
    return TranscriptService(db).rename_speaker(speaker_id, payload)


@router.get(
    "/{meeting_id}/media",
    responses=NOT_FOUND_OR_GONE,
    summary="Stream a meeting's audio",
    description=(
        "Supports HTTP Range (206). Without it a browser can play the file but "
        "cannot SEEK — the scrubber silently snaps back, with no error "
        "anywhere. `Accept-Ranges: bytes` is always advertised."
    ),
)
def get_media(
    db: DbSession,
    meeting_id: int,
    range_header: Annotated[str | None, Header(alias="Range")] = None,
) -> Response:
    meeting = MeetingService(db).get(meeting_id)

    path = Path(get_settings().media_dir) / "sample-meeting.m4a"
    if meeting.media_url is None or not path.is_file():
        raise MediaNotFoundError(details={"meeting_id": meeting_id})

    size = path.stat().st_size

    try:
        byte_range = parse_range(range_header, size)
    except RangeNotSatisfiable:
        # 416 MUST carry `Content-Range: bytes */size` so the client can learn
        # the real length and retry sensibly.
        return Response(
            status_code=status.HTTP_416_RANGE_NOT_SATISFIABLE,
            headers={"Content-Range": f"bytes */{size}", "Accept-Ranges": "bytes"},
        )

    if byte_range is None:
        return Response(
            content=path.read_bytes(),
            media_type="audio/mp4",
            headers={"Accept-Ranges": "bytes", "Content-Length": str(size)},
        )

    return Response(
        content=read_range(path, byte_range),
        status_code=status.HTTP_206_PARTIAL_CONTENT,
        media_type="audio/mp4",
        headers={
            "Accept-Ranges": "bytes",
            "Content-Range": byte_range.content_range,
            "Content-Length": str(byte_range.length),
        },
    )
