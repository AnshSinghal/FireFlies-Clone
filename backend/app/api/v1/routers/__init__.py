"""Versioned API router.

One aggregate router so `main.py` mounts a single object and does not grow a
line per feature. Adding an endpoint means touching this file and the router
module, never the app factory.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.routers import (
    ask,
    channels,
    comments,
    export,
    highlights,
    me,
    meetings,
    search,
    soundbites,
    summaries,
    tags,
    transcript,
    users,
)

api_router = APIRouter()
api_router.include_router(me.router)
api_router.include_router(channels.router)
api_router.include_router(search.router)
api_router.include_router(transcript.router)
# BEFORE meetings, so the static `GET /meetings/export` (bulk zip, T-34.9) is
# matched ahead of `GET /meetings/{meeting_id}` — Starlette tries routes in
# registration order, and `export` must never be parsed as an id.
api_router.include_router(export.router)
api_router.include_router(meetings.router)
api_router.include_router(summaries.router)
api_router.include_router(ask.router)
api_router.include_router(users.router)
api_router.include_router(comments.router)
api_router.include_router(tags.router)
api_router.include_router(soundbites.router)
api_router.include_router(highlights.router)

__all__ = ["api_router"]
