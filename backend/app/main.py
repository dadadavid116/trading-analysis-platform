"""
main.py — FastAPI application entry point

This is the root of the API server.
Start the server with:
    uvicorn app.main:app --reload
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.auth import require_api_key
from app.config import settings
from app.routers import price, liquidations, orderbook, analysis, alerts, chat, strategy, chat_history, health, derivatives, symbols, events, scanner, journal, news, factors, macro, context, signals, account, risk, execution, backtest, review, diagnostics, adapters, auth as auth_router, settings as settings_router

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Schema is managed exclusively by Alembic migrations.
    # Run `alembic upgrade head` (via deploy.sh) before starting the API.

    # Log secondary API key status. Primary access control is Caddy Basic Auth.
    if settings.dashboard_api_key.strip():
        logger.info("Secondary API key layer ENABLED (X-API-Key required on /api/*).")
    else:
        logger.info(
            "DASHBOARD_API_KEY not set — secondary API key layer is inactive. "
            "Primary access control is Caddy Basic Auth (production only)."
        )

    # Seed the default admin user if JWT auth is configured and no users exist.
    if settings.jwt_secret_key.strip() and settings.admin_email.strip():
        from app.database import AsyncSessionLocal
        from app.services.user_service import seed_admin
        async with AsyncSessionLocal() as db:
            await seed_admin(db)

    # Start background scanner worker
    from app.workers.scanner_worker import run_scanner_worker
    scanner_task = asyncio.create_task(run_scanner_worker())
    logger.info("Background scanner worker task started.")

    # Start background journal outcome notifier worker
    from app.workers.journal_worker import run_journal_worker
    journal_task = asyncio.create_task(run_journal_worker())
    logger.info("Background journal notifier worker task started.")

    yield

    for task in (scanner_task, journal_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

# ── Create the FastAPI application ────────────────────────────────────────────
app = FastAPI(
    title="Trading Analysis Platform API",
    description="Backend API for the crypto market monitoring dashboard.",
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS middleware ───────────────────────────────────────────────────────────
# Allowed origins are read from CORS_ALLOWED_ORIGINS in .env (comma-separated).
# Defaults to localhost dev origins. For production, set the env var to your
# domain, e.g.:  CORS_ALLOWED_ORIGINS=https://yourdomain.com
#
# In production with Caddy, the browser sees a single origin (your domain) for
# both the frontend and /api/* requests, so CORS is not strictly required —
# but it is kept here so the API remains usable from other origins (e.g. tools,
# future Telegram integrations) without code changes.
#
# Note: allow_origins=["*"] cannot be combined with allow_credentials=True.
ALLOWED_ORIGINS = [
    o.strip()
    for o in settings.cors_allowed_origins.split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Health check endpoint ─────────────────────────────────────────────────────
# Intentionally unauthenticated — monitoring tools can use this without a key.
@app.get("/health", tags=["health"])
async def health_check():
    """
    Simple liveness check.
    Returns {"status": "ok"} when the server is running.
    """
    return {"status": "ok"}


# ── Routers ───────────────────────────────────────────────────────────────────
# All /api/* routes require a valid X-API-Key header when DASHBOARD_API_KEY is set.
_auth = [Depends(require_api_key)]

app.include_router(price.router,        prefix="/api", dependencies=_auth)
app.include_router(liquidations.router, prefix="/api", dependencies=_auth)
app.include_router(orderbook.router,    prefix="/api", dependencies=_auth)
app.include_router(analysis.router,     prefix="/api", dependencies=_auth)
app.include_router(alerts.router,       prefix="/api", dependencies=_auth)
app.include_router(chat.router,         prefix="/api", dependencies=_auth)
app.include_router(chat_history.router, prefix="/api", dependencies=_auth)
app.include_router(strategy.router,     prefix="/api", dependencies=_auth)
# Health endpoint — unauthenticated so monitoring tools can reach it without a key.
app.include_router(health.router,       prefix="/api")
app.include_router(derivatives.router,  prefix="/api", dependencies=_auth)
app.include_router(symbols.router,      prefix="/api", dependencies=_auth)
app.include_router(events.router,       prefix="/api", dependencies=_auth)
app.include_router(scanner.router,      prefix="/api", dependencies=_auth)
app.include_router(journal.router,      prefix="/api", dependencies=_auth)
app.include_router(news.router,         prefix="/api", dependencies=_auth)
app.include_router(factors.router,      prefix="/api", dependencies=_auth)
app.include_router(macro.router,        prefix="/api", dependencies=_auth)
app.include_router(context.router,      prefix="/api", dependencies=_auth)
app.include_router(signals.router,      prefix="/api", dependencies=_auth)
app.include_router(account.router,      prefix="/api", dependencies=_auth)
app.include_router(risk.router,         prefix="/api", dependencies=_auth)
app.include_router(execution.router,    prefix="/api", dependencies=_auth)
app.include_router(backtest.router,     prefix="/api", dependencies=_auth)
app.include_router(review.router,       prefix="/api", dependencies=_auth)
app.include_router(diagnostics.router,  prefix="/api", dependencies=_auth)
app.include_router(adapters.router,     prefix="/api", dependencies=_auth)
# Auth router has no _auth dependency — login/status endpoints must be reachable without a token.
app.include_router(auth_router.router,    prefix="/api")
# Settings — protected by _auth (API key) but uses its own optional-user logic for JWT.
app.include_router(settings_router.router, prefix="/api", dependencies=_auth)
