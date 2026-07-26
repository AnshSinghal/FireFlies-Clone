"""Application factory.

Kept deliberately thin: build the app, wire middleware, mount routers. Business
logic lives in `services/`, never here and never in a router.

The factory shape (rather than a module-level `app = FastAPI()`) is what lets
tests construct an app with overridden dependencies — a database fixture, a stub
AI provider — without touching global state.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.routers import health
from app.core.config import Settings, get_settings


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()

    app = FastAPI(
        title="Fireflies API",
        version=settings.app_version,
        description="Meetings, transcripts, summaries and action items.",
        docs_url="/docs",
        openapi_url="/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Range headers matter for audio seeking (T-17.9); the browser cannot
        # read them cross-origin unless they are explicitly exposed.
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Disposition"],
    )

    # Infrastructure endpoints sit outside the versioned prefix.
    app.include_router(health.router, prefix="/api")

    # T-04 mounts the versioned product routers here:
    #   app.include_router(meetings.router, prefix="/api/v1")
    # along with the uniform error envelope and request-ID middleware.

    return app


app = create_app()
