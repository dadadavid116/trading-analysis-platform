# Trading Analysis Platform

A VPS-hosted crypto market monitoring platform with dashboard panels for
price, liquidations, order book, alerts, and AI-assisted analysis.

## Goal

Build a personal market intelligence dashboard for BTC first, then evolve it
into a shareable and customisable platform.

## MVP Features

- Live market monitoring (price, liquidations, order book)
- Multiple dashboard panels
- Historical data storage in PostgreSQL
- AI-assisted market summaries (Claude API) — coming soon
- Alerts — coming soon

## Stack

| Layer    | Technology                   |
|----------|------------------------------|
| Backend  | Python / FastAPI             |
| Frontend | React + TypeScript + Vite    |
| Database | PostgreSQL 16                |
| Runtime  | Docker Compose (local + VPS) |

---

## Running Locally with Docker Compose

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose plugin on Linux)
- Git

### 1. Clone the repo

```bash
git clone https://github.com/dadadavid116/trading-analysis-platform.git
cd trading-analysis-platform
```

### 2. Create your `.env` file

```bash
cp .env.example .env
```

The defaults in `.env.example` work out of the box for local development.
You only need to change `POSTGRES_PASSWORD` if you want a stronger password.

### 3. Start the stack

```bash
docker compose up --build
```

Docker Compose will:
1. Pull `postgres:16` and start the database.
2. Run `scripts/init_db.sql` automatically — this creates the tables and seeds BTC mock data.
3. Build and start the FastAPI backend (`api`) once the database is healthy.
4. Build and start the React/Vite dev server (`frontend`) once the API is up.

First build takes a few minutes while Docker downloads base images and installs
dependencies. Subsequent starts (without `--build`) are much faster.

### 4. Open the app

| Service  | URL                        |
|----------|----------------------------|
| Frontend | http://localhost:5173      |
| API docs | http://localhost:8000/docs |
| API root | http://localhost:8000      |

The frontend dev server proxies all `/api/*` requests to the backend automatically.

### 5. Verify mock data is flowing

**Option A — Browser**
Open http://localhost:5173. The Price, Liquidation, and Order Book panels should
all show seeded BTC data immediately.

**Option B — API docs**
Open http://localhost:8000/docs and try these endpoints:
- `GET /api/price/latest` — returns the most recent BTC candle
- `GET /api/price/history` — returns the last 60 candles
- `GET /api/liquidations/recent` — returns the last 20 liquidation events
- `GET /api/orderbook/snapshot` — returns the current order book snapshot

**Option C — Database directly**
```bash
docker compose exec db psql -U trading -d trading_db
```
Then run:
```sql
SELECT * FROM price_candles ORDER BY timestamp DESC LIMIT 5;
SELECT * FROM liquidations ORDER BY timestamp DESC LIMIT 5;
SELECT id, symbol, timestamp FROM orderbook_snapshots;
```

### 6. Stop the stack

```bash
docker compose down
```

PostgreSQL data is stored in the `postgres_data` Docker volume and survives
container restarts. To wipe the database and re-seed from scratch:

```bash
docker compose down -v
docker compose up --build
```

### Useful commands

```bash
# View logs from all services
docker compose logs -f

# View logs from one service only
docker compose logs -f api

# Rebuild a single service after code changes
docker compose up --build api

# Open a psql shell in the running database container
docker compose exec db psql -U trading -d trading_db
```

---

## Project Structure

```
trading-analysis-platform/
├── backend/          # FastAPI app, collectors, models, routers, schemas
├── frontend/         # React + TypeScript + Vite dashboard
├── scripts/          # init_db.sql — table creation and seed data
├── docs/             # Architecture and roadmap docs
├── docker-compose.yml
├── .env.example
└── README.md
```

See [`docs/architecture.md`](docs/architecture.md) for the full technical
blueprint and build order.

---

## Status

**Phase 7 complete — AI-assisted analysis worker.**
The full stack runs locally via Docker Compose. Live BTC data is collected from
Binance WebSocket streams and stored continuously. An AI analysis worker calls
the Claude API every 10 minutes to generate a market summary, which is stored
in the database and displayed in the Analysis panel.

Next: Phase 8 — Alerts (evaluation logic, DB table, API + panel).

---

## Notes

- This repo is for original development.
- External repositories are used only as references for inspiration, not for direct copying.
- Secrets and real API keys must never be committed. Use `.env` (git-ignored).
