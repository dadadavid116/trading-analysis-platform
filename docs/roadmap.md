# Roadmap — Trading Analysis Platform

## Completed Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 1  | Project scaffold — Docker Compose, FastAPI, React/Vite, PostgreSQL | ✅ Done |
| 2  | Price collector — Binance WebSocket 1m candles, DB storage | ✅ Done |
| 3  | Price REST API — `/api/price/latest`, `/api/price/history` | ✅ Done |
| 4  | Price chart panel — candlestick chart with lightweight-charts | ✅ Done |
| 5  | Liquidation collector — Binance futures force orders stream | ✅ Done |
| 6  | Liquidation panel — recent events list + buy/sell counts | ✅ Done |
| 7  | Order book collector — Binance depth stream, DB snapshots | ✅ Done |
| 8  | Order book panel — bids/asks visualization | ✅ Done |
| 9  | Alerts system — price_above / price_below / liquidation_spike conditions, once/rearm modes | ✅ Done |
| 10 | Caddy reverse proxy, Basic Auth, Docker production config | ✅ Done |
| 11 | Claude AI analysis worker — scheduled market summaries | ✅ Done |
| 12 | Analysis panel — displays latest AI summary | ✅ Done |
| 13 | Strategy validator — OpenAI → Claude pipeline, structured output | ✅ Done |
| 14 | Secondary API key auth (X-API-Key) layer on all /api/* routes | ✅ Done |
| 15 | AI Chatbot panel — multi-turn conversation, model selector (Claude/GPT) | ✅ Done |
| 16 | K-line chart (candlestick) with configurable intervals | ✅ Done |
| 17 | ChatPanel markdown rendering + auto-scroll + auto-resize textarea | ✅ Done |
| 18 | Telegram notifications for alert triggers | ✅ Done |
| 19 | Chat session persistence — DB storage, session history sidebar | ✅ Done |
| 20 | Chat session save-to-file endpoint | ✅ Done |
| 21 | Service health panel — collector liveness indicators | ✅ Done |
| 22 | Analysis history — last N summaries in panel | ✅ Done |
| 23 | On-demand Claude chart analysis — technical indicators + direction bias | ✅ Done |
| 24 | RSI, MACD, EMA, Bollinger, price-level indicators fed into chart analysis | ✅ Done |
| 25 | Per-service health thresholds (price/liq/ob/funding/oi/ls-ratio) | ✅ Done |
| 26 | Liquidation stats — rolling 5m/15m/1H aggregates | ✅ Done |
| 27 | Derivatives panel — funding rate, open interest, long/short ratio | ✅ Done |
| 28 | Multi-asset universe — OKX as primary, BTC/ETH/SOL symbol registry, symbol selector, relative strength widget | ✅ Done |
| 29 | Operator Console — event log DB + SSE terminal feed, navigation tabs, scanner/candidate placeholders | ✅ Done |
| 30 | Market Scanner — momentum breakouts, liquidation clusters, OI divergence signals | ✅ Done |
| 31 | AI Trade Setup — Claude Haiku structured entry/SL/TP generator in Candidate panel | ✅ Done |
| 32 | Trade Journal — save AI setups, auto-outcome tracking (SL/TP1-3/expired) via price replay, win rate | ✅ Done |
| 33 | Mobile-responsive layout + PWA — 2-row compact header, bottom-tab navigation, service worker + manifest | ✅ Done |
| 34 | Trade Performance Dashboard — win rate, expectancy, per-symbol/bias breakdown, outcome bars, streak | ✅ Done |
| 35 | Background Scanner Worker — 5-min auto-scan loop, Telegram high-confidence alerts, 1H debounce, event log | ✅ Done |
| 36 | Multi-Timeframe Scanner — 15m/1H price momentum, candlestick patterns (doji/hammer/engulfing), volume surge | ✅ Done |

## Upcoming Phases

| Phase | Description | Status |
|-------|-------------|--------|
| 37 | TBD | Planned |
