# Backend

This folder contains the entire Python backend for the Trading Analysis Platform.

## Structure

```
backend/
├── app/                # FastAPI application (API server)
│   ├── main.py         # Entry point — creates the FastAPI app
│   ├── config.py       # Settings loaded from environment variables
│   ├── database.py     # SQLAlchemy engine and session setup
│   ├── models/         # ORM models (database table definitions)
│   ├── routers/        # API route handlers (one file per feature area)
│   └── schemas/        # Pydantic schemas (request/response shapes)
├── collectors/         # Live data collection workers (Binance WebSocket streams)
│   ├── price_collector.py       # Streams 1-minute OHLCV candles
│   ├── liquidation_collector.py # Streams liquidation events (Binance Futures)
│   ├── orderbook_collector.py   # Captures BTC order book snapshots
│   └── run_all.py               # Entry point: runs all three collectors
├── analysis/           # AI-assisted market analysis worker (Claude API)
│   ├── claude_client.py         # Reads market data, calls Claude, stores summary
│   └── run.py                   # Entry point: runs the analysis loop
├── alerts/             # Alert evaluation worker (evaluator, notifications, run loop)
│   │                   # Sends Telegram message if TELEGRAM_BOT_TOKEN is configured
├── telegram_bot/       # Telegram bot service (long polling, /price /analysis /alerts etc.)
├── migrations/         # [Later] Alembic database migration scripts
├── tests/              # Pytest tests for the backend
├── requirements.txt    # Python dependencies
└── Dockerfile          # Container definition for the backend service
```

## Running Locally with Docker Compose

From the repo root:

```bash
docker compose up --build
```

This starts seven services: `db`, `api`, `collector`, `analysis`, `alerts`, `telegram`, and `frontend`.

Before starting, make sure your `.env` file has `ANTHROPIC_API_KEY` set.
The analysis worker will skip silently if the key is missing, but the
Analysis panel will show no data until it is added.

## Verifying live collectors

Watch the collector logs:

```bash
docker compose logs -f collector
```

You should see:
```
Candle stored: BTCUSDT  close=83850.00  volume=12.4500
Liquidation stored: BTCUSDT  side=sell  price=83720.00  qty=0.4200
Order book snapshot stored.
```

## Verifying the analysis worker

Watch the analysis logs:

```bash
docker compose logs -f analysis
```

After ~30 seconds you should see:
```
Analysis worker starting. Interval: 10 min. First run in 30 s...
Analysis summary stored. model=claude-haiku-4-5-20251001  length=312 chars
Next analysis in 10 minutes.
```

If you see `ANTHROPIC_API_KEY is not set` — add your key to `.env` and restart:
```bash
docker compose restart analysis
```

## What each service does

| Service | Entry point | Behavior |
|---|---|---|
| `collector` | `collectors/run_all.py` | Price: 1/min · Liquidations: on event · Order book: 1/5s |
| `analysis` | `analysis/run.py` | Every `ANALYSIS_INTERVAL_MINUTES` (default: 10 min) |
| `alerts` | `alerts/run.py` | Reads DB every `ALERT_EVALUATION_INTERVAL_MINUTES` (default: 1 min) |
| `telegram` | `telegram_bot/run.py` | Long polling; restricted to `TELEGRAM_CHAT_ID`; idle if token not set |

## What each collector does

| File | Stream | Write frequency |
|---|---|---|
| `price_collector.py` | `btcusdt@kline_1m` (Binance spot) | Once per minute (on candle close) |
| `liquidation_collector.py` | `btcusdt@forceOrder` (Binance Futures) | On each liquidation event |
| `orderbook_collector.py` | `btcusdt@depth20` (Binance spot) | At most once every 5 seconds |

## Note on orderbook_snapshots growth

The `orderbook_snapshots` table accumulates ~1 row every 5 seconds. For local
development this is fine. Before VPS deployment, a periodic pruning strategy
(e.g. keep only the last 24 hours) should be added.

## Running Locally (without Docker)

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp ../.env.example ../.env
# Edit .env — set DATABASE_URL, ANTHROPIC_API_KEY, ANALYSIS_INTERVAL_MINUTES

# Start the API server
uvicorn app.main:app --reload

# In separate terminals:
python -m collectors.run_all
python -m analysis.run
```

## Access control

All `/api/*` endpoints require an `X-API-Key` header when `DASHBOARD_API_KEY`
is set in `.env`. The dependency is applied in `app/main.py` via
`app/auth.py`. The `/health` endpoint is intentionally unauthenticated.

When `DASHBOARD_API_KEY` is empty (local dev default) auth is disabled and a
warning is logged at startup. Set a strong key before VPS deployment.

## Environment Variables

See `../.env.example` for all required variables.
The backend reads them via `app/config.py`.

## Notes

- The `analysis_summaries` table is created automatically on API startup
  via `Base.metadata.create_all` — no DB wipe or manual SQL needed.
- Database migrations (Alembic) will be added once the schema stabilises.
- The `collector` and `analysis` services use the same Docker image as the
  API but run different entry points via CMD overrides in docker-compose.yml.
