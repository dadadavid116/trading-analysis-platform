"""Add settings_json column to users table (Phase 96)

Revision ID: 20260607_0016
Revises: 20260607_0015
"""

from alembic import op

revision = "20260607_0016"
down_revision = "20260607_0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS settings_json TEXT NOT NULL DEFAULT '{}'
    """)


def downgrade() -> None:
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS settings_json")
