"""Declarative base and shared column mixins."""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, MetaData, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

# Every constraint gets a deterministic name.
#
# SQLite cannot ALTER COLUMN, so Alembic alters a table by recreating it in
# "batch mode" — which requires naming the constraints it must recreate. With
# anonymous constraints, migrations generate but fail to downgrade, and the
# failure surfaces months later when someone needs to roll back. Cheap now,
# painful to retrofit.
NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)


class TimestampMixin:
    """`created_at` / `updated_at` maintained by the database (T-03.11).

    Both are server-side: `server_default` and `onupdate` mean a row written by
    a migration, a raw SQL fixture or the seeder gets correct timestamps without
    the writer remembering. Stored UTC; converted at the presentation edge.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class SoftDeleteMixin:
    """`deleted_at` marker for restorable deletes (T-03.6).

    Nullable timestamp rather than a boolean, because "when" answers questions a
    flag cannot — how long an undo window has left, what to purge.

    Reading is the dangerous half: a query that forgets the filter leaks deleted
    rows. Use the model's `not_deleted()` helper rather than hand-writing
    `WHERE deleted_at IS NULL` at each call site.
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        index=True,
    )

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None
