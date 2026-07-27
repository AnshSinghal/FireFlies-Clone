"""Response caching and cost guards (T-29.10, T-29.8).

Identical input never re-bills: the cache key is a hash of the transcript
text, the prompt versions, and the provider identity, so a repeated
regeneration is served from memory — which also makes the demo instant on
repeat.

Process-local by design, not a table. A cache row in SQLite would survive
restarts, but it would also need a migration, eviction policy, and cleanup
job — for a guard whose worst-case miss costs one extra provider call. If the
LLM path ever carries real traffic, this interface swaps to Redis without the
callers changing. Logged in docs/decisions.md.
"""

from __future__ import annotations

import copy
import hashlib
import threading
from collections import Counter, OrderedDict
from typing import Any


def response_key(*parts: str) -> str:
    """Stable key over transcript text + prompt versions + provider identity.

    Every part is length-prefixed before hashing so ("ab", "c") and
    ("a", "bc") cannot collide.
    """
    digest = hashlib.sha256()
    for part in parts:
        encoded = part.encode("utf-8")
        digest.update(str(len(encoded)).encode("ascii"))
        digest.update(b":")
        digest.update(encoded)
    return digest.hexdigest()


class ResponseCache:
    """A small thread-safe LRU over provider results — pydantic models or
    lists of them. FastAPI serves sync endpoints from a threadpool, so the
    lock is not optional."""

    def __init__(self, maxsize: int = 256) -> None:
        self._maxsize = maxsize
        self._entries: OrderedDict[str, Any] = OrderedDict()
        self._lock = threading.Lock()

    def get(self, key: str) -> Any | None:
        with self._lock:
            value = self._entries.get(key)
            if value is not None:
                self._entries.move_to_end(key)
                # A deep copy per hit: cached results are mutable, and handing
                # out the shared instance would let one request's edit
                # silently poison every later hit.
                return copy.deepcopy(value)
            return None

    def put(self, key: str, value: Any) -> None:
        with self._lock:
            self._entries[key] = copy.deepcopy(value)
            self._entries.move_to_end(key)
            while len(self._entries) > self._maxsize:
                self._entries.popitem(last=False)


class GenerationLimitExceeded(RuntimeError):
    """Raised when one meeting has been regenerated past the cost cap."""


class GenerationCounter:
    """Per-meeting generation counter (T-29.8's cost guard).

    The slowapi limit on the route stops double-clicks; this stops a patient
    caller from burning 200 paid generations on one meeting over an afternoon.
    Enforced only when a paid provider is active — the mock is free.
    """

    def __init__(self, limit: int = 25) -> None:
        self._limit = limit
        self._counts: Counter[int] = Counter()
        self._lock = threading.Lock()

    def bump(self, meeting_id: int) -> None:
        with self._lock:
            if self._counts[meeting_id] >= self._limit:
                raise GenerationLimitExceeded(
                    f"Meeting {meeting_id} has hit the {self._limit}-generation cost cap"
                )
            self._counts[meeting_id] += 1
