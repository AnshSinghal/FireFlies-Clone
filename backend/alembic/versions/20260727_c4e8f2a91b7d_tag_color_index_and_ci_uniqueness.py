"""tag color_index and case-insensitive uniqueness

Revision ID: c4e8f2a91b7d
Revises: 0fcabb502322
Create Date: 2026-07-27

Two changes to `tags` for T-36:

1. `color` (stringified palette index, NOT NULL '0') becomes `color_index`
   (nullable INTEGER). Null is now meaningful — "derive the colour from the
   name via the speaker-colour hash" — so a freshly created tag is coloured
   client-side with no server round trip, while an explicit recolour in
   settings persists a real index that survives renames (T-36.6). Existing
   values are CAST across, so seeded tags keep their colours.

2. A UNIQUE functional index over `lower(name)`. SQLite's default BINARY
   collation means the existing `uq_tags_name` accepts "Sales" alongside
   "sales" — exactly the mess T-36.10 forbids. The index enforces the rule in
   the database; the service performs the same check first so the failure is
   a 409 naming the existing tag rather than an IntegrityError.

The index is created AFTER the batch rebuild (and dropped BEFORE the reverse
one): batch mode reconstructs the table from reflection, and an expression
index does not reliably survive that round trip.
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "c4e8f2a91b7d"
down_revision: str | Sequence[str] | None = "0fcabb502322"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """color -> nullable color_index; add the lower(name) unique index."""
    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.add_column(sa.Column("color_index", sa.Integer(), nullable=True))

    # Seeded values are stringified palette indices ("0".."7"); CAST preserves
    # them. Anything unparseable would become 0, which SQLite's CAST defines.
    op.execute("UPDATE tags SET color_index = CAST(color AS INTEGER)")

    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.drop_column("color")

    op.create_index("uq_tags_name_lower", "tags", [sa.text("lower(name)")], unique=True)


def downgrade() -> None:
    """Reverse both, restoring the old NOT NULL string column."""
    op.drop_index("uq_tags_name_lower", table_name="tags")

    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("color", sa.String(length=20), nullable=False, server_default="0")
        )

    op.execute("UPDATE tags SET color = CAST(color_index AS TEXT) WHERE color_index IS NOT NULL")

    with op.batch_alter_table("tags", schema=None) as batch_op:
        batch_op.drop_column("color_index")
