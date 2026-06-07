"""account_config, account_snapshots, open_positions tables (Phase 86)

Revision ID: 20260607_0011
Revises: 20260607_0010
"""

from alembic import op

revision = "20260607_0011"
down_revision = "20260607_0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Single-row configuration table (UPSERT-based, id always 1)
    op.execute("""
        CREATE TABLE IF NOT EXISTS account_config (
            id                     SERIAL PRIMARY KEY,
            starting_capital       FLOAT       NOT NULL DEFAULT 10000,
            currency               VARCHAR(10) NOT NULL DEFAULT 'USD',
            max_risk_per_trade_pct FLOAT       NOT NULL DEFAULT 2.0,
            max_open_risk_pct      FLOAT       NOT NULL DEFAULT 10.0,
            daily_loss_limit_pct   FLOAT       NOT NULL DEFAULT 5.0,
            updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
        )
    """)

    # Seed default config row
    op.execute("""
        INSERT INTO account_config
            (id, starting_capital, currency, max_risk_per_trade_pct, max_open_risk_pct, daily_loss_limit_pct)
        VALUES (1, 10000, 'USD', 2.0, 10.0, 5.0)
        ON CONFLICT (id) DO NOTHING
    """)

    # Equity snapshots — taken on position open/close and manual trigger
    op.execute("""
        CREATE TABLE IF NOT EXISTS account_snapshots (
            id                  SERIAL PRIMARY KEY,
            timestamp           TIMESTAMPTZ NOT NULL DEFAULT now(),
            equity              FLOAT       NOT NULL,
            starting_capital    FLOAT       NOT NULL,
            realized_pnl        FLOAT       NOT NULL DEFAULT 0,
            open_position_count INT         NOT NULL DEFAULT 0,
            open_risk_usd       FLOAT       NOT NULL DEFAULT 0,
            trigger             VARCHAR(30)
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_account_snapshots_ts
        ON account_snapshots (timestamp DESC)
    """)

    # Open paper positions — the exposure base the risk engine reads
    op.execute("""
        CREATE TABLE IF NOT EXISTS open_positions (
            id            SERIAL PRIMARY KEY,
            symbol        VARCHAR(20)  NOT NULL,
            direction     VARCHAR(10)  NOT NULL,
            entry_price   FLOAT        NOT NULL,
            size_usd      FLOAT        NOT NULL,
            stop_loss     FLOAT,
            tp1           FLOAT,
            tp2           FLOAT,
            tp3           FLOAT,
            signal_id     INTEGER      REFERENCES signals(id) ON DELETE SET NULL,
            status        VARCHAR(20)  NOT NULL DEFAULT 'open',
            opened_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
            closed_at     TIMESTAMPTZ,
            close_price   FLOAT,
            realized_pnl  FLOAT,
            notes         TEXT
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_open_positions_status
        ON open_positions (status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_open_positions_symbol
        ON open_positions (symbol, status)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS open_positions")
    op.execute("DROP INDEX IF EXISTS ix_account_snapshots_ts")
    op.execute("DROP TABLE IF EXISTS account_snapshots")
    op.execute("DROP TABLE IF EXISTS account_config")
