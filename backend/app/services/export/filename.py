"""Download filename sanitisation (T-34.11).

A meeting title goes into a `Content-Disposition` header and then onto the
user's disk, so it must never carry path separators, `..`, control characters
or anything else a filesystem could interpret. Slugifying to `[a-z0-9-]` is a
whitelist rather than a blocklist: everything unsafe is impossible by
construction, including the emoji case the spec calls out.
"""

from __future__ import annotations

import re
import unicodedata
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from datetime import date

#: The whole filename — slug, date and extension — stays within this.
MAX_FILENAME = 100

#: What a title with no usable characters (all emoji, say) falls back to.
#: The spec's do-not-ship list bans a filename of `download` or `export.pdf`;
#: `meeting-<date>.<ext>` at least says what the file is.
FALLBACK_SLUG = "meeting"


def slugify(title: str) -> str:
    """`'Q3 / Roadmap ../etc'` → `'q3-roadmap-etc'`.

    NFKD-normalise then drop non-ASCII, so accented letters keep their base
    form (`é` → `e`) while emoji vanish entirely. Every remaining run of
    non-alphanumerics — spaces, slashes, dots — collapses to one hyphen, which
    is also what "collapse whitespace" means once whitespace is just another
    unsafe character.
    """
    value = unicodedata.normalize("NFKD", title)
    value = value.encode("ascii", "ignore").decode("ascii").lower()
    value = re.sub(r"[^a-z0-9]+", "-", value).strip("-")
    return value or FALLBACK_SLUG


def export_filename(title: str, day: date, extension: str) -> str:
    """`q3-roadmap-sync-2026-07-24.pdf` — slug of the title + meeting date.

    The slug is trimmed so the WHOLE name stays under `MAX_FILENAME`; capping
    the slug alone would let a long extension push the total over.
    """
    suffix = f"-{day.isoformat()}.{extension}"
    slug = slugify(title)[: MAX_FILENAME - len(suffix)].rstrip("-")
    return f"{slug or FALLBACK_SLUG}{suffix}"
