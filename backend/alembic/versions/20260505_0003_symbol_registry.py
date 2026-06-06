"""symbol_registry — tracked_symbols table with BTC/ETH/SOL seed rows

Revision ID: 20260505_0003
Revises: 20260505_0002
"""

from alembic import op

revision = "20260505_0003"
down_revision = "20260505_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # IF NOT EXISTS — safe on the live VPS where this table was created by
    # create_all before Alembic took over as the schema authority.
    op.execute("""
        CREATE TABLE IF NOT EXISTS tracked_symbols (
            id                SERIAL       PRIMARY KEY,
            symbol            VARCHAR(20)  NOT NULL UNIQUE,
            okx_instrument_id VARCHAR(30),
            binance_symbol    VARCHAR(20),
            display_name      VARCHAR(10)  NOT NULL,
            is_active         BOOLEAN      NOT NULL DEFAULT TRUE,
            sort_order        INTEGER      NOT NULL DEFAULT 0
        )
    """)

    # Ensure is_active has a column-level DEFAULT in the existing table.
    # If the table was created by create_all it may be NOT NULL without a
    # default, which causes INSERT to fail before ON CONFLICT can suppress it.
    op.execute("""
        ALTER TABLE tracked_symbols
        ALTER COLUMN is_active SET DEFAULT TRUE
    """)
    op.execute("""
        ALTER TABLE tracked_symbols
        ALTER COLUMN sort_order SET DEFAULT 0
    """)

    # is_active included explicitly so existing rows without a column default
    # don't hit a NOT NULL violation before ON CONFLICT can suppress the row.
    op.execute("""
        INSERT INTO tracked_symbols
            (symbol, okx_instrument_id, binance_symbol, display_name, is_active, sort_order)
        VALUES
            ('BTCUSDT', 'BTC-USDT-SWAP', 'BTCUSDT', 'BTC', TRUE, 0),
            ('ETHUSDT', 'ETH-USDT-SWAP', 'ETHUSDT', 'ETH', TRUE, 1),
            ('SOLUSDT', 'SOL-USDT-SWAP', 'SOLUSDT', 'SOL', TRUE, 2)
        ON CONFLICT (symbol) DO NOTHING
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS tracked_symbols CASCADE")
