"""alerts — add webhook_url column (backfill for startup ALTER drift)

Revision ID: 20260605_0005
Revises: 20260512_0004
Create Date: 2026-06-05 00:00:00.000000

webhook_url was added via a startup ALTER TABLE in main.py (Phase 67).
This revision brings it into Alembic so the startup ALTER can be removed.
Uses ADD COLUMN IF NOT EXISTS — safe no-op on the live VPS where the column
already exists.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260605_0005"
down_revision: Union[str, None] = "20260512_0004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE IF EXISTS alerts
        ADD COLUMN IF NOT EXISTS webhook_url VARCHAR(500)
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE IF EXISTS alerts DROP COLUMN IF EXISTS webhook_url")
