"""Media streaming with HTTP Range support (T-17.9).

Without ranges, `<audio>` and `<video>` can still PLAY a file — the browser
downloads it and starts — but SEEKING silently fails: dragging the scrubber
either jumps back to where it was or restarts the download from zero. There is
no error anywhere. The player just feels broken.

That makes this the single most-missed backend detail in this assignment, and
the reason it gets its own module with its own tests.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from pathlib import Path

#: How much to send per range request when the client asks for "the rest".
#: A whole 3MB file per seek defeats the point; 1MB is a few seconds of audio.
CHUNK_SIZE = 1024 * 1024

_RANGE_RE = re.compile(r"^bytes=(\d*)-(\d*)$")


@dataclass(frozen=True, slots=True)
class ByteRange:
    """A resolved, inclusive byte range within a file of known size."""

    start: int
    end: int
    size: int

    @property
    def length(self) -> int:
        # INCLUSIVE at both ends, per RFC 9110 — `bytes=0-0` is one byte. The
        # off-by-one here is the classic range bug, and it manifests as audio
        # that is subtly corrupted rather than as an error.
        return self.end - self.start + 1

    @property
    def content_range(self) -> str:
        return f"bytes {self.start}-{self.end}/{self.size}"


class RangeNotSatisfiable(Exception):
    """The client asked for bytes that do not exist (RFC 9110 §15.5.17 → 416)."""

    def __init__(self, size: int) -> None:
        super().__init__("Requested range not satisfiable")
        self.size = size


def parse_range(header: str | None, size: int, *, chunk: int = CHUNK_SIZE) -> ByteRange | None:
    """Resolve a `Range` header against a file of `size` bytes.

    Returns `None` when there is no range to honour, which the caller answers
    with a plain 200. Only `bytes=` with a single range is supported —
    multipart ranges exist in the spec, no browser media element sends them,
    and implementing them unused would be code that is never exercised.
    """
    if not header:
        return None

    match = _RANGE_RE.match(header.strip())
    if not match:
        # A malformed Range MUST be ignored rather than rejected, so a client
        # sending nonsense still gets its file.
        return None

    raw_start, raw_end = match.groups()

    if not raw_start and not raw_end:
        return None

    if not raw_start:
        # A SUFFIX range: `bytes=-500` means the LAST 500 bytes, not "from 0
        # to 500". Reading it the obvious way returns the wrong end of the file.
        suffix = int(raw_end)
        if suffix <= 0:
            raise RangeNotSatisfiable(size)
        start = max(0, size - suffix)
        end = size - 1
    else:
        start = int(raw_start)
        if start >= size:
            raise RangeNotSatisfiable(size)
        # An open-ended range (`bytes=1000-`) is capped at a chunk rather than
        # served whole: browsers open one to start playback and then seek, and
        # sending 3MB each time defeats the point of ranges entirely.
        end = int(raw_end) if raw_end else min(start + chunk - 1, size - 1)
        end = min(end, size - 1)

    if start > end:
        raise RangeNotSatisfiable(size)

    return ByteRange(start=start, end=end, size=size)


def read_range(path: Path, byte_range: ByteRange) -> bytes:
    """Read exactly the requested bytes.

    Read in one go rather than streamed: the sample file is 3MB and a chunk is
    at most 1MB. A production build serving hour-long recordings would stream
    this — the seam is here, and the callers do not change.
    """
    with path.open("rb") as handle:
        handle.seek(byte_range.start)
        return handle.read(byte_range.length)
