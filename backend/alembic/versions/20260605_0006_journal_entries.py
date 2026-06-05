"""journal_entries — create table + missing indexes (backfill for create_all drift)

Revision ID: 20260605_0006
Revises: 20260605_0005
Create Date: 2026-06-05 00:00:00.000000

journal_entries was never in an Alembic revision — it was created entirely by
Base.metadata.create_all, and its notes + notified_outcome columns were added
via startup ALTER TABLE. This revision brings the full table (current shape)
into Alembic so create_all and the startup ALTERs can be removed.

Also adds two missing time-series indexes:
  - liquidations(symbol, timestamp DESC)
  - journal_entries(created_at DESC)

All statements are IF NOT EXISTS — safe on the live VPS where the table and
columns already exist.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260605_0006"
down_revision: Union[str, None] = "20260605_0005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Full table including all columns that were previously added via ALTER.
    op.execute("""
        CREATE TABLE IF NOT EXISTS journal_entries (
            id               SERIAL PRIMARY KEY,
            created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            symbol           VARCHAR(20)  NOT NULL,
            bias             VARCHAR(10)  NOT NULL,
            entry_low        FLOAT        NOT NULL,
            entry_high       FLOAT        NOT NULL,
            stop_loss        FLOAT        NOT NULL,
            take_profit1     FLOAT        NOT NULL,
            take_profit2     FLOAT        NOT NULL,
            take_profit3     FLOAT        NOT NULL,
            risk_reward      FLOAT        NOT NULL,
            reasoning        TEXT         NOT NULL,
            key_risks        TEXT         NOT NULL,
            scanner_bias     VARCHAR(10),
            notes            TEXT,
            notified_outcome VARCHAR(10)
        )
    """)

    # notes and notified_outcome may be missing on a DB where the table was
    # created by an older create_all before those columns were added.
    op.execute("""
        ALTER TABLE IF EXISTS journal_entries
        ADD COLUMN IF NOT EXISTS notes TEXT
    """)
    op.execute("""
        ALTER TABLE IF EXISTS journal_entries
        ADD COLUMN IF NOT EXISTS notified_outcome VARCHAR(10)
    """)

    # Missing indexes for high-frequency time-series queries.
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_liquidations_symbol_ts
        ON liquidations(symbol, timestamp DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_journal_entries_created_at
        ON journal_entries(created_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_journal_entries_created_at")
    op.execute("DROP INDEX IF EXISTS ix_liquidations_symbol_ts")
    op.execute("DROP TABLE IF EXISTS journal_entries CASCADE")
