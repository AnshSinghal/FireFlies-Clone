"""HTTP-level concerns: conditional requests (T-11.11).

Not business logic and not serialisation — the layer between them, where cache
validators live.
"""

from __future__ import annotations

import hashlib
from typing import TYPE_CHECKING

from fastapi import Response, status

if TYPE_CHECKING:
    from pydantic import BaseModel


class NotModified(Exception):
    """Raised to short-circuit a handler into a bodiless 304.

    An exception rather than a returned `Response`, because the handler's return
    type is the response model and FastAPI validates against it. Returning a
    bare `Response` from a typed handler works, but it makes the signature lie
    about what the endpoint can produce.
    """

    def __init__(self, etag: str) -> None:
        super().__init__("Not modified")
        self.etag = etag


def not_modified_response(exc: NotModified) -> Response:
    """A 304 carrying only the validator.

    Deliberately empty: RFC 9110 forbids a body on 304, and some clients treat
    one as a protocol error rather than ignoring it.
    """
    return Response(
        status_code=status.HTTP_304_NOT_MODIFIED,
        headers={"ETag": exc.etag, "Cache-Control": "no-cache"},
    )


def weak_etag(model: BaseModel) -> str:
    """A validator derived from the serialised response.

    WEAK (`W/`), which is the honest strength here: the digest is taken over
    the JSON Pydantic produces, so two byte-different-but-equivalent encodings
    would compare unequal. Weak comparison is all `If-None-Match` on a GET
    needs, and claiming strong equivalence we do not guarantee would be wrong.

    Digesting the BODY rather than tracking an `updated_at` high-water mark is
    the choice that cannot go stale: any change to any field of any row on the
    page changes the digest, including changes to the aggregates that no single
    row's timestamp covers.
    """
    payload = model.model_dump_json().encode()
    # sha256 truncated to 16 bytes: this is a cache validator, not a security
    # boundary, and a 32-char header is friendlier to read in a network panel.
    return f'W/"{hashlib.sha256(payload).hexdigest()[:32]}"'
