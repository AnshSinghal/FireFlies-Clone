"""Envelopes shared by every endpoint.

Two shapes, used consistently: one for a page of results, one for an error.
Consistency here is most of what makes an API feel designed rather than grown —
a client writes the unwrapping code once.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, computed_field

#: Clamped, not rejected (T-04.5 / test T04-C). A client asking for 500 items
#: has made a reasonable request we simply will not serve in full; answering
#: with 100 is more useful than a 422 telling them to ask again.
MAX_PAGE_SIZE = 100
DEFAULT_PAGE_SIZE = 20


class Page[T](BaseModel):
    """The response shape for every list endpoint."""

    items: list[T]
    page: int = Field(ge=1, description="1-indexed page number.")
    page_size: int = Field(ge=1, le=MAX_PAGE_SIZE)
    total: int = Field(ge=0, description="Total matching rows, ignoring pagination.")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def total_pages(self) -> int:
        if self.page_size <= 0:
            return 0
        return -(-self.total // self.page_size)  # ceiling division

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_next(self) -> bool:
        return self.page < self.total_pages

    @classmethod
    def build(cls, items: list[T], *, page: int, page_size: int, total: int) -> Page[T]:
        return cls(items=items, page=page, page_size=page_size, total=total)


class ErrorDetail(BaseModel):
    code: str = Field(description="Stable machine-readable identifier; safe to branch on.")
    message: str = Field(description="Human-readable explanation. Wording may change.")
    details: dict[str, Any] = Field(
        default_factory=dict,
        description="Field-level errors, keyed by dotted path, when applicable.",
    )


class ErrorResponse(BaseModel):
    """Every non-2xx response body in the API has this shape.

    Nested under a single `error` key rather than flattened, so a client can
    tell an error from a successful payload without inspecting the status code —
    which matters for the fetch wrapper in T-06.4.
    """

    error: ErrorDetail
