"""Alembic environment.

Two things here are load-bearing for SQLite:

1. `render_as_batch=True`. SQLite cannot ALTER a column or drop a constraint, so
   Alembic emulates it by creating a new table, copying rows and swapping —
   "batch mode". Without this flag any migration beyond a plain CREATE/DROP
   fails at runtime, usually long after it was written. Batch mode also needs
   named constraints, which is why db/base.py sets a naming convention.

2. The URL comes from application settings rather than alembic.ini, so
   migrations always target the same database the app does, including inside
   Docker where the path differs.
"""

from __future__ import annotations

from logging.config import fileConfig

from sqlalchemy import engine_from_config, pool

# Importing the models package registers every mapper on the metadata.
# Autogenerate compares against this; a partial import would emit a migration
# that drops whatever it could not see.
import app.models  # noqa: F401
from alembic import context
from app.core.config import get_settings
from app.models import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata

# Fall back to application settings, but do NOT clobber a URL the caller already
# supplied. Tests build a throwaway database by setting it programmatically, and
# an unconditional overwrite here silently pointed them at the app's database
# instead — which surfaced as "the migration produced no file".
if not config.get_main_option("sqlalchemy.url", None):
    config.set_main_option("sqlalchemy.url", get_settings().database_url)


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live connection."""
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        include_object=include_object,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=True,
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


#: FTS5 creates shadow tables (`_data`, `_idx`, `_docsize`, `_config`,
#: `_content`) alongside the virtual table itself. No model declares any of
#: them, so autogenerate sees six tables "in the database but not in the
#: metadata" and proposes DROPPING them — which would silently destroy search
#: on the next deploy. It did exactly that when the T-17 migration was
#: generated (ADR-049).
FTS_TABLE_PREFIX = "transcript_fts"


def include_object(
    obj: object,  # noqa: ARG001
    name: str | None,
    type_: str,
    reflected: bool,  # noqa: ARG001
    compare_to: object,  # noqa: ARG001
) -> bool:
    """Keep FTS5's tables out of autogenerate entirely.

    They are created and maintained by a hand-written migration and by
    triggers; Alembic has no model to compare them against and cannot produce a
    correct diff for them.
    """
    return not (type_ == "table" and name is not None and name.startswith(FTS_TABLE_PREFIX))


def run_migrations_online() -> None:
    """Run migrations against a live connection."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            render_as_batch=True,
            # Catch a column whose type drifted from the model, not just
            # columns added and removed.
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
