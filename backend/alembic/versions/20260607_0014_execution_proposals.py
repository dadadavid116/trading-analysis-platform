"""execution_proposals table (Phase 89)

Revision ID: 20260607_0014
Revises: 20260607_0013
"""

from alembic import op

revision = "20260607_0014"
down_revision = "20260607_0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS execution_proposals (
            id              SERIAL PRIMARY KEY,
            signal_id       INTEGER REFERENCES signals(id) ON DELETE SET NULL,
            symbol          VARCHAR(20)  NOT NULL,
            direction       VARCHAR(10)  NOT NULL,
            timeframe       VARCHAR(10)  NOT NULL DEFAULT '15m',
            entry_price     FLOAT        NOT NULL,
            stop_loss       FLOAT,
            tp1             FLOAT,
            tp2             FLOAT,
            tp3             FLOAT,
            size_usd        FLOAT        NOT NULL,
            risk_usd        FLOAT,
            risk_pct        FLOAT,
            risk_verdict    VARCHAR(20)  NOT NULL DEFAULT 'approved',
            risk_reasons    TEXT,
            risk_warnings   TEXT,
            status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
            order_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
            position_id     INTEGER REFERENCES open_positions(id) ON DELETE SET NULL,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            reviewed_at     TIMESTAMPTZ,
            notes           TEXT
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_exec_proposals_status     ON execution_proposals (status)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_exec_proposals_created_at ON execution_proposals (created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS execution_proposals")
