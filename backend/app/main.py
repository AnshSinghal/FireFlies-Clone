"""Application factory.

Kept deliberately thin: build the app, wire middleware, mount routers. Business
logic lives in `services/`, never here and never in a router.

The factory shape (rather than a module-level `app = FastAPI()`) is what lets
tests construct an app with overridden dependencies — a database fixture, a stub
AI provider — without touching global state.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from slowapi.errors import RateLimitExceeded

from app.api.responses import DEFAULT as DEFAULT_RESPONSES
from app.api.v1.routers import api_router
from app.api.v1.routers import health as health_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers
from app.core.middleware import RequestContextMiddleware
from app.core.rate_limit import limiter, rate_limit_handler

API_V1_PREFIX = "/api/v1"

DESCRIPTION = """
Meetings, transcripts, AI summaries and action items.

**Conventions**

* Every list endpoint returns the same envelope:
  `{items, page, page_size, total, total_pages, has_next}`.
* Every error returns `{error: {code, message, details}}`. Branch on `code`,
  which is stable; `message` is for humans and may be reworded.
* Times are UTC ISO-8601. Positions within a recording are integer
  **milliseconds** (`start_ms`), never formatted strings.
* A deleted meeting returns **410**, not 404 — it is restorable, and the client
  can offer that.
"""


def _configure_logging() -> None:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )


def create_app(settings: Settings | None = None) -> FastAPI:
    settings = settings or get_settings()
    _configure_logging()

    app = FastAPI(
        title="Fireflies API",
        version=settings.app_version,
        description=DESCRIPTION,
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        # Every operation documents the catch-all, so ErrorResponse is always in
        # the schema and the generated client can type a failure.
        responses=DEFAULT_RESPONSES,
    )

    app.state.settings = settings
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

    # Order matters: middleware added last runs first. The request-id middleware
    # is added last so it wraps everything and can stamp an id on a response
    # produced by any of the others.
    app.add_middleware(GZipMiddleware, minimum_size=1000)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Range headers matter for audio seeking (T-17.9); the browser cannot
        # read them cross-origin unless they are explicitly exposed.
        expose_headers=["Content-Range", "Accept-Ranges", "Content-Disposition", "X-Request-ID"],
    )
    app.add_middleware(RequestContextMiddleware)

    register_exception_handlers(app)

    # Infrastructure endpoints sit outside the versioned prefix.
    app.include_router(health_router.router, prefix="/api")
    app.include_router(api_router, prefix=API_V1_PREFIX)

    return app


app = create_app()
