"""
main.py — FastAPI application entry point

This is the root of the API server.
Start the server with:
    uvicorn app.main:app --reload
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import engine, Base
# Import models so SQLAlchemy registers them with Base before create_all runs.
import app.models.price        # noqa: F401
import app.models.liquidation  # noqa: F401
import app.models.orderbook    # noqa: F401
import app.models.analysis     # noqa: F401
import app.models.alert        # noqa: F401
from app.routers import price, liquidations, orderbook, analysis, alerts


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create any tables that don't already exist.
    # In Docker this is a no-op because init_db.sql already created them.
    # Outside Docker (running uvicorn directly) this creates the tables automatically.
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield

# ── Create the FastAPI application ────────────────────────────────────────────
app = FastAPI(
    title="Trading Analysis Platform API",
    description="Backend API for the crypto market monitoring dashboard.",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS middleware ───────────────────────────────────────────────────────────
# Allow the React dev server (Vite default: port 5173) and a plain localhost
# origin to call this API during local development.
#
# Note: allow_origins=["*"] cannot be combined with allow_credentials=True
# (browsers will reject the response). Use an explicit origin list instead.
#
# When deploying to a VPS, add your production domain to this list or move it
# to an environment variable.
ALLOWED_ORIGINS = [
    "http://localhost:5173",   # Vite dev server (React frontend)
    "http://localhost:3000",   # Alternative dev port
    "http://127.0.0.1:5173",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check endpoint ─────────────────────────────────────────────────────
@app.get("/health", tags=["health"])
async def health_check():
    """
    Simple liveness check.
    Returns {"status": "ok"} when the server is running.
    """
    return {"status": "ok"}


# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(price.router,        prefix="/api")
app.include_router(liquidations.router, prefix="/api")
app.include_router(orderbook.router,    prefix="/api")
app.include_router(analysis.router,     prefix="/api")
app.include_router(alerts.router,       prefix="/api")
