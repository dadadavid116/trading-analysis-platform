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
- AI-assisted market summaries via Claude API
- Configurable price and liquidation alerts with full lifecycle management (create, list, delete)
- Telegram bot for remote monitoring and alert management (restricted to configured chat ID)
- Static API key access control protecting the dashboard and all API routes

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
`DASHBOARD_API_KEY` and `VITE_DASHBOARD_API_KEY` are intentionally empty —
authentication is disabled in local dev. Set them only for VPS deployment.

### 3. Start the stack

```bash
docker compose up --build
```

Docker Compose will:
1. Pull `postgres:16` and start the database.
2. Run `scripts/init_db.sql` automatically — this creates the core tables and seeds initial BTC data.
3. Build and start the FastAPI backend (`api`) once the database is healthy.
4. Start the `collector` service — streams live BTC market data from Binance into the database.
5. Start the `analysis` service — generates AI market summaries every 10 minutes (requires `ANTHROPIC_API_KEY`).
6. Start the `alerts` service — evaluates configured alert conditions every minute.
7. Build and start the React/Vite dev server (`frontend`) once the API is up.

First build takes a few minutes while Docker downloads base images and installs
dependencies. Subsequent starts (without `--build`) are much faster.

### 4. Open the app

| Service    | URL                        |
|------------|----------------------------|
| Frontend   | http://localhost:5173      |
| API docs   | http://localhost:8000/docs |
| API health | http://localhost:8000/health |

The frontend dev server proxies all `/api/*` requests to the backend automatically.

### 5. Verify data is flowing

**Option A — Browser**
Open http://localhost:5173. The Price, Liquidation, Order Book, and AI Analysis panels
should all populate with live BTC data within a minute of startup.

**Option B — API docs**
Open http://localhost:8000/docs and try these endpoints:
- `GET /api/price/latest` — most recent BTC candle
- `GET /api/price/history` — last 60 candles
- `GET /api/liquidations/recent` — last 20 liquidation events
- `GET /api/orderbook/snapshot` — current order book snapshot
- `GET /api/analysis/latest` — most recent AI-generated summary
- `GET /api/alerts/` — list of configured alerts

**Option C — Database directly**
```bash
docker compose exec db psql -U trading -d trading_db
```
Then run:
```sql
SELECT * FROM price_candles ORDER BY timestamp DESC LIMIT 5;
SELECT * FROM liquidations ORDER BY timestamp DESC LIMIT 5;
SELECT id, symbol, timestamp FROM orderbook_snapshots ORDER BY timestamp DESC LIMIT 3;
SELECT id, symbol, generated_at FROM analysis_summaries ORDER BY generated_at DESC LIMIT 3;
SELECT * FROM alerts;
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

## Deploying to a VPS

See [`docs/deployment.md`](docs/deployment.md) for the full guide.

Quick summary:

```bash
# On your VPS
git clone https://github.com/dadadavid116/trading-analysis-platform.git
cd trading-analysis-platform
cp .env.example .env
# Edit .env: set DOMAIN, POSTGRES_PASSWORD, ANTHROPIC_API_KEY,
#             CORS_ALLOWED_ORIGINS, DASHBOARD_API_KEY, VITE_DASHBOARD_API_KEY
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy handles HTTPS automatically via Let's Encrypt. No manual certificate setup needed.

---

## Project Structure

```
trading-analysis-platform/
├── backend/               # FastAPI app, collectors, models, routers, schemas
├── frontend/              # React + TypeScript + Vite dashboard
├── caddy/                 # Caddyfile — production reverse proxy config
├── scripts/               # init_db.sql — table creation and seed data
├── docs/                  # Architecture, deployment guide, roadmap
├── docker-compose.yml     # Local development stack
├── docker-compose.prod.yml  # Production VPS stack (Caddy + prod builds)
├── .env.example
└── README.md
```

See [`docs/architecture.md`](docs/architecture.md) for the full technical
blueprint and [`docs/deployment.md`](docs/deployment.md) for the VPS deployment
guide.

---

## Status

**Phase 12 complete — Access control / public hardening.**
The full stack runs locally via Docker Compose (seven services). Live BTC data
is collected from Binance WebSocket streams and displayed across all five
dashboard panels. An AI analysis worker generates market summaries every 10
minutes. An alert evaluation worker checks thresholds every minute. A Telegram
bot provides `/price`, `/analysis`, `/alerts`, `/delete_alert`, and `/status`
commands (restricted to the configured `TELEGRAM_CHAT_ID`), and sends alert
notifications to a configured chat. Alerts can be deleted from the dashboard or
via `DELETE /api/alerts/{id}`.

All `/api/*` routes are protected by a static API key (`X-API-Key` header).
Set `DASHBOARD_API_KEY` and `VITE_DASHBOARD_API_KEY` in `.env` before VPS
deployment. Auth is disabled automatically in local development (empty key).

A production deployment path exists via `docker-compose.prod.yml` with Caddy,
automatic HTTPS, and Nginx serving the frontend. See
[`docs/deployment.md`](docs/deployment.md) for the full VPS deployment guide.

**Still to come:** Telegram Mini App, Alembic migrations,
automated backups, CI/CD.

---

## Notes

- This repo is for original development.
- External repositories are used only as references for inspiration, not for direct copying.
- Secrets and real API keys must never be committed. Use `.env` (git-ignored).
