"""factor_scores and factor_weights tables (Phase 82)

Revision ID: 20260606_0009
Revises: 20260606_0008
"""

from alembic import op

revision = "20260606_0009"
down_revision = "20260606_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS factor_weights (
            id            SERIAL PRIMARY KEY,
            version       INTEGER  NOT NULL UNIQUE,
            crypto_weight FLOAT    NOT NULL DEFAULT 0.6,
            macro_weight  FLOAT    NOT NULL DEFAULT 0.4,
            created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        INSERT INTO factor_weights (version, crypto_weight, macro_weight)
        VALUES (1, 0.6, 0.4)
        ON CONFLICT DO NOTHING
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS factor_scores (
            id              SERIAL PRIMARY KEY,
            computed_at     TIMESTAMPTZ  NOT NULL,
            symbol          VARCHAR(20)  NOT NULL,
            crypto_score    FLOAT,
            macro_score     FLOAT,
            context_score   FLOAT        NOT NULL,
            regime          VARCHAR(30)  NOT NULL,
            weights_version INTEGER      NOT NULL DEFAULT 1
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_factor_scores_symbol_ts
        ON factor_scores(symbol, computed_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_factor_scores_computed_at
        ON factor_scores(computed_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_factor_scores_computed_at")
    op.execute("DROP INDEX IF EXISTS ix_factor_scores_symbol_ts")
    op.execute("DROP TABLE IF EXISTS factor_scores CASCADE")
    op.execute("DROP TABLE IF EXISTS factor_weights CASCADE")
