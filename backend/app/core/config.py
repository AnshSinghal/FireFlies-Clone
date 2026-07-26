"""Application settings.

Every environment variable the backend reads is declared here and nowhere else.
Modules take a `Settings` instance rather than reaching for `os.environ`, so the
configuration surface is a single readable object and tests can override it.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The canonical .env lives at the repo root, one level above backend/, so a
# single file configures both apps. Under Docker there is no file at all and the
# values arrive as real environment variables.
_REPO_ROOT_ENV = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_REPO_ROOT_ENV, ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── Database ────────────────────────────────────────────────────────────
    database_url: str = "sqlite:///./fireflies.db"

    # ── HTTP ────────────────────────────────────────────────────────────────
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:3000"])

    # ── AI ──────────────────────────────────────────────────────────────────
    ai_provider: Literal["mock", "openai", "anthropic"] = "mock"
    ai_api_key: str = ""

    # ── Uploads & media ─────────────────────────────────────────────────────
    media_dir: Path = Path("./media")
    max_upload_mb: int = 10

    # ── Seeding ─────────────────────────────────────────────────────────────
    # Anchors relative seed dates so "Today"/"Yesterday" assertions stay true on
    # any calendar day. Must match the clock Playwright pins in T-39.6.
    seed_anchor_date: str = ""

    app_version: str = "0.1.0"

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept `a,b,c` from the environment as well as a real list."""
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    """Cached accessor. Override this dependency in tests, don't mutate the env."""
    return Settings()
