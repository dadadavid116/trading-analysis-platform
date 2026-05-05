"""
alembic/env.py — Async-compatible Alembic environment.

Uses create_async_engine + conn.run_sync so we never need psycopg2 (the
project uses asyncpg only).

Running migrations:
    cd backend
    alembic upgrade head          # apply all pending migrations
    alembic revision --autogenerate -m "description"   # generate a new one

On a VPS with an existing database:
    alembic stamp head            # mark current schema as up-to-date without running SQL
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.database import Base  # noqa: F401 — imports all models via app/main.py imports

# Import every model so Base.metadata is fully populated before autogenerate.
import app.models.price        # noqa: F401
import app.models.liquidation  # noqa: F401
import app.models.orderbook    # noqa: F401
import app.models.analysis     # noqa: F401
import app.models.alert        # noqa: F401
import app.models.chat         # noqa: F401

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Run migrations without a live DB connection (generates SQL only)."""
    context.configure(
        url=settings.database_url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Run migrations against a live DB using the async engine."""
    connectable = create_async_engine(settings.database_url)
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
