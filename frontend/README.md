# Frontend — Trading Analysis Platform

This folder contains the React + TypeScript + Vite frontend for the trading analysis dashboard.

## Phase Status

Phase 3 (frontend scaffold) is in progress. The goal of this phase is to establish the project
structure, layout shell, and visible panel placeholders. Live API wiring, real charts, and
advanced state management are deferred to later phases.

## Folder Structure

```
frontend/
├── src/
│   ├── main.tsx              # React entry point — mounts App into the DOM
│   ├── App.tsx               # Root component — renders Layout with all panels
│   ├── api/
│   │   └── index.ts          # Starter API helper functions (fetch wrappers)
│   ├── components/
│   │   └── Layout.tsx        # Shared dashboard shell (header + panel grid)
│   └── panels/
│       ├── PricePanel.tsx        # Price / OHLCV data panel
│       ├── LiquidationPanel.tsx  # Liquidation events panel
│       ├── OrderBookPanel.tsx    # Order book / liquidity panel
│       ├── AlertsPanel.tsx       # [Later] Alerts panel — placeholder
│       └── AnalysisPanel.tsx     # [Later] AI analysis panel — placeholder
├── index.html                # Vite HTML entry point
├── package.json              # Dependencies and scripts
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite build configuration
├── Dockerfile                # Container build (dev or prod)
└── README.md                 # This file
```

## Running Locally (standalone)

> This is intended to be run via Docker Compose together with the backend.
> See the root `docker-compose.yml` (Phase 4) for the full local runtime setup.

To run the frontend in isolation during development:

```bash
cd frontend
npm install
npm run dev
```

The dev server starts at http://localhost:5173 by default.

## Panel Overview

| Panel              | Status        | Description                              |
|--------------------|---------------|------------------------------------------|
| PricePanel         | Scaffold      | Shows latest BTC price data (stub)       |
| LiquidationPanel   | Scaffold      | Shows recent liquidations (stub)         |
| OrderBookPanel     | Scaffold      | Shows order book snapshot (stub)         |
| AlertsPanel        | [Later]       | Placeholder — wired up in Alerts phase   |
| AnalysisPanel      | [Later]       | Placeholder — wired up in Analysis phase |

## Design Notes

- Panel-level data fetching is used for MVP simplicity. Each panel fetches its own data.
- A shared data layer (React Query, Zustand, context) may be added [Later] if complexity grows.
- Recharts is the current charting library. It can be swapped [Later] without changing panel structure.
- Styling is kept minimal and functional. No design system is used in this phase.

## Next Phase

After Docker / local runtime (Phase 4) is complete, the frontend will be connected to a live
backend via the `docker-compose.yml` and the mock data flow will be verified end-to-end.
