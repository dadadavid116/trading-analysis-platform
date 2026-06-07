"""kill_switch_active column on account_config (Phase 87)

Revision ID: 20260607_0012
Revises: 20260607_0011
"""

from alembic import op

revision = "20260607_0012"
down_revision = "20260607_0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE account_config
        ADD COLUMN IF NOT EXISTS kill_switch_active BOOLEAN NOT NULL DEFAULT FALSE
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE account_config DROP COLUMN IF EXISTS kill_switch_active")
