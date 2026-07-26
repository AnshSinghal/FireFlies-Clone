"""Database package.

`session` is imported here deliberately, and the import is load-bearing.

The SQLite pragmas in `session.py` — above all `foreign_keys=ON` — are installed
by an `@event.listens_for(Engine, "connect")` hook that only registers when that
module is imported. Nothing else forced the import, so foreign keys were silently
OFF: every `ondelete="CASCADE"` did nothing, and orphan rows would have
accumulated with no error anywhere. It surfaced only because
tests/test_schema.py asserts the pragma value directly.

Importing it here means that touching `app.db` at all installs the pragmas.
"""

from __future__ import annotations

from app.db import session as _session  # noqa: F401

__all__: list[str] = []
