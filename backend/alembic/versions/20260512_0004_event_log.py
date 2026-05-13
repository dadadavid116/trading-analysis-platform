"""event_log — platform event log table for Operator Console

Revision ID: 20260512_0004
Revises: 20260505_0003
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "20260512_0004"
down_revision = "20260505_0003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "event_log",
        sa.Column("id",         sa.Integer,                  primary_key=True),
        sa.Column("timestamp",  sa.DateTime(timezone=True),  nullable=False,
                  server_default=sa.func.now()),
        sa.Column("service",    sa.String(30),               nullable=False),
        sa.Column("event_type", sa.String(50),               nullable=False),
        sa.Column("symbol",     sa.String(20)),
        sa.Column("message",    sa.Text,                     nullable=False),
        sa.Column("detail",     JSONB),
    )
    op.create_index("ix_event_log_timestamp", "event_log", ["timestamp"])


def downgrade() -> None:
    op.drop_index("ix_event_log_timestamp", table_name="event_log")
    op.drop_table("event_log")
