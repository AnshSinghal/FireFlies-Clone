"""summary regeneration claim flag

Revision ID: 390a23c1d7f6
Revises: fb777cddacd4
Create Date: 2026-07-27

HAND-EDITED. Autogenerate additionally proposed dropping `transcript_fts` and
its five shadow tables, because they are FTS5 internals that no model declares
and Alembic therefore reads as "in the database but not in the metadata".

Applying that would have silently destroyed search on the next deploy. The
column below is the only intended change; `alembic/env.py` now filters those
tables out of autogenerate so the same proposal cannot be generated again
(ADR-049).
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "390a23c1d7f6"
down_revision: str | Sequence[str] | None = "fb777cddacd4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    with op.batch_alter_table("summaries") as batch_op:
        batch_op.add_column(
            sa.Column(
                "is_generating",
                sa.Boolean(),
                nullable=False,
                # Existing rows are not mid-generation.
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("summaries") as batch_op:
        batch_op.drop_column("is_generating")
