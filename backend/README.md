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
├── analysis/           # [Later] AI-assisted analysis logic (Claude API)
├── alerts/             # [Later] Alert evaluation and notification logic
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

This starts four services: `db`, `api`, `collector`, and `frontend`.
The collector service connects to Binance WebSocket streams and writes live
BTC data to the database continuously.

## Verifying that live data is flowing

After starting the stack, watch the collector logs:

```bash
docker compose logs -f collector
```

You should see lines like:
```
Candle stored: BTCUSDT  close=83850.00  volume=12.4500
Liquidation stored: BTCUSDT  side=sell  price=83720.00  qty=0.4200
Order book snapshot stored.
```

If you see `reconnecting in 5 s.` messages, the collector is waiting to connect
to Binance. This is normal on startup — it retries automatically.

## What each collector does

| File | Stream | Write frequency |
|---|---|---|
| `price_collector.py` | `btcusdt@kline_1m` (Binance spot) | Once per minute (on candle close) |
| `liquidation_collector.py` | `btcusdt@forceOrder` (Binance Futures) | On each liquidation event |
| `orderbook_collector.py` | `btcusdt@depth20` (Binance spot) | At most once every 5 seconds |

## Running Locally (without Docker)

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp ../.env.example ../.env
# Edit .env and set DATABASE_URL to point to your local PostgreSQL instance

# Start the API server
uvicorn app.main:app --reload

# In a separate terminal, start the collectors
python -m collectors.run_all
```

## Environment Variables

See `../.env.example` for all required variables.
The backend reads them via `app/config.py`.

## Notes

- The `analysis/` and `alerts/` folders are placeholders for later phases.
- Database migrations (Alembic) will be added once the schema stabilises.
- The collector service uses the same Docker image as the API but runs
  `python -m collectors.run_all` instead of `uvicorn`.
