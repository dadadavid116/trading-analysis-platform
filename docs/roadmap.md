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

## All Phases — Completed

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
| 80 | Macro Source Decision Matrix — sourcing spec for all macro items; yfinance (DXY/Gold/SPX/NDX/VIX, no key) + FRED API (yields/rates/inflation/labor, free key); MOVE omitted (HY spread proxy); FOMC dates hardcoded in `macro_config.py`; `FRED_API_KEY` in `.env.example`; decisions D15–D21 in `decision_log.md` | ✅ Done |
| 81 | Macro Factor Collector Pack — `macro_observations` table; 7 factors (DXY/SPX/VIX/Gold via yfinance; UST10Y/HY spread/CPI via FRED); 15-min DB cache on-demand; `GET /api/macro/snapshot` with FOMC countdown; `MacroFactorsSection.tsx` live; FRED factors absent gracefully if key not set | ✅ Done |
| 82 | Factor Scoring Engine v1 — `factor_scores` + `factor_weights` tables; `context_scorer.py` blends crypto (60%) + macro (40%) into unified Context Score -100..+100; `/api/context/score` + `/api/context/history`; OverviewSection upgraded to live score with consensus bar + factor contribution cards; display-only v1 | ✅ Done |
| 83 | Context Desk v1 Complete — `context_ai.py` AI narrative service (Claude Haiku, 30-min cache); `/api/context/events` (FOMC/CPI/NFP); `/api/context/ai-summary` (AI context card with Refresh); OverviewSection: event calendar strip + macro signal rows (DXY/Gold/UST10Y/SPX) + AI card; placeholder text cleaned | ✅ Done |
| 84 | AI Analysis Separation and Upgrade — `ChartAnalysisRequest` extended with `trader_style`/`risk_per_trade`/`target_rr`; `analyze_chart` injects TRADER PROFILE context block; button renamed "✦ Trade Setup"; modal renamed "Trade Setup Preferences" + trader profile dropdowns (Style/Risk%/Min R:R) above indicator list; Clear button removes analysis price lines; "Analyzed at HH:MM" timestamp shown after run; localStorage-persisted `tap_trader_prefs` | ✅ Done |
| 85 | Persisted Signal Engine v1 — `signals` + `signal_events` tables (Alembic 0010); `signal_engine.py` lifecycle service (create/activate/invalidate/expire/price-check); scanner worker auto-persists high-confidence signals on each alert; `GET /api/signals/` + `POST /api/signals/{id}/activate` + `POST /api/signals/{id}/invalidate`; context score snapshot captured at creation; `SignalQueuePanel.tsx` with Live/Closed/All filter tabs, signal cards (direction, levels, scores, labels), Activate + Invalidate buttons; "Queue" tab in OperatorConsole right column | ✅ Done |
| 86 | Account State Foundation — `account_config` (single-row capital + risk params) + `account_snapshots` + `open_positions` tables (Alembic 0011); `account_state.py` service with equity ledger, exposure calculation, position CRUD, snapshot trigger; `/api/account/state`, `/api/account/config`, `/api/account/positions` + close/cancel endpoints; `AccountStatePanel.tsx` with equity summary, risk bar, risk limits, open position cards, inline config modal; "Account" tab in OperatorConsole right column | ✅ Done |
| 87 | Risk Engine v1 — Alembic 0012: `kill_switch_active` BOOLEAN on `account_config`; `risk_engine.py`: deterministic trade assessment (kill switch, per-trade risk %, open risk headroom, daily drawdown gate) + auto position sizing (risk_usd / sl_distance); `set_kill_switch()` in `account_state.py`; `/api/risk/assess`, `/api/risk/summary`, `/api/risk/kill-switch` endpoints; `RiskEnginePanel.tsx` with kill switch toggle (confirm dialog), live risk status bars (open risk + daily drawdown, traffic-light colors), trade sizer form (entry/SL/size/risk% inputs, verdict badge, suggested size, reasons/warnings); "Risk" tab in OperatorConsole right column + mobile | ✅ Done |
| 88 | Execution & Account Workspace — Alembic 0013: `orders` + `order_events` tables; `order_service.py`: create/fill/cancel paper orders (fill auto-opens position); `GET /api/account/equity-curve` (oldest-first snapshots), `GET /api/account/trade-stats` (wins/losses/win-rate/expectancy/PnL by today+month+all-time), orders CRUD endpoints; `AccountWorkspace.tsx`: 4th workspace page with 5 tabs — Overview (equity summary, return%, drawdown, open-risk bar, equity-curve SVG, trade stats grid), Positions (open/close/cancel + closed history), Orders (pending/filled/cancelled list + new-order form), Risk (kill switch, exposure bars, per-symbol risk, rule adherence checklist), Config (account parameters form); `Layout.tsx` + `App.tsx` updated with "Account" nav entry | ✅ Done |
| 89 | Paper Execution Adapter — Alembic 0014: `execution_proposals` table (signal_id FK, levels, risk assessment snapshot, status=pending/approved/rejected). `paper_execution.py`: `create_proposal()` (auto-sizes position via risk_engine.assess_trade()), `approve_proposal()` (creates order + fills immediately → position), `reject_proposal()`, `check_sl_tp()` (scan open positions vs latest DB price, auto-close on hit). `/api/execution/proposals` CRUD + `POST /api/execution/check`. `ExecutionPanel.tsx`: Pending/History/+Manual tabs, ProposalCard (entry/SL/TP/size/risk/R:R display, verdict badge, reasons/warnings, Approve+Reject with confirm dialogs), ManualProposalForm, SL/TP check button. AccountWorkspace "Execution" tab. SignalQueuePanel "▶ Execute" button on candidate+active signals → auto-creates proposal; toast on success. All execution events logged to event_log. | ✅ Done |
| 90 | Backtesting and Replay — No new migration. `backtest_service.py`: walks 1-min price_candles after each signal's created_at → expires_at to determine SL/TP outcome; computes R-multiple per trade; simulates compounding equity curve (risk_pct% per trade); returns win_rate, profit_factor, expectancy_r, max_drawdown, R-distribution by bucket, per-trade list. `POST /api/backtest/run` (params: symbol/direction/since/until/risk_pct/start_equity), `GET /api/backtest/replay` (OHLCV candles from signal time). `BacktestPanel.tsx`: params form (symbol/direction/date range/risk%/start equity), Run button; Results section: stat grid (win rate, profit factor, expectancy, total R, return%, max DD), equity curve SVG, R-distribution bar chart (9 buckets), toggle-able trade log table. "Backtest" tab in OperatorConsole right column + mobile. | ✅ Done |
| 91 | Review & Research Workspace — No new migration. `review_service.py`: `daily_review()` (today closed trades, PnL, win rate, Claude Haiku coaching note, 30-min AI cache), `regime_stats()` (trades grouped by signal regime with win rate + PnL bar), `rule_adherence()` (5-rule risk compliance score: kill switch, open risk, daily loss, risk-per-trade, capital), `setup_type_stats()` (by timeframe + direction). `GET /api/review/daily|regime-stats|rule-adherence|setup-stats`. `ResearchWorkspace.tsx`: 5th nav-page "Review" with 7 tabs — Daily Review (coaching note + today's trades + account snapshot + refresh button), By Regime (horizontal bar chart per regime), Rules (score progress bar + per-rule pass/fail rows), By Setup (table by TF + direction), Journal (reused panel), Performance (reused panel), Backtest (reused panel). Layout.tsx + App.tsx: "Review" nav added to all pages/routes. OperatorConsole: journal, performance, backtest tabs removed (consolidated in Review workspace). | ✅ Done |
| 92 | Model Diagnostics and Factor Attribution — No new migration. `diagnostics_service.py`: `factor_ic()` (Pearson + Spearman rank IC for context/crypto/macro score vs realized PnL; context score tercile win-rate breakdown), `regime_heatmap()` (regime × month grid with color-coded win rates), `score_quartile_stats()` (4 equal-sized quartiles by context_score → win rate + avg PnL + total PnL), `trade_attribution()` (recent closed trades enriched with signal-time score breakdown). `GET /api/diagnostics/factor-ic|regime-heatmap|score-quartiles|trade-attribution`. `DiagnosticsPanel.tsx`: 4 internal tabs — Factor IC (correlation table, tercile stat cards), Regime Heatmap (scrollable 2D color grid with hover detail), Score Quartiles (column bar chart by Q1–Q4), Attribution (table with score bars, regime, direction, P&L). Added as "Diagnostics" tab in ResearchWorkspace (now 8 tabs total). | ✅ Done |
| 93 | Telegram UX Upgrade — No new migration. `telegram_bot/bot.py` fully rewritten: `set_my_commands()` in `post_init` registers 15 commands with BotFather. Persistent `ReplyKeyboardMarkup` (3 rows: 📊 Price / 📡 Signals / ⚡ Risk / 💼 Positions · 🌐 Market / 🧭 Context / 🔔 Alerts / 📜 History · 🪙 BTC / 🔷 ETH / 🟣 SOL) sent with every reply. Symbol switching via `/symbol` command or keyboard BTC/ETH/SOL buttons; `chat_data["symbol"]` shared across all data commands. New commands: `/signals` (live candidate+active signal cards), `/risk` (equity+exposure summary with inline kill-switch toggle button), `/positions` (open paper positions), `/context` (factor score + regime from `factor_scores` table), `/market` (AI commentary for active symbol, replaces `/analysis`; alias kept for back-compat), `/history` (recent closed trades with PnL). Kill-switch toggle writes directly to `account_config` via DB. AI chat now passes active symbol to market context. | ✅ Done |
| 94 | Cross-Asset Adapter Refactor — No new migration. `backend/app/adapters/` package with `base.py` (4 ABCs: `MarketDataAdapter`, `DerivativesAdapter`, `NewsAdapter`, `ExecutionAdapter`; DTOs: `PriceTick`, `OHLCVBar`, `FundingInfo`, `LiquidationEvent`; `AssetClass` enum; `AdapterNotImplemented` exception), `crypto_okx.py` (OKX market data reads from `price_candles` DB), `crypto_binance.py` (Binance derivatives reads from `funding_rates` + `open_interest` + `liquidations` DB tables), `stub_equities.py` (equity/options stubs raise `AdapterNotImplemented`; paper execution stub satisfies `ExecutionAdapter`), `registry.py` (`AdapterRegistry` singleton maps symbols → adapters; `status()` for introspection). `GET /api/adapters/status` (registry snapshot) + `GET /api/adapters/ping` (live OKX adapter health check). Seam established — future asset classes plug in without touching core logic. | ✅ Done |
