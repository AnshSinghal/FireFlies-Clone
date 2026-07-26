"""transcript fts5 index

Hand-written, because Alembic's autogenerate does not model virtual tables or
triggers — it would silently drop both on the next revision if they were created
any other way.

This is what makes T-35 real ranked search instead of `LIKE '%term%'` over every
segment in the database.

Revision ID: fb777cddacd4
Revises: 7166b3ec3ab0
Create Date: 2026-07-26

"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "fb777cddacd4"
down_revision: str | Sequence[str] | None = "7166b3ec3ab0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# The FTS rowid is deliberately the segment's own id.
#
# FTS5 supports no secondary indexes, so `DELETE FROM transcript_fts WHERE
# segment_id = ?` would scan the whole index. Aliasing rowid to the segment id
# makes deletes and updates O(1) lookups. `meeting_id` and `segment_id` are
# still stored UNINDEXED so a hit can be resolved without joining back.
#
# Porter stemming means a search for "pricing" also matches "priced" and
# "price" — the behaviour a user expects from a transcript search, and the
# reason this beats LIKE on quality as well as speed.
CREATE_FTS = """
CREATE VIRTUAL TABLE transcript_fts USING fts5(
    text,
    meeting_id UNINDEXED,
    segment_id UNINDEXED,
    tokenize = 'porter unicode61'
)
"""

TRIGGERS = (
    """
    CREATE TRIGGER transcript_segments_ai AFTER INSERT ON transcript_segments BEGIN
        INSERT INTO transcript_fts(rowid, text, meeting_id, segment_id)
        VALUES (new.id, new.text, new.meeting_id, new.id);
    END
    """,
    # Fires on ANY update, not just of `text`. SQLite supports `UPDATE OF text`,
    # but scoping it that way would leave a stale meeting_id in the index if a
    # segment were ever reassigned to another meeting.
    """
    CREATE TRIGGER transcript_segments_au AFTER UPDATE ON transcript_segments BEGIN
        DELETE FROM transcript_fts WHERE rowid = old.id;
        INSERT INTO transcript_fts(rowid, text, meeting_id, segment_id)
        VALUES (new.id, new.text, new.meeting_id, new.id);
    END
    """,
    """
    CREATE TRIGGER transcript_segments_ad AFTER DELETE ON transcript_segments BEGIN
        DELETE FROM transcript_fts WHERE rowid = old.id;
    END
    """,
)

TRIGGER_NAMES = (
    "transcript_segments_ai",
    "transcript_segments_au",
    "transcript_segments_ad",
)


def upgrade() -> None:
    op.execute(CREATE_FTS)
    for statement in TRIGGERS:
        op.execute(statement)

    # Backfill, so this migration is correct whether it runs against an empty
    # database or one that already holds transcripts.
    op.execute(
        """
        INSERT INTO transcript_fts(rowid, text, meeting_id, segment_id)
        SELECT id, text, meeting_id, id FROM transcript_segments
        """
    )


def downgrade() -> None:
    # Triggers first. Dropping the table out from under them leaves triggers
    # referencing something that no longer exists, and the next INSERT into
    # transcript_segments fails with a confusing error.
    for name in TRIGGER_NAMES:
        op.execute(f"DROP TRIGGER IF EXISTS {name}")
    op.execute("DROP TABLE IF EXISTS transcript_fts")
