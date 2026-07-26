"""Exception handlers — the single place that maps failures to HTTP.

Registered on the app in `main.create_app`. Together these guarantee that every
non-2xx response in the API has the same body shape, which is what lets the
frontend's fetch wrapper (T-06.4) parse errors in exactly one place.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import FastAPI, Request, Response, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.exceptions import AppException
from app.core.http import NotModified, not_modified_response
from app.schemas.common import ErrorDetail, ErrorResponse

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)


def _envelope(
    status_code: int, code: str, message: str, details: dict[str, object] | None = None
) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message, details=details or {}))
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


def _field_path(location: Sequence[str | int]) -> str:
    """Turn pydantic's ('body', 'participants', 0, 'email') into a dotted path.

    The leading 'body'/'query' marker is dropped: the client knows where it put
    the value, and `participants.0.email` is what a form library needs to key
    the message to an input.
    """
    parts = [str(part) for part in location if part not in {"body", "query", "path"}]
    return ".".join(parts) or "__root__"


async def app_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, AppException)
    # Expected failures. Logged at INFO because a 404 is not an incident.
    logger.info(
        "handled %s on %s %s", exc.code, request.method, request.url.path, extra={"code": exc.code}
    )
    return _envelope(exc.status_code, exc.code, exc.message, exc.details)


async def validation_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """422 with field paths (test T04-B).

    FastAPI's default returns a bare `{"detail": [...]}` list, which the client
    would have to special-case. Reshaping it into the standard envelope, with
    errors keyed by field path, means one parsing path for every failure.
    """
    assert isinstance(exc, RequestValidationError)
    details: dict[str, object] = {}
    for error in exc.errors():
        details[_field_path(error["loc"])] = error["msg"]

    return _envelope(
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "VALIDATION_ERROR",
        "The request payload is invalid.",
        details,
    )


async def http_exception_handler(_request: Request, exc: Exception) -> JSONResponse:
    """Catches HTTPExceptions raised by FastAPI itself — 404 on an unknown route,
    405 on a wrong method — so even those keep the envelope."""
    assert isinstance(exc, StarletteHTTPException)
    code = {
        status.HTTP_404_NOT_FOUND: "NOT_FOUND",
        status.HTTP_405_METHOD_NOT_ALLOWED: "METHOD_NOT_ALLOWED",
    }.get(exc.status_code, "HTTP_ERROR")
    return _envelope(exc.status_code, code, str(exc.detail))


async def unhandled_exception_handler(request: Request, _exc: Exception) -> JSONResponse:
    """The catch-all (test T04-F).

    Logs the full traceback server-side and returns a generic message. Leaking a
    stack trace to the client exposes file paths, library versions and table
    names; the request id in the response is how a report gets correlated to the
    log line instead.
    """
    request_id = getattr(request.state, "request_id", None)
    logger.exception(
        "unhandled error on %s %s",
        request.method,
        request.url.path,
        extra={"request_id": request_id},
    )
    return _envelope(
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "INTERNAL_ERROR",
        "Something went wrong on our end.",
        {"request_id": request_id} if request_id else {},
    )


async def not_modified_handler(_request: Request, exc: Exception) -> Response:
    """304 for a conditional GET whose ETag still matches (T-11.11)."""
    assert isinstance(exc, NotModified)
    return not_modified_response(exc)


def register_exception_handlers(app: FastAPI) -> None:
    # Registered BEFORE the catch-all `Exception` handler below, and as its own
    # type, so a 304 is never swallowed into a 500.
    app.add_exception_handler(NotModified, not_modified_handler)
    app.add_exception_handler(AppException, app_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
