"""symbol_registry — tracked_symbols table with BTC/ETH/SOL seed rows

Revision ID: 20260505_0003
Revises: 20260505_0002
"""

from alembic import op
import sqlalchemy as sa

revision = "20260505_0003"
down_revision = "20260505_0002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "tracked_symbols",
        sa.Column("id",                sa.Integer,     primary_key=True),
        sa.Column("symbol",            sa.String(20),  nullable=False, unique=True),
        sa.Column("okx_instrument_id", sa.String(30)),
        sa.Column("binance_symbol",    sa.String(20)),
        sa.Column("display_name",      sa.String(10),  nullable=False),
        sa.Column("is_active",         sa.Boolean,     nullable=False, server_default="true"),
        sa.Column("sort_order",        sa.Integer,     nullable=False, server_default="0"),
    )

    op.execute("""
        INSERT INTO tracked_symbols
            (symbol, okx_instrument_id, binance_symbol, display_name, sort_order)
        VALUES
            ('BTCUSDT', 'BTC-USDT-SWAP', 'BTCUSDT', 'BTC', 0),
            ('ETHUSDT', 'ETH-USDT-SWAP', 'ETHUSDT', 'ETH', 1),
            ('SOLUSDT', 'SOL-USDT-SWAP', 'SOLUSDT', 'SOL', 2)
    """)


def downgrade() -> None:
    op.drop_table("tracked_symbols")
