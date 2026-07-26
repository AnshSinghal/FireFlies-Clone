"""Liveness endpoint.

Mounted at /api/health — outside the versioned prefix, because a health check is
infrastructure rather than product API and should not move when v2 arrives.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.core.config import Settings, get_settings
from app.schemas.health import HealthResponse

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    description=(
        "Reports liveness and the active configuration. "
        "Point the host's health check at this endpoint."
    ),
)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    # T-04.11 extends this with a real `SELECT 1` against the database and a 503
    # when that fails. There is no database to check until T-03.
    return HealthResponse(
        status="ok",
        version=settings.app_version,
        ai_provider=settings.ai_provider,
    )
