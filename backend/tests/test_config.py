"""Settings parsing.

These exist because of a real failure: `CORS_ORIGINS=http://localhost:3100` in
the environment crashed the app at import time. pydantic-settings JSON-decodes
complex field types in the env source before validators run, so a plain
comma-separated string — the form docker-compose and .env.example both use — is
invalid JSON and raises. The fix is `NoDecode`; these tests keep it in place.
"""

from __future__ import annotations

import pytest

from app.core.config import Settings


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("http://localhost:3000", ["http://localhost:3000"]),
        (
            "http://localhost:3000,http://localhost:3100",
            ["http://localhost:3000", "http://localhost:3100"],
        ),
        # Humans put spaces after commas.
        (
            "http://a.test, http://b.test",
            ["http://a.test", "http://b.test"],
        ),
        ("", []),
    ],
)
def test_cors_origins_parses_comma_separated_env(
    monkeypatch: pytest.MonkeyPatch, raw: str, expected: list[str]
) -> None:
    monkeypatch.setenv("CORS_ORIGINS", raw)

    assert Settings().cors_origins == expected


def test_cors_origins_accepts_a_real_list() -> None:
    """Direct construction (as in tests and create_app) must still work."""
    assert Settings(cors_origins=["http://x.test"]).cors_origins == ["http://x.test"]


def test_defaults_are_safe_for_a_fresh_clone() -> None:
    settings = Settings()

    assert settings.ai_provider == "mock", "the demo must never depend on an API key"
    assert settings.max_upload_mb == 10
    assert settings.max_upload_bytes == 10 * 1024 * 1024


def test_ai_provider_rejects_an_unknown_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "definitely-not-a-provider")

    with pytest.raises(ValueError):
        Settings()
