"""
main.py — FastAPI application entry point

This is the root of the API server.
Start the server with:
    uvicorn app.main:app --reload
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# ── Create the FastAPI application ────────────────────────────────────────────
app = FastAPI(
    title="Trading Analysis Platform API",
    description="Backend API for the crypto market monitoring dashboard.",
    version="0.1.0",
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
