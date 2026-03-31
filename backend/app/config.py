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

    # ── Alerts ────────────────────────────────────────────────────────────────
    # How often the alert evaluator checks conditions (in minutes).
    alert_evaluation_interval_minutes: int = 1

    # Telegram notification credentials — leave blank to use logging-only mode.
    alert_telegram_token: str = ""
    alert_telegram_chat_id: str = ""


# Create a single shared settings instance.
# Import this anywhere in the app:  from app.config import settings
settings = Settings()
