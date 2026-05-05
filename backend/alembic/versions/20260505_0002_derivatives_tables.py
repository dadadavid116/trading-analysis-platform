"""derivatives tables — funding_rates, open_interest, ls_ratios

Revision ID: 20260505_0002
Revises: 20260425_0001
Create Date: 2026-05-05 00:00:00.000000

All CREATE TABLE statements use IF NOT EXISTS — safe on fresh and existing databases.
"""
from typing import Sequence, Union

from alembic import op

revision: str = "20260505_0002"
down_revision: Union[str, None] = "20260425_0001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS funding_rates (
            id           SERIAL PRIMARY KEY,
            symbol       VARCHAR(20)     NOT NULL,
            timestamp    TIMESTAMPTZ     NOT NULL,
            funding_rate NUMERIC(18, 8)  NOT NULL,
            mark_price   NUMERIC(18, 2),
            index_price  NUMERIC(18, 2),
            exchange     VARCHAR(50)     NOT NULL DEFAULT 'binance'
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_funding_rates_symbol_ts
        ON funding_rates(symbol, timestamp DESC)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS open_interest (
            id        SERIAL PRIMARY KEY,
            symbol    VARCHAR(20)     NOT NULL,
            timestamp TIMESTAMPTZ     NOT NULL,
            oi_value  NUMERIC(24, 4)  NOT NULL,
            exchange  VARCHAR(50)     NOT NULL DEFAULT 'binance'
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_open_interest_symbol_ts
        ON open_interest(symbol, timestamp DESC)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS ls_ratios (
            id          SERIAL PRIMARY KEY,
            symbol      VARCHAR(20)     NOT NULL,
            timestamp   TIMESTAMPTZ     NOT NULL,
            long_ratio  NUMERIC(10, 6)  NOT NULL,
            short_ratio NUMERIC(10, 6)  NOT NULL,
            ratio_type  VARCHAR(30)     NOT NULL,
            exchange    VARCHAR(50)     NOT NULL DEFAULT 'binance'
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_ls_ratios_symbol_type_ts
        ON ls_ratios(symbol, ratio_type, timestamp DESC)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS ls_ratios CASCADE")
    op.execute("DROP TABLE IF EXISTS open_interest CASCADE")
    op.execute("DROP TABLE IF EXISTS funding_rates CASCADE")
