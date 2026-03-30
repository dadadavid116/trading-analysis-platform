"""
database.py — Database engine and session setup

Sets up SQLAlchemy with an async PostgreSQL connection via asyncpg.

Usage in route handlers:
    from app.database import get_db
    ...
    async def my_route(db: AsyncSession = Depends(get_db)):
        ...
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.config import settings


# ── Engine ────────────────────────────────────────────────────────────────────
# The engine manages the connection pool to PostgreSQL.
engine = create_async_engine(
    settings.database_url,
    echo=False,      # Set to True to log all SQL queries (useful for debugging)
    future=True,
)


# ── Session factory ───────────────────────────────────────────────────────────
# AsyncSessionLocal is used to create individual database sessions.
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


# ── Base class for ORM models ─────────────────────────────────────────────────
# All models in app/models/ should inherit from this Base class.
class Base(DeclarativeBase):
    pass


# ── Dependency for FastAPI routes ─────────────────────────────────────────────
async def get_db() -> AsyncSession:
    """
    Yields a database session for use in a route handler.
    The session is automatically closed after the request finishes.

    Example:
        async def my_route(db: AsyncSession = Depends(get_db)):
            result = await db.execute(...)
    """
    async with AsyncSessionLocal() as session:
        yield session
