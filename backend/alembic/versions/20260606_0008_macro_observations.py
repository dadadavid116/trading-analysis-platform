"""macro_observations — macro factor time-series storage (Phase 81)

Revision ID: 20260606_0008
Revises: 20260605_0007
"""

from alembic import op

revision = "20260606_0008"
down_revision = "20260605_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS macro_observations (
            id               SERIAL PRIMARY KEY,
            collected_at     TIMESTAMPTZ  NOT NULL,
            factor_name      VARCHAR(50)  NOT NULL,
            raw_value        FLOAT,
            normalized_score FLOAT        NOT NULL,
            direction        VARCHAR(10)  NOT NULL,
            confidence       FLOAT        NOT NULL,
            source           VARCHAR(30)  NOT NULL,
            as_of            TIMESTAMPTZ
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_macro_obs_name_ts
        ON macro_observations(factor_name, collected_at DESC)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_macro_obs_collected_at
        ON macro_observations(collected_at DESC)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_macro_obs_name_ts")
    op.execute("DROP INDEX IF EXISTS ix_macro_obs_collected_at")
    op.execute("DROP TABLE IF EXISTS macro_observations CASCADE")
