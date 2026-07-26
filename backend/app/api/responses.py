"""Shared OpenAPI response declarations.

Exception handlers return `JSONResponse` directly, so FastAPI never sees the
error envelope and it does not appear in the generated schema. That was caught
by the TypeScript codegen in T-06: `components['schemas']['ErrorResponse']` did
not exist, so the frontend could not type the thing every failed request
returns.

Declaring the responses here puts `ErrorResponse` in `components/schemas` and
documents the real status codes on every operation — which is also what makes
`/docs` honest about what can go wrong.
"""

from __future__ import annotations

from typing import Any

from app.schemas.common import ErrorResponse

_ENVELOPE: dict[str, Any] = {"model": ErrorResponse}

#: Attach to any endpoint that takes a resource id.
NOT_FOUND: dict[int | str, dict[str, Any]] = {
    404: {**_ENVELOPE, "description": "No such resource."},
}

#: For meetings specifically — soft-deleted is a distinct, restorable state.
NOT_FOUND_OR_GONE: dict[int | str, dict[str, Any]] = {
    404: {**_ENVELOPE, "description": "No meeting with this id."},
    410: {**_ENVELOPE, "description": "Deleted, but restorable."},
}

VALIDATION: dict[int | str, dict[str, Any]] = {
    422: {**_ENVELOPE, "description": "Invalid payload; `details` is keyed by field path."},
}

RATE_LIMITED: dict[int | str, dict[str, Any]] = {
    429: {**_ENVELOPE, "description": "Rate limit exceeded."},
}

UNAVAILABLE: dict[int | str, dict[str, Any]] = {
    503: {**_ENVELOPE, "description": "A dependency is unavailable."},
}

#: Applied app-wide so every operation documents the catch-all.
DEFAULT: dict[int | str, dict[str, Any]] = {
    500: {**_ENVELOPE, "description": "Unexpected error. `details.request_id` correlates to logs."},
}
