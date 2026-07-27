"""Rate limiting for the endpoints that cost money (T-04.10).

Only the AI routes are limited. Listing meetings is cheap and limiting it would
just make the app feel broken under a fast click; regenerating a summary calls a
model, and an accidental double-click should not double the bill.
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

from slowapi import Limiter
from slowapi.util import get_remote_address

from app.core.exceptions import RateLimitError

if TYPE_CHECKING:
    from fastapi import Request
    from starlette.responses import Response

#: The plan's budget for AI endpoints.
#:
#: Overridable by env because the limit is keyed on the CLIENT ADDRESS, and an
#: E2E run is one address: every Playwright worker is 127.0.0.1, so the whole
#: suite shares a single 10-per-minute allowance. Opening the soundbites flyout
#: fetches Magic Soundbite proposals, so a normal run spends that budget on
#: setup and T33-H — which asserts three proposals — starts 429ing for reasons
#: that have nothing to do with the code under test. Production keeps the
#: plan's number; only the E2E webServer raises it.
AI_RATE_LIMIT = os.getenv("AI_RATE_LIMIT", "10/minute")

#: In-memory storage is correct for a single-instance demo. A multi-instance
#: deployment needs a shared backend (Redis), or each instance enforces its own
#: allowance — noted here because it is the obvious follow-up question.
limiter = Limiter(key_func=get_remote_address, storage_uri="memory://")


def rate_limit_handler(request: Request, exc: Exception) -> Response:  # noqa: ARG001
    """Route slowapi's exception through OUR error envelope.

    Left alone, slowapi returns a bare `{"error": "Rate limit exceeded"}` — a
    different shape from every other error in the API, which the client would
    have to special-case.
    """
    raise RateLimitError() from exc
