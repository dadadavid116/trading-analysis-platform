"""orders and order_events tables (Phase 88)

Revision ID: 20260607_0013
Revises: 20260607_0012
"""

from alembic import op
import sqlalchemy as sa

revision = "20260607_0013"
down_revision = "20260607_0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            id              SERIAL PRIMARY KEY,
            signal_id       INTEGER REFERENCES signals(id) ON DELETE SET NULL,
            position_id     INTEGER REFERENCES open_positions(id) ON DELETE SET NULL,
            symbol          VARCHAR(20)  NOT NULL,
            direction       VARCHAR(10)  NOT NULL,
            order_type      VARCHAR(20)  NOT NULL DEFAULT 'market',
            status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
            requested_price FLOAT,
            filled_price    FLOAT,
            size_usd        FLOAT        NOT NULL,
            stop_loss       FLOAT,
            tp1             FLOAT,
            tp2             FLOAT,
            tp3             FLOAT,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            filled_at       TIMESTAMPTZ,
            cancelled_at    TIMESTAMPTZ,
            notes           TEXT
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS order_events (
            id          SERIAL PRIMARY KEY,
            order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
            event_type  VARCHAR(30) NOT NULL,
            price       FLOAT,
            timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            notes       TEXT
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_symbol_status ON orders (symbol, status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_orders_created_at    ON orders (created_at DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_order_events_order_id ON order_events (order_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS order_events")
    op.execute("DROP TABLE IF EXISTS orders")
