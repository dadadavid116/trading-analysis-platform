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
| 37 | Key S&R Levels — pivot clustering, `/price/levels` endpoint, chart price lines, scanner signal | ✅ Done |
| 38 | Funding Rate & OI History Sparklines — 24H time-series charts in Derivatives panel | ✅ Done |
| 39 | Chart Indicator Overlays — EMA 20/50/200 + VWAP line series with toggle chips | ✅ Done |
| 40 | Volume Histogram + Bollinger Bands — chart overlays with direction-colored volume bars and BB(20,2) | ✅ Done |
| 41 | RSI(14) Subplot — separate chart pane below price chart with 30/70 reference lines and time scale sync | ✅ Done |
| 42 | MACD(12,26,9) Subplot — histogram + MACD/signal lines in a third chart pane with three-way time scale sync | ✅ Done |
| 43 | Position Size Calculator — account/risk/leverage inputs, notional/margin/TP profit rows in Candidate panel | ✅ Done |
| 44 | StochRSI(3,3,14,14) Subplot — %K/%D lines in a fourth chart pane with 80/20 reference lines and four-way time scale sync | ✅ Done |
| 45 | CVD (Cumulative Volume Delta) Subplot — cumulative signed-volume line with zero reference, five-way time scale sync | ✅ Done |
| 46 | Daily Pivot Points — PP/R1-R3/S1-S3 price lines from yesterday's OHLC, toggle chip, color-coded by level | ✅ Done |
| 47 | Market Heatmap — BTC/ETH/SOL × 5m/15m/1H/4H/24H % change color grid, OperatorConsole tab + mobile | ✅ Done |
| 48 | Ichimoku Cloud — Tenkan/Kijun/Span A/Span B/Chikou as chart overlay, Span A/B projected 26 bars forward | ✅ Done |
| 49 | Fear & Greed Index — alternative.me proxy endpoint, gauge bar in Derivatives panel | ✅ Done |
| 50 | Asset Correlation Matrix — 30D Pearson correlation of BTC/ETH/SOL daily returns, color-coded 3×3 grid in Heatmap panel | ✅ Done |
| 51 | Global Market Stats — BTC/ETH dominance %, total market cap, 24H change via CoinGecko, summary bar in Heatmap panel | ✅ Done |
| 52 | Crypto News Feed — CoinTelegraph + CoinDesk RSS proxy, scrollable headlines panel, News tab in OperatorConsole | ✅ Done |
| 53 | Portfolio Tracker — add long/short positions with entry/size, live P&L from price feed, total PnL row, localStorage persistence | ✅ Done |
| 54 | Multi-Timeframe Signal Matrix — RSI(14) + EMA20 trend arrow for BTC/ETH/SOL × 15m/1H/4H/1D, color-coded grid, Signals tab | ✅ Done |
| 55 | Funding Rate Alerts — funding_rate_above / funding_rate_below conditions, % threshold, evaluator + UI | ✅ Done |
| 56 | Multi-Symbol Alerts — price/liquidation/funding_rate alerts on BTC/ETH/SOL, symbol selector in form, symbol column in list | ✅ Done |
| 57 | Live Price Ticker — BTC/ETH/SOL price + 24H % change in header, 5s poll, green/red flash on price change | ✅ Done |
| 58 | Equity Curve — SVG running-R chart in Performance panel, area fill + zero line + final R badge | ✅ Done |
| 59 | % Price Change Alerts — price_spike_up / price_spike_down conditions, % threshold + window, DB candle lookback | ✅ Done |
| 60 | Journal CSV Export + Outcome Filter — ↓ CSV download button, All/Open/Wins/Losses/Expired filter bar with counts | ✅ Done |
| 61 | Chart x-axis alignment — `minimumWidth: 65` on all 5 chart price scales; compact OHLCV strip replaces 7-row data grid | ✅ Done |
| 62 | OrderBook + Derivatives panel scrollability — `overflowY: auto` scrollable body wrapper below sticky title so content is never clipped | ✅ Done |
| 63 | Heikin-Ashi toggle — HA chip in overlay row, `computeHA` function, live-candle HA update, localStorage persistence | ✅ Done |
| 64 | Alert history log — Active/History tabs in AlertsPanel, service filter on /api/events/, FIRED/REARM badges | ✅ Done |
| 65 | Candlestick pattern markers — Doji/Hammer/Shooting Star/Bullish+Bearish Engulfing pins on chart, Patterns toggle chip | ✅ Done |
| 66 | AI Journal Insights — POST /api/journal/insights, Claude Haiku analyzes trade patterns/biases/suggestions, ✦ AI Insights button in PerformancePanel | ✅ Done |
| 67 | Custom webhook notifications — per-alert optional webhook URL, JSON POST on trigger alongside Telegram, DB migration, Hook column in alert table | ✅ Done |
| 68 | OI spike alert — `oi_spike` condition type, ±% OI change over window, evaluator helper, schema validator, AlertsPanel UI | ✅ Done |
| 69 | User chart annotations — click chart to mark price levels with custom label + color, stored per-symbol in localStorage, managed via inline list | ✅ Done |
| 70 | Journal trade notes — optional notes textarea in Candidate panel before Save; stored in DB; shown in expanded journal card; included in CSV export | ✅ Done |
| 71 | Open trade live monitor — SL→TP1 progress bar on every pending journal card; white price marker + orange entry marker; green/red fill; 10s price polling | ✅ Done |
| 72 | Journal trade-close notifications — background worker detects SL/TP/expiry on pending setups, fires Telegram + `trade_closed` event once per trade; `notified_outcome` column + silent first-pass backfill; notifier status endpoint + bell badge | ✅ Done |
| 73 | Information Architecture Reset — third workspace "Context Desk" (Market Summary / News / Market Map); relocated News + Heatmap out of Operator Console tabs; mounted orphaned AnalysisPanel; renamed analyses → "Scheduled Market Summary" + "Chart Trade Setup Analysis"; 3-page nav (Dashboard / Console / Context) | ✅ Done |
| 74 | Design System Foundation — `src/theme/` tokens (colors/space/typography/radius/shadow/density) + primitives (Card, Button, Badge, Tabs, SectionHeader, MetricCard, ScoreBar, FactorCard, WorkspaceShell); Context Desk refactored onto WorkspaceShell; panelStyles flagged legacy. No visual change to existing panels | ✅ Done |
| 75 | Context Desk Shell — 6-tab workspace (Overview / Crypto / Macro / News / Market Map / Market Summary) built from existing data only: regime header + Context Score (PREVIEW heuristic, badged) + Asset Signal Tower (live scanner), crypto factor cards (Fear&Greed, dominance, funding/OI/LS, rel-strength), macro placeholder for Phase 80–81. No new collectors/endpoints | ✅ Done |
| 76 | Schema & Data-Foundation Hardening — Alembic is single source of truth. Revisions 0005 (alerts.webhook_url) + 0006 (journal_entries table + indexes on liquidations/journal_entries). Removed startup create_all + ad-hoc ALTER from main.py. deploy.sh runs alembic upgrade head automatically | ✅ Done |
| 77 | OKX Perpetual Alignment Completion — chart analysis fetches from OKX perp (was Binance spot BTCUSDT); analyze_chart is symbol-aware; symbol passed end-to-end from PricePanel → API → service. Source badges: BINANCE FUTURES on Derivatives + Liquidation; OKX PERP on Order Book | ✅ Done |
| 78 | Symbol Registry as Single Source of Truth — `symbol_registry.py` shared service (retry + fallback); all 4 collectors load instruments from DB; scanner router + worker load symbols from DB; chat.py is symbol-aware (market context + tool calls); symbol selector shows on all pages; activeSymbol flows to ChatPanel/OperatorConsole/ContextDesk | ✅ Done |
| 79 | Crypto Factor Collector Pack — `factor_observations` + `regime_snapshots` tables; 7 normalized factors (funding, OI delta, L/S ratio, liq pressure, OB imbalance, Fear&Greed, total mcap 24H); deterministic regime (risk_on/neutral/fragile/risk_off/crowded_long/crowded_short); Derivatives Pressure + Liquidity Pressure sub-scores; `/api/factors/snapshot` endpoint; Context Desk Crypto tab + Overview upgraded from heuristic PREVIEW to live deterministic scoring | ✅ Done |
