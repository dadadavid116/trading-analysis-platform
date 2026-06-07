"""Live mode gate + live_orders table (Phase 97)

Revision ID: 20260607_0017
Revises: 20260607_0016
"""

from alembic import op

revision = "20260607_0017"
down_revision = "20260607_0016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add live mode flag to the account config row
    op.execute("""
        ALTER TABLE account_config
        ADD COLUMN IF NOT EXISTS live_mode_enabled BOOLEAN NOT NULL DEFAULT FALSE
    """)

    # Live orders — real exchange orders placed via OKX API
    op.execute("""
        CREATE TABLE IF NOT EXISTS live_orders (
            id           SERIAL PRIMARY KEY,
            symbol       VARCHAR(20)  NOT NULL,
            direction    VARCHAR(10)  NOT NULL,
            order_type   VARCHAR(20)  NOT NULL DEFAULT 'limit',
            size_usd     FLOAT        NOT NULL,
            entry_price  FLOAT,
            stop_loss    FLOAT,
            tp1          FLOAT,
            okx_order_id VARCHAR(64),
            okx_status   VARCHAR(20),
            signal_id    INTEGER      REFERENCES signals(id) ON DELETE SET NULL,
            proposal_id  INTEGER,
            created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            filled_at    TIMESTAMPTZ,
            fill_price   FLOAT,
            error_msg    TEXT,
            notes        TEXT
        )
    """)
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_live_orders_created_at ON live_orders (created_at DESC)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS ix_live_orders_symbol ON live_orders (symbol)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS live_orders")
    op.execute(
        "ALTER TABLE account_config DROP COLUMN IF EXISTS live_mode_enabled"
    )
