"""
config.py — Application settings

All configuration is read from environment variables.
Copy ../.env.example to ../.env and fill in your values before running.

pydantic-settings automatically reads from .env files and environment variables.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # pydantic-settings v2: use model_config instead of an inner Config class
    model_config = SettingsConfigDict(
        env_file="../.env",
        env_file_encoding="utf-8",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    # Full async connection URL for SQLAlchemy + asyncpg
    database_url: str = "postgresql+asyncpg://trading:changeme@localhost:5432/trading_db"

    # ── API server ────────────────────────────────────────────────────────────
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    # ── Exchange / data collection ───────────────────────────────────────────
    exchange: str = "binance"
    symbol: str = "BTCUSDT"

    # ── Claude API (analysis worker) ─────────────────────────────────────────
    anthropic_api_key: str = ""

    # How often the analysis worker generates a new summary (in minutes).
    # Set ANALYSIS_INTERVAL_MINUTES in .env to override.
    analysis_interval_minutes: int = 10

    # ── CORS ──────────────────────────────────────────────────────────────────
    # Comma-separated list of allowed origins for the API.
    # Local dev default covers the Vite dev server.
    # For production, set this to your domain, e.g.:
    #   CORS_ALLOWED_ORIGINS=https://yourdomain.com
    cors_allowed_origins: str = (
        "http://localhost:5173,"
        "http://localhost:3000,"
        "http://127.0.0.1:5173,"
        "http://127.0.0.1:3000"
    )

    # ── Alerts ────────────────────────────────────────────────────────────────
    # How often the alert evaluator checks conditions (in minutes).
    alert_evaluation_interval_minutes: int = 1

    # ── Telegram ─────────────────────────────────────────────────────────────
    # Bot token from @BotFather — used by the telegram_bot service and for
    # alert notifications. Leave blank to disable Telegram features.
    telegram_bot_token: str = ""
    # Chat ID for alert notifications — your Telegram user ID or group ID.
    # Find your chat ID by messaging @userinfobot on Telegram.
    telegram_chat_id: str = ""

    # ── Dashboard access control ──────────────────────────────────────────────
    # Optional secondary backend API key. When set, FastAPI validates an
    # X-API-Key header on all /api/* requests in addition to Caddy Basic Auth.
    # This is not required — Caddy Basic Auth is the primary access gate.
    # Leave empty (the default) to rely on Caddy auth alone.
    # Not used by the frontend — no secret is embedded in the browser bundle.
    dashboard_api_key: str = ""


# Create a single shared settings instance.
# Import this anywhere in the app:  from app.config import settings
settings = Settings()
