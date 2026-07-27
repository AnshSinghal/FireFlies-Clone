"""Migrations run clean in both directions (T-43.11, case T43-G).

Every other test copies a template built by `upgrade head`, so the upgrade
path is exercised constantly — but nothing exercised `downgrade`, and a
broken downgrade is exactly the kind of bug found the day it is needed.
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from alembic.config import Config
from sqlalchemy import create_engine, inspect

from alembic import command
from tests.conftest import BACKEND_DIR

if TYPE_CHECKING:
    from pathlib import Path


def _config_for(db_path: Path) -> Config:
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    config.set_main_option("sqlalchemy.url", f"sqlite:///{db_path}")
    return config


def test_t43_g_migrations_round_trip(tmp_path: Path) -> None:
    db_path = tmp_path / "roundtrip.sqlite"
    config = _config_for(db_path)

    command.upgrade(config, "head")

    engine = create_engine(f"sqlite:///{db_path}")
    try:
        upgraded = set(inspect(engine).get_table_names())
        assert "meetings" in upgraded
        assert "transcript_segments" in upgraded

        command.downgrade(config, "base")

        remaining = set(inspect(engine).get_table_names())
        # Base means BASE: only Alembic's own bookkeeping may survive. A
        # leftover table is a migration whose downgrade forgot something.
        assert remaining <= {"alembic_version"}, f"leftover tables: {remaining}"

        # And the trip is repeatable — a downgrade that leaves debris breaks
        # the next upgrade, which is how it would actually be used.
        command.upgrade(config, "head")
        assert "meetings" in set(inspect(engine).get_table_names())
    finally:
        engine.dispose()
