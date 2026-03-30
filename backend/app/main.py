"""
main.py — FastAPI application entry point

This is the root of the API server.
Start the server with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings

# ── Create the FastAPI application ────────────────────────────────────────────
app = FastAPI(
    title="Trading Analysis Platform API",
    description="Backend API for the crypto market monitoring dashboard.",
    version="0.1.0",
)

# ── CORS middleware ───────────────────────────────────────────────────────────
# Allow the React frontend (running on a different port) to call this API.
# In production, replace "*" with your actual frontend domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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


# ── Routers (added here as they are implemented) ──────────────────────────────
# from app.routers import price, liquidations, orderbook
# app.include_router(price.router, prefix="/api")
# app.include_router(liquidations.router, prefix="/api")
# app.include_router(orderbook.router, prefix="/api")
#
# [Later] alerts and analysis routers:
# from app.routers import alerts, analysis
# app.include_router(alerts.router, prefix="/api")
# app.include_router(analysis.router, prefix="/api")
