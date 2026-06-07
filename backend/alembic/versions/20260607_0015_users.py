"""users table (Phase 95)

Revision ID: 20260607_0015
Revises: 20260607_0014
"""

from alembic import op

revision = "20260607_0015"
down_revision = "20260607_0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id              SERIAL PRIMARY KEY,
            email           VARCHAR(255) NOT NULL,
            username        VARCHAR(50)  NOT NULL,
            hashed_password TEXT         NOT NULL,
            role            VARCHAR(20)  NOT NULL DEFAULT 'admin',
            is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
            created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            last_login      TIMESTAMPTZ
        )
    """)
    op.execute("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email      ON users (email)")
    op.execute("CREATE INDEX        IF NOT EXISTS ix_users_created_at ON users (created_at DESC)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS users")
