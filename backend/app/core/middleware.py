"""Request-ID stamping and structured access logging (T-04.9)."""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import TYPE_CHECKING

from starlette.middleware.base import BaseHTTPMiddleware

if TYPE_CHECKING:
    from collections.abc import Awaitable, Callable

    from starlette.requests import Request
    from starlette.responses import Response

logger = logging.getLogger("app.access")

REQUEST_ID_HEADER = "X-Request-ID"


class RequestContextMiddleware(BaseHTTPMiddleware):
    """Attaches a request id and logs one structured line per request.

    The id is echoed in the response header and included in the body of any 500,
    so a user reporting "it broke" hands over a token that finds the exact log
    line. An inbound `X-Request-ID` is honoured rather than replaced, so a trace
    survives across a proxy or a frontend that already generates one.

    JSON rather than a formatted string because these are meant to be queried in
    a host's log viewer, where grepping a human-readable line stops working the
    moment a path contains a space.
    """

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        request_id = request.headers.get(REQUEST_ID_HEADER) or uuid.uuid4().hex
        request.state.request_id = request_id

        started = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            # Still emit a line for a request that blew up — otherwise the only
            # trace of the worst requests is the traceback, with no timing.
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            logger.error(
                json.dumps(
                    {
                        "method": request.method,
                        "path": request.url.path,
                        "status": 500,
                        "duration_ms": duration_ms,
                        "request_id": request_id,
                    }
                )
            )
            raise

        duration_ms = round((time.perf_counter() - started) * 1000, 2)
        response.headers[REQUEST_ID_HEADER] = request_id

        logger.info(
            json.dumps(
                {
                    "method": request.method,
                    "path": request.url.path,
                    "status": response.status_code,
                    "duration_ms": duration_ms,
                    "request_id": request_id,
                }
            )
        )
        return response
