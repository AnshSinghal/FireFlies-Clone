"""Health checks.

The `SELECT 1` lives here rather than in the router because the layering rule is
absolute: routers do not touch the database, and a health endpoint is not a
special case. `scripts/check_layering.py` caught the first attempt, which had
`from sqlalchemy import text` sitting in the router.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING, Literal

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class HealthService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def database_status(self) -> Literal["up", "down"]:
        """Actually query, rather than reporting that the process is running.

        This is the case that matters: a container whose volume failed to mount
        answers HTTP perfectly well while every real request 500s. A health check
        that cannot fail tells the host nothing.
        """
        try:
            self.db.execute(text("SELECT 1"))
        except SQLAlchemyError:
            logger.exception("health check: database unreachable")
            return "down"
        return "up"
