"""Liveness and readiness.

Mounted at /api/health — outside the versioned prefix, because a health check is
infrastructure rather than product API and should not move when v2 arrives.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.api.responses import UNAVAILABLE
from app.core.config import Settings, get_settings
from app.core.deps import DbSession
from app.schemas.health import HealthResponse
from app.services.health import HealthService

router = APIRouter(tags=["health"])


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Service health",
    description=(
        "Reports liveness, database reachability and the active configuration. "
        "Returns **503** when the database cannot be reached, so a host's health "
        "check takes the instance out of rotation rather than serving errors."
    ),
    responses=UNAVAILABLE,
)
def health(
    db: DbSession,
    settings: Annotated[Settings, Depends(get_settings)],
    response: Response,
) -> HealthResponse:
    db_status = HealthService(db).database_status()
    if db_status == "down":
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return HealthResponse(
        status="ok" if db_status == "up" else "degraded",
        db=db_status,
        version=settings.app_version,
        ai_provider=settings.ai_provider,
    )
