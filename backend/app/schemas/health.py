"""Health response schema."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: Literal["ok", "degraded"] = Field(description="Overall service state.")
    version: str = Field(description="Deployed application version.")
    ai_provider: str = Field(description="Active summary/extraction provider.")
