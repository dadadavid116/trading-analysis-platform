"""Create factor_observations and regime_snapshots tables.

Revision ID: 20260605_0007
Revises: 20260605_0006
Create Date: 2026-06-05 00:00:00.000000

factor_observations — per-factor normalized score snapshot (48h retention)
regime_snapshots    — composite crypto regime classification + sub-scores
"""

from typing import Sequence, Union

from alembic import op

revision: str = "20260605_0007"
down_revision: Union[str, None] = "20260605_0006"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS factor_observations (
            id               SERIAL PRIMARY KEY,
            computed_at      TIMESTAMPTZ  NOT NULL,
            symbol           VARCHAR(20),
            factor_name      VARCHAR(50)  NOT NULL,
            raw_value        FLOAT,
            normalized_score FLOAT        NOT NULL,
            direction        VARCHAR(10)  NOT NULL,
            confidence       FLOAT        NOT NULL,
            source           VARCHAR(30)  NOT NULL
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_factor_obs_name_sym_ts
        ON factor_observations(factor_name, symbol, computed_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_factor_obs_computed_at
        ON factor_observations(computed_at DESC)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS regime_snapshots (
            id                   SERIAL PRIMARY KEY,
            computed_at          TIMESTAMPTZ  NOT NULL,
            symbol               VARCHAR(20),
            crypto_score         FLOAT        NOT NULL,
            regime               VARCHAR(30)  NOT NULL,
            trade_environment    VARCHAR(20)  NOT NULL,
            primary_driver       VARCHAR(30)  NOT NULL,
            derivatives_pressure FLOAT,
            liquidity_pressure   FLOAT,
            detail               JSONB
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_regime_snapshots_sym_ts
        ON regime_snapshots(symbol, computed_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_regime_snapshots_sym_ts")
    op.execute("DROP TABLE IF EXISTS regime_snapshots CASCADE")
    op.execute("DROP INDEX IF EXISTS ix_factor_obs_name_sym_ts")
    op.execute("DROP INDEX IF EXISTS ix_factor_obs_computed_at")
    op.execute("DROP TABLE IF EXISTS factor_observations CASCADE")
