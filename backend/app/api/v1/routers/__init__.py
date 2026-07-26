"""Versioned API router.

One aggregate router so `main.py` mounts a single object and does not grow a
line per feature. Adding an endpoint means touching this file and the router
module, never the app factory.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.routers import channels, me, meetings, search, summaries, transcript

api_router = APIRouter()
api_router.include_router(me.router)
api_router.include_router(channels.router)
api_router.include_router(search.router)
api_router.include_router(transcript.router)
api_router.include_router(meetings.router)
api_router.include_router(summaries.router)

__all__ = ["api_router"]
