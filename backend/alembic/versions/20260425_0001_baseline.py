"""baseline — full schema as of Phase 24

Revision ID: 20260425_0001
Revises:
Create Date: 2026-04-25 00:00:00.000000

All statements use IF NOT EXISTS / IF NOT EXISTS so this migration is safe to
run against an already-initialised database (i.e. one created by init_db.sql).

On a fresh VPS with an existing database, run:
    alembic stamp head
...instead of upgrade, to mark the schema as current without executing SQL.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "20260425_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS price_candles (
            id        SERIAL PRIMARY KEY,
            symbol    VARCHAR(20)     NOT NULL,
            timestamp TIMESTAMPTZ     NOT NULL,
            open      NUMERIC(18, 2)  NOT NULL,
            high      NUMERIC(18, 2)  NOT NULL,
            low       NUMERIC(18, 2)  NOT NULL,
            close     NUMERIC(18, 2)  NOT NULL,
            volume    NUMERIC(24, 8)  NOT NULL
        )
    """)
    op.execute("""
        CREATE UNIQUE INDEX IF NOT EXISTS uq_price_candles_symbol_ts
        ON price_candles(symbol, timestamp)
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS liquidations (
            id        SERIAL PRIMARY KEY,
            symbol    VARCHAR(20)     NOT NULL,
            timestamp TIMESTAMPTZ     NOT NULL,
            side      VARCHAR(4)      NOT NULL,
            price     NUMERIC(18, 2)  NOT NULL,
            quantity  NUMERIC(18, 8)  NOT NULL,
            exchange  VARCHAR(50)     NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS orderbook_snapshots (
            id        SERIAL PRIMARY KEY,
            symbol    VARCHAR(20)  NOT NULL,
            timestamp TIMESTAMPTZ  NOT NULL,
            bids      JSONB        NOT NULL,
            asks      JSONB        NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS alerts (
            id             SERIAL PRIMARY KEY,
            name           VARCHAR(100)    NOT NULL,
            symbol         VARCHAR(20)     NOT NULL DEFAULT 'BTCUSDT',
            condition_type VARCHAR(30)     NOT NULL,
            threshold      NUMERIC(18, 2)  NOT NULL,
            window_minutes INTEGER,
            trigger_mode   VARCHAR(10)     NOT NULL DEFAULT 'once',
            is_active      BOOLEAN         NOT NULL DEFAULT TRUE,
            triggered_at   TIMESTAMPTZ,
            created_at     TIMESTAMPTZ     NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS analysis_summaries (
            id           SERIAL PRIMARY KEY,
            symbol       VARCHAR(20)  NOT NULL,
            generated_at TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            summary_text TEXT         NOT NULL,
            model_used   VARCHAR(50)  NOT NULL
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS chat_sessions (
            id             SERIAL PRIMARY KEY,
            platform       VARCHAR(20)  NOT NULL DEFAULT 'web',
            model          VARCHAR(30)  NOT NULL DEFAULT 'claude',
            title          VARCHAR(200),
            created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
            last_active_at TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)

    op.execute("""
        CREATE TABLE IF NOT EXISTS chat_messages (
            id         SERIAL PRIMARY KEY,
            session_id INTEGER      NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
            role       VARCHAR(20)  NOT NULL,
            content    TEXT         NOT NULL,
            timestamp  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_chat_messages_session_id
        ON chat_messages(session_id)
    """)


def downgrade() -> None:
    # Downgrade drops everything — only use in development.
    op.execute("DROP TABLE IF EXISTS chat_messages CASCADE")
    op.execute("DROP TABLE IF EXISTS chat_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS analysis_summaries CASCADE")
    op.execute("DROP TABLE IF EXISTS alerts CASCADE")
    op.execute("DROP TABLE IF EXISTS orderbook_snapshots CASCADE")
    op.execute("DROP TABLE IF EXISTS liquidations CASCADE")
    op.execute("DROP TABLE IF EXISTS price_candles CASCADE")
