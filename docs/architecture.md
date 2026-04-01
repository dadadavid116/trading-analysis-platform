# Architecture — Trading Analysis Platform (MVP)

> **Status: Phase 12 complete — Access control / public hardening.**
> This document reflects the current implemented architecture. Items marked **[Later]**
> are planned but not yet implemented. See Section 11 (Build Order) for the phase sequence.

---

## 1. Goals

Build a personal, VPS-hosted crypto market monitoring platform that:

- Collects live market data (price, liquidations, order-book/liquidity) for BTC.
- Stores historical data in PostgreSQL.
- Exposes a REST API consumed by a React dashboard.
- Runs analysis workers and fires alerts.
- Supports an AI-assisted analysis panel (Claude API).
- Runs entirely via Docker Compose — same config for local dev and VPS.

---

## 2. High-Level Component Map

```
┌─────────────────────────────────────────────────────────┐
│                     Docker Compose                      │
│                                                         │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
│  │  collectors  │──▶│  PostgreSQL  │◀──│    api     │  │
│  │  (workers)   │   │     (db)     │   │  (FastAPI) │  │
│  └──────────────┘   └──────────────┘   └─────┬──────┘  │
│                                               │         │
│                                         ┌─────▼──────┐  │
│                                         │  frontend  │  │
│                                         │  (React /  │  │
│                                         │  Nginx)    │  │
│                                         └────────────┘  │
└─────────────────────────────────────────────────────────┘
```

Data flow:
1. Collectors poll/stream exchange APIs → write raw + processed data to PostgreSQL.
2. FastAPI reads from PostgreSQL → serves REST endpoints to the frontend.
3. React dashboard fetches from the API and renders panels.
4. Alert worker queries DB on a schedule → logs notifications when thresholds are crossed.
5. Analysis worker calls Claude API → stores summaries → API exposes them in the Analysis panel.

---

## 3. Folder Layout

The layout below represents the full intended structure. Files and folders marked **[Later]**
should be created as empty placeholders during scaffolding, but not implemented yet.

```
trading-analysis-platform/
├── backend/
│   ├── app/
│   │   ├── main.py                 # FastAPI entry point
│   │   ├── config.py               # Settings loaded from env vars
│   │   ├── database.py             # SQLAlchemy engine + session
│   │   ├── models/                 # SQLAlchemy ORM models
│   │   │   ├── __init__.py
│   │   │   ├── price.py
│   │   │   ├── liquidation.py
│   │   │   ├── orderbook.py
│   │   │   └── alert.py            # [Later]
│   │   ├── routers/                # FastAPI route modules
│   │   │   ├── __init__.py
│   │   │   ├── price.py
│   │   │   ├── liquidations.py
│   │   │   ├── orderbook.py
│   │   │   ├── alerts.py           # [Later]
│   │   │   └── analysis.py         # [Later]
│   │   └── schemas/                # Pydantic response schemas
│   │       ├── __init__.py
│   │       ├── price.py
│   │       └── alert.py            # [Later]
│   ├── collectors/                 # Data collection workers
│   │   ├── __init__.py
│   │   ├── base.py                 # [Later] Abstract base collector class
│   │   ├── price_collector.py      # Live Binance WS collector
│   │   ├── liquidation_collector.py
│   │   └── orderbook_collector.py
│   ├── analysis/                   # [Later] AI-assisted analysis logic
│   │   ├── __init__.py
│   │   └── claude_client.py
│   ├── alerts/                     # [Later] Alert evaluation logic
│   │   ├── __init__.py
│   │   └── evaluator.py
│   ├── migrations/                 # [Later] Alembic DB migrations
│   │   └── versions/
│   ├── requirements.txt
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx                # React entry point
│   │   ├── App.tsx
│   │   ├── api/                    # Typed API client functions
│   │   │   └── index.ts
│   │   ├── components/             # Shared UI components
│   │   │   ├── Layout.tsx
│   │   │   └── AlertBadge.tsx      # [Later]
│   │   └── panels/                 # One component per dashboard panel
│   │       ├── PricePanel.tsx
│   │       ├── LiquidationPanel.tsx
│   │       ├── OrderBookPanel.tsx
│   │       ├── AlertsPanel.tsx     # [Later]
│   │       └── AnalysisPanel.tsx   # [Later]
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   └── Dockerfile
│
├── docs/
│   ├── architecture.md             # This file
│   └── roadmap.md
│
├── scripts/                        # One-off helper scripts (seed data, etc.)
│
├── tests/
│   ├── backend/                    # Pytest tests
│   └── frontend/                   # Vitest tests
│
├── docker-compose.yml              # Main Compose file (local + VPS)
├── .env.example                    # All required env vars documented here
├── .gitignore
├── CLAUDE.md
└── README.md
```

---

## 4. Services in Docker Compose

| Service      | Image / Build       | Port (internal) | Phase     | Notes                                          |
|--------------|---------------------|-----------------|-----------|------------------------------------------------|
| `db`         | `postgres:16`       | 5432            | Complete  | Persistent volume; never exposed publicly      |
| `api`        | `./backend`         | 8000            | Complete  | FastAPI + Uvicorn                              |
| `collector`  | `./backend`         | —               | Complete  | Runs all three Binance WS collectors           |
| `analysis`   | `./backend`         | —               | Complete  | Scheduled Claude API analysis worker           |
| `alerts`     | `./backend`         | —               | Complete  | Alert evaluation worker + Telegram notif       |
| `telegram`   | `./backend`         | —               | Complete  | Telegram bot (long polling; optional)          |
| `frontend`   | `./frontend`        | 5173 (dev) / 80 | Complete  | Vite dev server or Nginx static (prod)         |
| `caddy`      | `caddy:2-alpine`    | 80, 443         | Complete  | Production only — reverse proxy + HTTPS        |

All services share one Docker network. `api`, `collector`, `analysis`, and `alerts` use the
same backend image but different `CMD` entries. In production, only `caddy` is exposed publicly.

---

## 5. Backend Details

**Framework:** FastAPI (Python 3.11+)
**ORM:** SQLAlchemy 2.x (raw SQL migrations for scaffold; Alembic wired up **[Later]**)
**Async:** `asyncpg` driver for PostgreSQL; collectors use `asyncio` + `websockets`
**Config:** All settings via environment variables, loaded with `pydantic-settings`

### Collector pattern

For the immediate scaffold, each collector will be a standalone async script that connects
to the Binance WebSocket, parses the stream, and writes rows to the DB directly.

**[Later]** A `BaseCollector` abstract class (with shared `start()`/`stop()` lifecycle methods)
will be introduced once more than one collector is running reliably, to reduce duplication.

### API endpoints

The following endpoints are the target shape. For the immediate scaffold, price and
order-book endpoints will be wired to real or mock data first. Alerts and analysis
endpoints are **[Later]**.

```
GET  /api/price/latest          → latest OHLCV candle for BTC        [Immediate]
GET  /api/price/history         → paginated candle history            [Immediate]
GET  /api/liquidations/recent   → recent liquidation events           [Immediate]
GET  /api/orderbook/snapshot    → latest order-book snapshot          [Immediate]
GET    /api/alerts/             → list of configured alerts + status  [Complete]
POST   /api/alerts/             → create a new alert                  [Complete]
DELETE /api/alerts/{id}         → delete an alert by ID               [Complete]
GET    /api/analysis/latest     → most recent AI-generated summary    [Complete]
```

---

## 6. Frontend Details

**Framework:** React 18 + TypeScript
**Build tool:** Vite
**Charts:** Recharts (lightweight, TypeScript-native). This is an MVP choice — if the dashboard
later requires more advanced trading-style visualization (candlestick charts, depth charts,
heatmaps), the charting library can be swapped without changing the panel structure.
**HTTP client:** Native `fetch` wrapped in `src/api/index.ts`
**Layout:** Single-page app, fixed sidebar + panel grid

Each panel in `src/panels/` fetches its own data from the API directly. This panel-level
data fetching pattern is acceptable for MVP and keeps each panel self-contained and easy
to reason about. A shared data layer (e.g. React Query, Zustand, or a context store) may
be introduced **[Later]** if cross-panel data sharing or complexity grows.

Panels marked **[Later]** (AlertsPanel, AnalysisPanel) should be created as visible
placeholders in the initial scaffold so the layout is complete, but need not be wired to
live data yet.

---

## 7. Database Schema (MVP)

Tables for the immediate scaffold: `price_candles`, `liquidations`, `orderbook_snapshots`.
The `alerts` and `analysis_summaries` tables are defined here for reference but are
**[Later]** implementation targets.

```sql
-- [Immediate] Price candles (1m OHLCV)
price_candles (id, symbol, timestamp, open, high, low, close, volume)

-- [Immediate] Liquidation events
liquidations (id, symbol, timestamp, side, price, quantity, exchange)

-- [Immediate] Order-book snapshots (top N levels)
orderbook_snapshots (id, symbol, timestamp, bids JSONB, asks JSONB)

-- [Later] Alerts
alerts (id, name, condition_type, threshold, symbol, is_active, triggered_at)

-- [Later] AI analysis summaries
analysis_summaries (id, symbol, generated_at, summary_text, model_used)
```

For the scaffold phase, tables will be created with a plain SQL init script run at
container startup. Alembic migration infrastructure is a **[Later]** addition once the
schema stabilises.

---

## 8. Deployment (VPS)

1. Clone the repo on the VPS.
2. Copy `.env.example` → `.env` and fill in real values (domain, DB password, API key).
3. Run `docker compose -f docker-compose.prod.yml up -d --build`.
4. Caddy (inside Compose) handles HTTPS via Let's Encrypt automatically:
   - `https://yourdomain.com/api/*` → FastAPI backend (`api:8000`, internal)
   - `https://yourdomain.com/*` → Nginx-served React app (`frontend:80`, internal)

No Kubernetes, no CI/CD pipeline for MVP. Manual `git pull && docker compose -f docker-compose.prod.yml up -d --build` for updates.

See [`docs/deployment.md`](deployment.md) for the full step-by-step VPS guide.

---

## 9. Environment Variables (.env.example)

```dotenv
# PostgreSQL
POSTGRES_USER=trading
POSTGRES_PASSWORD=changeme
POSTGRES_DB=trading_db
DATABASE_URL=postgresql+asyncpg://trading:changeme@db:5432/trading_db

# API
API_HOST=0.0.0.0
API_PORT=8000

# Exchange (Binance public WS — no key needed for market data)
EXCHANGE=binance
SYMBOL=BTCUSDT

# Claude API (for analysis panel) [Later]
ANTHROPIC_API_KEY=

# Alerts (optional — Telegram or email) [Later]
ALERT_TELEGRAM_TOKEN=
ALERT_TELEGRAM_CHAT_ID=
```

---

## 10. What Is Explicitly Out of Scope for MVP

- Multi-asset support (only BTC for now)
- User authentication / multi-user
- Automated CI/CD pipelines
- Mobile layout
- Multi-model AI support
- Advanced backtesting or strategy execution

These will be addressed in post-MVP phases documented in `docs/roadmap.md`.

---

## 11. Build Order / Phase Sequence

1. ✅ **Backend scaffold** — FastAPI skeleton, DB models, stub endpoints.
2. ✅ **Frontend scaffold** — Vite + React + TypeScript, panel layout, placeholders.
3. ✅ **Docker / local runtime** — `docker-compose.yml` with db, api, frontend.
4. ✅ **First end-to-end mock data flow** — Seed DB, confirm full stack renders.
5. ✅ **Live collectors** — Real Binance WebSocket collectors for price, liquidations, order-book.
6. ✅ **Analysis worker** — Claude API integration; summaries stored and surfaced in Analysis panel.
7. ✅ **Alerts** — Alert evaluation logic, DB table, API endpoints, AlertsPanel with create form.
8. ✅ **Phase 8 cleanup** — Validation, trigger_mode (once/rearm), CORS config, TS fixes.
9. ✅ **VPS deployment foundation** — `docker-compose.prod.yml`, Caddy reverse proxy, production Nginx config, deployment guide.
10. ✅ **Telegram bot** — Long-polling bot with `/price`, `/analysis`, `/alerts`, `/status` commands; alert notifications via Telegram when triggered.
11. ✅ **Alert lifecycle** — `DELETE /api/alerts/{id}` endpoint; delete button in AlertsPanel; `/delete_alert <id>` bot command; bot commands restricted to configured `TELEGRAM_CHAT_ID`.
12. ✅ **Access control / public hardening** — Static API key (`DASHBOARD_API_KEY` / `X-API-Key` header) protects all `/api/*` routes; frontend sends key via `VITE_DASHBOARD_API_KEY`; auth disabled by default for local dev; startup warning when key is not set; Telegram bot logs unauthorized command attempts.

**Remaining for post-MVP:**
- Telegram Mini App
- Telegram webhook mode and richer bot controls
- Multi-user support
- Alembic migrations
- Automated backups
- CI/CD pipeline
