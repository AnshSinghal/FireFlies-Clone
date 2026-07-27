"""Application exceptions.

Services raise these. Routers never write `raise HTTPException` — one place
(`core/errors.py`) decides what each failure means in HTTP terms.

The point is that a service is callable from somewhere that is not a request:
the seeder, a CLI, a background job, another service. A `MeetingService` that
raises `HTTPException` has hard-coded an assumption about its caller, and
becomes untestable without a request context.
"""

from __future__ import annotations

from typing import Any


class AppException(Exception):
    """Base for every expected failure.

    `code` is a stable, machine-readable identifier the frontend can branch on —
    unlike a message, which is for humans and will be reworded.
    """

    status_code: int = 500
    code: str = "INTERNAL_ERROR"
    message: str = "Something went wrong."

    def __init__(
        self,
        message: str | None = None,
        *,
        code: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.message = message or self.message
        self.code = code or self.code
        self.details = details or {}
        super().__init__(self.message)


class NotFoundError(AppException):
    status_code = 404
    code = "NOT_FOUND"
    message = "The requested resource does not exist."


class MeetingNotFoundError(NotFoundError):
    code = "MEETING_NOT_FOUND"
    message = "Meeting not found."


class ActionItemNotFoundError(NotFoundError):
    code = "ACTION_ITEM_NOT_FOUND"


class SegmentNotFoundError(NotFoundError):
    code = "SEGMENT_NOT_FOUND"


class SpeakerNotFoundError(NotFoundError):
    code = "SPEAKER_NOT_FOUND"


class MediaNotFoundError(NotFoundError):
    code = "MEDIA_NOT_FOUND"


class GoneError(AppException):
    """410, not 404.

    A soft-deleted meeting is a materially different answer from one that never
    existed: it is restorable, and the client can offer that. Collapsing both
    into 404 throws away information the UI needs (T-17.12).
    """

    status_code = 410
    code = "GONE"
    message = "This resource has been deleted."


class MeetingDeletedError(GoneError):
    code = "MEETING_DELETED"
    message = "This meeting was deleted. It can be restored."


class BadRequestError(AppException):
    """A syntactically valid request the server will not act on.

    Distinct from 422: FastAPI raises that when a value fails to PARSE, while
    this is for a value that parsed fine and is still not allowed — an unknown
    sort key, say. Collapsing the two would leave the client unable to tell
    "you sent a string where I wanted an int" from "that is not a column".
    """

    status_code = 400
    code = "BAD_REQUEST"


class InvalidSortError(BadRequestError):
    code = "INVALID_SORT"


class AssigneeNotInMeetingError(BadRequestError):
    """An action item assigned to somebody who was not in the meeting.

    The database cannot express this — it would need a composite FK against
    `(meeting_id, id)` on participants, and a composite unique key there purely
    to satisfy it (see the note on `ActionItem.assignee_participant_id`). So the
    invariant lives in the service, and this is what it raises.
    """

    code = "ASSIGNEE_NOT_IN_MEETING"
    message = "That person is not a participant in this meeting."


class ValidationError(AppException):
    status_code = 422
    code = "VALIDATION_ERROR"
    message = "The request payload is invalid."


class ConflictError(AppException):
    status_code = 409
    code = "CONFLICT"
    message = "The request conflicts with the current state."


class RateLimitError(AppException):
    status_code = 429
    code = "RATE_LIMITED"
    message = "You're going faster than we can keep up. Try again in a moment."


class ServiceUnavailableError(AppException):
    status_code = 503
    code = "SERVICE_UNAVAILABLE"
    message = "A dependency is unavailable."
