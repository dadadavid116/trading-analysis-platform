# Architecture — Trading Analysis Platform (MVP)

> Status: Draft — awaiting approval before any code is written.
>
> ---
>
> ## 1. Goals
>
> Build a personal, VPS-hosted crypto market monitoring platform that:
>
> - Collects live market data (price, liquidations, order-book/liquidity) for BTC.
> - - Stores historical data in PostgreSQL.
>   - - Exposes a REST API consumed by a React dashboard.
>     - - Runs analysis workers and fires alerts.
>       - - Supports an AI-assisted analysis panel (Claude API).
>         - - Runs entirely via Docker Compose — same config for local dev and VPS.
>          
>           - ---
>
> ## 2. High-Level Component Map
>
> ```
> ┌─────────────────────────────────────────────────────────┐
> │                     Docker Compose                      │
> │                                                         │
> │  ┌──────────────┐   ┌──────────────┐   ┌────────────┐  │
> │  │  collectors  │──▶│  PostgreSQL  │◀──│    api     │  │
> │  │  (workers)   │   │     (db)     │   │  (FastAPI) │  │
> │  └──────────────┘   └──────────────┘   └─────┬──────┘  │
> │                                               │         │
> │                                         ┌─────▼──────┐  │
> │                                         │  frontend  │  │
> │                                         │  (React /  │  │
> │                                         │  Nginx)    │  │
> │                                         └────────────┘  │
> └─────────────────────────────────────────────────────────┘
> ```
>
> Data flow:
> 1. Collectors poll/stream exchange APIs → write raw + processed data to PostgreSQL.
> 2. 2. FastAPI reads from PostgreSQL → serves REST endpoints to the frontend.
>    3. 3. React dashboard fetches from the API and renders panels.
>       4. 4. Alert workers query the DB on a schedule → send notifications.
>          5. 5. Analysis worker calls the Claude API → stores summaries → API exposes them.
>            
>             6. ---
>            
>             7. ## 3. Folder Layout
>            
>             8. ```
> trading-analysis-platform/
> ├── backend/
> │   ├── app/
> │   │   ├── main.py                 # FastAPI entry point
> │   │   ├── config.py               # Settings loaded from env vars
> │   │   ├── database.py             # SQLAlchemy engine + session
> │   │   ├── models/                 # SQLAlchemy ORM models
> │   │   │   ├── __init__.py
> │   │   │   ├── price.py
> │   │   │   ├── liquidation.py
> │   │   │   ├── orderbook.py
> │   │   │   └── alert.py
> │   │   ├── routers/                # FastAPI route modules
> │   │   │   ├── __init__.py
> │   │   │   ├── price.py
> │   │   │   ├── liquidations.py
> │   │   │   ├── orderbook.py
> │   │   │   ├── alerts.py
> │   │   │   └── analysis.py
> │   │   └── schemas/                # Pydantic response schemas
> │   │       ├── __init__.py
> │   │       ├── price.py
> │   │       └── alert.py
> │   ├── collectors/                 # Data collection workers (run independently)
> │   │   ├── __init__.py
> │   │   ├── base.py                 # Abstract base collector class
> │   │   ├── price_collector.py      # Polls/streams price from exchange WS
> │   │   ├── liquidation_collector.py
> │   │   └── orderbook_collector.py
> │   ├── analysis/                   # AI-assisted analysis logic
> │   │   ├── __init__.py
> │   │   └── claude_client.py        # Calls Claude API, stores summaries
> │   ├── alerts/                     # Alert evaluation logic
> │   │   ├── __init__.py
> │   │   └── evaluator.py            # Checks conditions, triggers notifications
> │   ├── migrations/                 # Alembic DB migrations
> │   │   └── versions/
> │   ├── requirements.txt
> │   └── Dockerfile
> │
> ├── frontend/
> │   ├── src/
> │   │   ├── main.tsx                # React entry point
> │   │   ├── App.tsx
> │   │   ├── api/                    # Typed API client functions
> │   │   │   └── index.ts
> │   │   ├── components/             # Shared UI components
> │   │   │   ├── Layout.tsx
> │   │   │   └── AlertBadge.tsx
> │   │   └── panels/                 # One component per dashboard panel
> │   │       ├── PricePanel.tsx
> │   │       ├── LiquidationPanel.tsx
> │   │       ├── OrderBookPanel.tsx
> │   │       ├── AlertsPanel.tsx
> │   │       └── AnalysisPanel.tsx
> │   ├── public/
> │   ├── index.html
> │   ├── package.json
> │   ├── tsconfig.json
> │   ├── vite.config.ts
> │   └── Dockerfile
> │
> ├── docs/
> │   ├── architecture.md             # This file
> │   └── roadmap.md
> │
> ├── scripts/                        # One-off helper scripts (seed data, etc.)
> │
> ├── tests/
> │   ├── backend/                    # Pytest tests
> │   └── frontend/                   # Vitest tests
> │
> ├── docker-compose.yml              # Main Compose file (local + VPS)
> ├── .env.example                    # All required env vars documented here
> ├── .gitignore
> ├── CLAUDE.md
> └── README.md
> ```
>
> ---
>
> ## 4. Services in Docker Compose
>
> | Service      | Image / Build       | Port (internal) | Notes                              |
> |--------------|---------------------|-----------------|------------------------------------|
> | `db`         | `postgres:16`       | 5432            | Persistent volume for data         |
> | `api`        | `./backend`         | 8000            | FastAPI + Uvicorn                  |
> | `collector`  | `./backend`         | —               | Runs collector scripts, no HTTP    |
> | `analysis`   | `./backend`         | —               | Scheduled analysis worker          |
> | `frontend`   | `./frontend`        | 3000 (dev) / 80 | Vite dev server or Nginx for prod  |
>
> All services share one Docker network. The `api`, `collector`, and `analysis` services use the same backend image but different `CMD` entries. Only `frontend` (and optionally `api`) are exposed on the host.
>
> ---
>
> ## 5. Backend Details
>
> **Framework:** FastAPI (Python 3.11+)
> **ORM:** SQLAlchemy 2.x with Alembic for migrations
> **Async:** `asyncpg` driver for PostgreSQL; collectors use `asyncio` + `websockets`
> **Config:** All settings via environment variables, loaded with `pydantic-settings`
>
> ### Collector pattern
>
> Each collector inherits from a `BaseCollector` class with `start()` and `stop()` methods. The collector connects to an exchange WebSocket (Binance for MVP), parses the stream, and upserts rows into the DB. Collectors run as long-lived async tasks, not HTTP servers.
>
> ### API endpoints (MVP)
>
> ```
> GET  /api/price/latest          → latest OHLCV candle for BTC
> GET  /api/price/history         → paginated candle history
> GET  /api/liquidations/recent   → recent liquidation events
> GET  /api/orderbook/snapshot    → latest order-book snapshot
> GET  /api/alerts/               → list of configured alerts + status
> POST /api/alerts/               → create a new alert
> GET  /api/analysis/latest       → most recent AI-generated summary
> ```
>
> ---
>
> ## 6. Frontend Details
>
> **Framework:** React 18 + TypeScript
> **Build tool:** Vite
> **Charts:** Recharts (lightweight, TypeScript-native)
> **HTTP client:** Axios or native `fetch` wrapped in `src/api/index.ts`
> **Layout:** Single-page app, fixed sidebar + panel grid
>
> Each panel in `src/panels/` is self-contained: it fetches its own data from the API and renders its own chart or table. Shared layout and navigation live in `src/components/`.
>
> ---
>
> ## 7. Database Schema (MVP)
>
> ```sql
> -- Price candles (1m OHLCV)
> price_candles (id, symbol, timestamp, open, high, low, close, volume)
>
> -- Liquidation events
> liquidations (id, symbol, timestamp, side, price, quantity, exchange)
>
> -- Order-book snapshots (top N levels)
> orderbook_snapshots (id, symbol, timestamp, bids JSONB, asks JSONB)
>
> -- Alerts
> alerts (id, name, condition_type, threshold, symbol, is_active, triggered_at)
>
> -- AI analysis summaries
> analysis_summaries (id, symbol, generated_at, summary_text, model_used)
> ```
>
> ---
>
> ## 8. Deployment (VPS)
>
> 1. Clone the repo on the VPS.
> 2. 2. Copy `.env.example` → `.env` and fill in real values.
>    3. 3. Run `docker compose up -d --build`.
