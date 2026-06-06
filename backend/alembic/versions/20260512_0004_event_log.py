"""event_log — platform event log table for Operator Console

Revision ID: 20260512_0004
Revises: 20260505_0003
"""

from alembic import op

revision = "20260512_0004"
down_revision = "20260505_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS — safe on the live VPS where this table may already exist.
    op.execute("""
        CREATE TABLE IF NOT EXISTS event_log (
            id         SERIAL       PRIMARY KEY,
            timestamp  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            service    VARCHAR(30)  NOT NULL,
            event_type VARCHAR(50)  NOT NULL,
            symbol     VARCHAR(20),
            message    TEXT         NOT NULL,
            detail     JSONB
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_event_log_timestamp
        ON event_log(timestamp)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_event_log_timestamp")
    op.execute("DROP TABLE IF EXISTS event_log CASCADE")
