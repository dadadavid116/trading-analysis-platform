# Frontend — Trading Analysis Platform

This folder contains the React + TypeScript + Vite frontend for the trading analysis dashboard.

## Phase Status

Phase 8 (alerts) is complete. The full stack runs locally via Docker Compose with live BTC
data ingestion, scheduled AI analysis, and alert evaluation. All five dashboard panels are
implemented — Price, Liquidation, Order Book, Analysis, and Alerts.

## Folder Structure

```
frontend/
├── src/
│   ├── main.tsx              # React entry point — mounts App into the DOM
│   ├── App.tsx               # Root component — renders Layout with all panels
│   ├── api/
│   │   └── index.ts          # Typed API client functions (fetch wrappers)
│   ├── components/
│   │   └── Layout.tsx        # Shared dashboard shell (header + panel grid)
│   └── panels/
│       ├── PricePanel.tsx        # Price / OHLCV data panel
│       ├── LiquidationPanel.tsx  # Liquidation events panel
│       ├── OrderBookPanel.tsx    # Order book / liquidity panel
│       ├── AlertsPanel.tsx       # Alerts panel — list + inline create form
│       └── AnalysisPanel.tsx     # AI analysis panel — Claude-generated summaries
├── index.html                # Vite HTML entry point
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite build configuration
├── Dockerfile                # Container build (dev or prod)
└── README.md                 # This file
```

## Running Locally (standalone)

> This is intended to be run via Docker Compose together with the backend.
> See the root `docker-compose.yml` for the full local runtime setup.

To run the frontend in isolation during development:

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at http://localhost:5173 by default.

## Panel Overview

| Panel              | Status        | Description                                          |
|--------------------|---------------|------------------------------------------------------|
| PricePanel         | Complete      | Fetches and displays latest BTC OHLCV candle         |
| LiquidationPanel   | Complete      | Fetches and displays recent BTC liquidation events   |
| OrderBookPanel     | Complete      | Fetches and displays latest BTC order book snapshot  |
| AlertsPanel        | Complete      | Lists active alerts; inline form to create new ones  |
| AnalysisPanel      | Complete      | Displays latest Claude-generated market summary      |

## Design Notes

- Panel-level data fetching is used for MVP simplicity. Each panel manages its own data.
- Panels poll the API on a fixed interval (PricePanel: 15 s, Liquidation/OrderBook: 10 s).
  The "Loading…" spinner only appears on the initial page load — subsequent polls update
  data silently in the background.
- A shared data layer (React Query, Zustand, context) may be added [Later] if complexity grows.
- Recharts is the current charting library. It can be swapped [Later] without changing panel structure.
- Styling is kept minimal and functional. No design system is used in this phase.

## Next Phase

Phase 9 — VPS deployment. Caddy reverse proxy, production Dockerfile stages,
and domain/TLS configuration for running the full stack on a VPS.
