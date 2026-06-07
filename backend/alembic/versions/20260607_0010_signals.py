"""signals and signal_events tables (Phase 85)

Revision ID: 20260607_0010
Revises: 20260606_0009
"""

from alembic import op
import sqlalchemy as sa

revision = "20260607_0010"
down_revision = "20260606_0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS signals (
            id            SERIAL PRIMARY KEY,
            symbol        VARCHAR(20)  NOT NULL,
            timeframe     VARCHAR(10)  NOT NULL DEFAULT '15m',
            direction     VARCHAR(10)  NOT NULL,
            status        VARCHAR(20)  NOT NULL DEFAULT 'candidate',
            source        VARCHAR(30)  NOT NULL DEFAULT 'scanner_auto',
            scanner_score FLOAT,
            signal_count  INTEGER      DEFAULT 0,
            context_score FLOAT,
            crypto_score  FLOAT,
            macro_score   FLOAT,
            regime        VARCHAR(30),
            entry_low     FLOAT,
            entry_high    FLOAT,
            stop_loss     FLOAT,
            tp1           FLOAT,
            tp2           FLOAT,
            tp3           FLOAT,
            risk_reward   FLOAT,
            signal_labels JSONB        DEFAULT '[]',
            created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
            activated_at  TIMESTAMPTZ,
            closed_at     TIMESTAMPTZ,
            expires_at    TIMESTAMPTZ,
            close_reason  VARCHAR(30),
            notes         TEXT
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_signals_symbol_status
        ON signals (symbol, status)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_signals_created_at
        ON signals (created_at DESC)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS signal_events (
            id         SERIAL PRIMARY KEY,
            signal_id  INTEGER     NOT NULL REFERENCES signals(id) ON DELETE CASCADE,
            event_type VARCHAR(30) NOT NULL,
            price_at   FLOAT,
            timestamp  TIMESTAMPTZ NOT NULL DEFAULT now(),
            notes      TEXT
        )
    """)

    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_signal_events_signal_id
        ON signal_events (signal_id)
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS signal_events")
    op.execute("DROP TABLE IF EXISTS signals")
