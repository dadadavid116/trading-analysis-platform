# Current Platform — Full Context Handoff

> **Purpose:** A single, accurate snapshot of the platform **as it exists in code today**
> (through roadmap Phase 72). Written for an external design/product architect who has not
> seen the repo. This describes what is actually implemented — not the idealized roadmap.
>
> **Companion docs:**
> - `docs/future_phases_unfinished_overview.md` — what is planned but not built
> - `docs/ui_redesign_context.md` — design problems + redesign recommendation
>
> **Note on roadmap numbering:** Two roadmaps coexist in `docs/`. `roadmap.md` is the real
> build log (Phases 1–72, all marked done). `strategic_roadmap.txt` is an older "self-trading
> OS" reframe using a different Phase 26–41 numbering; several of its "future" phases were
> actually built under different numbers in `roadmap.md`. `platform_overview.txt` is stale
> (reflects ~Phase 25). **This document supersedes those for current state.**

---

## 1. Current Product Identity

**What it is today.** A personal, single-operator **crypto market intelligence + trade-analysis
platform**. It collects live market data for three perpetual-swap symbols, presents a dense
multi-panel web dashboard, layers AI interpretation/analysis on top, runs a rule-based signal
scanner, generates AI trade setups, and keeps a self-scored trade journal with automatic
outcome tracking. A full-featured Telegram bot mirrors most of the web functionality.

**Main purpose.** Help one trader *understand the market, find setups, and review their own
decisions* — it is an analysis/decision-support tool, **not** an execution platform. No order
is ever placed on any exchange. The "trades" it tracks are AI-generated setups saved to a
journal and a manually-entered portfolio; outcomes are computed by replaying price candles.

**Current market focus.**
- Symbols: **BTCUSDT, ETHUSDT, SOLUSDT** (hardcoded list in several places; see §5).
- Primary price/chart/order-book source: **OKX USDT perpetual swaps** (`BTC-USDT-SWAP`, etc.).
- Derivatives + liquidations source: **Binance Futures** (funding, OI, long/short, force-orders).
- The AI layers (chat, scheduled summary, chart "Analyze", Telegram) are still **BTC-only**.

**Current deployment / runtime state.**
- Live on a **Hetzner CX22 VPS**, Ubuntu, Docker Compose, domain via **DuckDNS**, HTTPS via
  **Caddy** (Let's Encrypt auto-renew). Access gated by **HTTP Basic Auth** at the Caddy layer.
- ~10 containers: `db` (Postgres 16), `api` (FastAPI/Uvicorn), `frontend` (Nginx static),
  `collector`, `analysis`, `alerts`, `telegram`, `chat_export`, `backup`, `caddy`.
- Two background workers (scanner, journal-close notifier) run **in-process inside the `api`
  container** via the FastAPI lifespan — they are *not* separate containers.
- Single user. No login/accounts beyond the shared Basic Auth credential.

**Current user workflow it supports.**
1. **Watch** — open the Dashboard: candlestick chart with indicators, order book, liquidations,
   derivatives context, live ticker, relative strength, alerts.
2. **Interpret** — click "✦ Analyze" for an AI chart read, or chat with Claude/ChatGPT; read the
   scheduled AI market summary.
3. **Alert** — create price/liquidation/funding/OI/spike alerts (web form, click-on-chart,
   chat tool-use, or Telegram). Get Telegram + browser notifications when they fire.
4. **Find setups** — open the Console: the scanner ranks BTC/ETH/SOL by signal composite; the
   top candidate can be turned into an AI trade setup (entry/SL/3×TP/R:R).
5. **Track** — save a setup to the journal (with notes); outcomes auto-resolve by candle replay;
   a live SL→TP1 progress bar shows open trades; performance stats + AI journal insights review.
6. **Remote** — do most of the above from Telegram.

---

## 2. Current Frontend Design

**Stack.** React 18 + TypeScript + Vite. Charts via **lightweight-charts** (TradingView OSS).
**No CSS framework** — every style is an inline `CSSProperties` object (shared constants in
`panels/panelStyles.ts`). Native `fetch` wrapped in `src/api/index.ts`. Dark theme only
(`#0f1117` background, blue/green/red accents).

### 2.1 Overall page structure
There are **two top-level pages** selected by a header nav toggle (`App.tsx` → `Page = 'dashboard' | 'console'`):

- **Dashboard** — the market-watching workspace (chart + market panels + AI chat).
- **Console** ("Operator Console", `pages/OperatorConsole.tsx`) — the find/evaluate/review
  workspace (scanner, candidate, and a 7-tab right pane).

A `useIsMobile()` hook switches every page to a **single-panel + bottom-tab-bar** layout below
the breakpoint. Desktop and mobile have separate render branches in `App.tsx` and
`OperatorConsole.tsx`.

### 2.2 Header / navigation (`components/Layout.tsx`)
Desktop header (56px), left→right: `TAP` logo · "Trading Analysis Platform" title ·
**Dashboard/Console** nav buttons · **PriceTicker** (BTC/ETH/SOL live price + 24h%, 5s poll) ·
**symbol selector** (BTC/ETH/SOL — dashboard only) · **RelativeStrength** widget · **ServiceHealth**
dots (collector liveness, 30s poll) · **Chat ▶/◀** toggle (dashboard only). Mobile collapses this
into two stacked rows; the symbol selector + ticker move to row 2.

The **active symbol lives in `App.tsx` state** and is passed to every panel as a prop, so switching
symbol updates the whole dashboard at once. (Console panels mostly ignore the symbol and scan all three.)

### 2.3 Desktop Dashboard layout
Two flex columns of stacked panels (gaps act as 1px dividers), plus a collapsible chat column:
- **Left column:** `PricePanel` (flex 2) over `OrderBookPanel` (flex 1).
- **Right column:** `LiquidationPanel` (flex 3) over `DerivativesPanel` (flex 1) over `AlertsPanel` (flex 2).
- **Chat column:** `ChatPanel`, `clamp(340px, 33vw, 480px)`, slides to width 0 when toggled off.

### 2.4 Chart / price area (`panels/PricePanel.tsx`) — the most feature-dense panel
- Header: title, **interval switcher** (3m/5m/15m/1H/4H/1D/1M), **bias selector** (Auto/Long/Short),
  **✦ Analyze** button, **⚙ indicator-preferences** gear modal.
- **Overlay chip row:** EMA20/50/200, VWAP, Volume, Bollinger, RSI, MACD, StochRSI, CVD, Pivots,
  Ichimoku, Patterns — plus a **HA** (Heikin-Ashi) toggle. Toggles persist to `localStorage`.
- Compact OHLCV strip + candle-close countdown timer.
- **User annotations bar** (Phase 69): collapsible list of user-marked price levels.
- Chart stack: main candlestick chart + up to **four synced sub-panes** (RSI, MACD, StochRSI, CVD)
  that expand/collapse. All five chart instances are time-synced via
  `subscribeVisibleLogicalRangeChange` and width-locked with `rightPriceScale.minimumWidth: 65`.
  Live price via SSE; rightmost candle refreshes every 10s.
- **Drawn price lines:** alert lines (dashed orange), S&R levels (S×n / R×n), daily pivots,
  AI-analysis lines (support/resistance/entry/SL/TP), and user annotations (solid colored).
- **Interactions:** crosshair price tooltip; click opens a popover to set an alert above/below
  or "Mark level" (annotation with label + color).
- All indicator math (EMA/VWAP/BB/RSI/MACD/StochRSI/CVD/Ichimoku/patterns/HA) is computed **on the
  frontend** from klines — no extra API calls.

### 2.5 Liquidation panel (`panels/LiquidationPanel.tsx`)
Recent liquidation events table (Time / Side / Price / Qty) for the active symbol, polling
`/api/liquidations/recent`. (A separate `LiquidationHeatmap.tsx` price×time heatmap component
also exists and is used by `HeatmapPanel`.)

### 2.6 Order book panel (`panels/OrderBookPanel.tsx`)
Top-5 bids (green) / asks (red) for the active symbol from `/api/orderbook/snapshot`, with a
scrollable body wrapper (Phase 62). Still a **table**, not a depth/cumulative-volume chart.

### 2.7 Alerts panel (`panels/AlertsPanel.tsx`)
- **Active / History tabs.** Active = list of rules (Name, Symbol, Condition, Threshold, Mode,
  Hook ⛓, Status, delete ×). History = `alert_triggered` / `alert_rearmed` events.
- **Create form:** name, symbol (BTC/ETH/SOL), condition type, threshold, window (for spike types),
  trigger mode (once/rearm), optional webhook URL.
- Condition types in the UI: price above/below, price spike up/down, liquidation spike,
  funding rate above/below, **OI spike** (±%).
- Browser desktop notifications fire when a newly-triggered alert appears (15s poll, diffs IDs).

### 2.8 Chat panel (`panels/ChatPanel.tsx`)
Right-docked, full-height. Header + collapsible **Chat Settings** (model selector Claude/ChatGPT,
save/clear chat, recent-sessions list to resume). Scrollable markdown-rendered conversation
(user right-bubbles, assistant left-bubbles, error bubbles, **StrategyCard** with Approve & Set
Alert). Auto-growing textarea, Send, and a Strategy-validate button. **Receives chart-analysis
output automatically** when ✦ Analyze runs (lifted through `App.tsx` state). BTC-centric greeting.

### 2.9 Analysis behavior
Two distinct AI analysis paths exist and are easy to confuse (a known naming issue):
- **Scheduled market summary** — background worker writes 3–4 sentence BTC summaries to the DB;
  shown in `AnalysisPanel.tsx` (last 5, expandable, model badge, copy). *Note: `AnalysisPanel`
  is not currently mounted on either page's default layout — it exists but is orphaned.*
- **On-demand chart "Analyze"** — `PricePanel` → `POST /api/analysis/chart` → Claude returns a
  structured trade read (trend, direction, support/resistance, entry, SL, TP) that is drawn on
  the chart and pushed into the ChatPanel as markdown.

### 2.10 Account / trade / strategy UI that already exists
- **Strategy validator** — `StrategyCard` in ChatPanel (OpenAI validates → Claude summarizes →
  Approve & Set Alert via tool use).
- **Candidate / trade setup** — `CandidatePanel.tsx` (Console): picks the highest-|composite|
  scanner symbol, generates an AI setup, includes a **position-size calculator** (account/risk/
  leverage → notional/margin/TP profit) and a **notes** field, then "Save to Journal".
- **Journal** — `JournalPanel.tsx`: saved setups with auto-computed outcomes (pending/tp1-3/sl/
  expired), All/Open/Wins/Losses/Expired filter, CSV export, AI-insights trigger, per-trade notes,
  and a **live SL→TP1 progress bar** on open trades. A 🔔 badge shows the close-notifier status.
- **Performance** — `PerformancePanel.tsx`: win rate, expectancy, per-symbol/bias breakdown,
  streak, equity curve (running-R SVG), and an "✦ AI Insights" button.
- **Portfolio** — `PortfolioPanel.tsx`: manually-entered long/short positions with live P&L,
  **localStorage-only** (no DB, no exchange).
- **Signal matrix** — `SignalMatrixPanel.tsx`: RSI+EMA trend grid for BTC/ETH/SOL × 15m/1H/4H/1D.

### 2.11 Console layout (`pages/OperatorConsole.tsx`)
Desktop: a fixed **340px left column** (ScannerPanel over CandidatePanel) + a **right column with
7 tabs**: Event Log · Journal · Performance · Heatmap · News · Portfolio · Signals.
Mobile: a **9-item bottom tab bar** (Scanner/Setup/Stats/Journal/Events/Heat/News/Portfolio/Signals).

### 2.12 What feels temporary or crowded
- The Console **right pane crams 7 unrelated panels into a tab strip**; mobile has **9 bottom tabs**.
- The Dashboard is a **fixed 5-panel grid** with no user arrangement.
- `AnalysisPanel` exists but isn't mounted anywhere by default (orphaned).
- Two "analysis" concepts with overlapping names (summary vs chart-analyze).
- Heatmap/News/Portfolio/Signals are "extra intelligence" panels parked in the Console tab strip
  because there was no better home — they don't belong to the operator find→evaluate flow.
- Everything is inline-styled; there is no design-token/theme system, no component library.

### 2.13 What is reusable for a future redesign
- Every panel is a **self-contained component** that fetches its own data — they can be relocated
  into new workspaces without rewrites.
- The **typed API client** (`src/api/index.ts`) is the single integration seam.
- The **active-symbol-as-prop** pattern and `useIsMobile` branching are already in place.
- The 5-chart sync engine, indicator math, and drawing/annotation logic in `PricePanel` are a
  strong, isolated foundation for a "charting workspace".
- `panelStyles.ts` is the obvious place to introduce design tokens.

---

## 3. Current Backend Architecture

**Stack.** FastAPI (Python 3.11+), Uvicorn, SQLAlchemy 2.x async, asyncpg, Pydantic v2,
pydantic-settings. `httpx` for outbound REST, `websockets` for OKX streams, `anthropic` +
`openai` SDKs, `python-telegram-bot` v21.

### 3.1 FastAPI app (`app/main.py`)
- Lifespan: `create_all` + idempotent `ALTER TABLE IF NOT EXISTS` migrations + a unique index;
  then starts the **scanner worker** and **journal-close worker** as asyncio tasks.
- CORS from `CORS_ALLOWED_ORIGINS`. Optional `X-API-Key` dependency (`auth.py`,
  `hmac.compare_digest`) on all `/api/*` when `DASHBOARD_API_KEY` is set (off by default).
- `/health` is unauthenticated.

### 3.2 Routers (all under `/api`, `app/routers/`)
- `price` — `/price/latest`, `/history`, `/levels`, `/klines` (OKX proxy), `/stream` (SSE),
  `/market-global` (CoinGecko), `/fear-greed` (alternative.me).
- `liquidations` — recent events, rolling stats, price×time heatmap.
- `orderbook` — latest snapshot.
- `derivatives` — funding, OI, LS-ratio (latest + history).
- `alerts` — list / create / delete.
- `analysis` — `/latest`, `/history`, `/chart` (on-demand Claude chart read).
- `chat` — `POST /chat/` (Claude or OpenAI, with tool use).
- `chat_history` — list / get / save-to-file / delete sessions.
- `strategy` — `/strategy/validate` (OpenAI → Claude).
- `symbols` — registry list + 24h relative strength.
- `events` — list (with `service` filter) + SSE stream.
- `scanner` — `/signals`, `/status`, `/setup` (AI trade setup).
- `journal` — list / create / delete, `/stats`, `/insights` (Claude), `/notifier-status`.
- `news` — merged CoinTelegraph + CoinDesk RSS.
- `health` — service liveness (MAX(timestamp) freshness per collector table).

### 3.3 Services (`app/services/`)
`chart_analysis.py` (klines fetch + indicator math + Claude prompt for the chart read),
`chat_history.py` (session/message persistence helpers), `event_logger.py` (`log_event(...)`
writes to `event_log`), `levels.py` (`find_sr_levels` support/resistance clustering).

### 3.4 Collectors (`backend/collectors/`, run via `run_all.py` in the `collector` container)
- `price_collector.py` — **OKX** candles REST poll every 10s for the three SWAP instruments;
  upserts 1m candles (close-time keyed).
- `orderbook_collector.py` — **OKX** `books5` WebSocket; throttled 5s snapshots; 24h prune.
- `liquidation_collector.py` — **Binance** futures force-order stream.
- `derivatives_collector.py` — **Binance** Futures REST: funding (30m), OI (5m), LS-ratio (15m).

### 3.5 Workers
- **In-process (api container):** `scanner_worker` (5-min auto-scan, Telegram high-confidence
  alerts, 1h debounce), `journal_worker` (2-min trade-close notifier; §Telegram).
- **Separate containers:** `analysis` (scheduled Claude summary loop), `alerts` (evaluator loop
  every 15s), `telegram` (long-polling bot), `chat_export` (nightly `.md` export + retention),
  `backup` (daily `pg_dump`, 7-day retention).

### 3.6 AI integrations
- **Claude** (`anthropic`): chat (`claude-sonnet-4-6`), chart analysis (sonnet), scheduled summary
  (`claude-haiku-4-5`), trade setup (haiku), journal insights (haiku), strategy summary (sonnet).
- **OpenAI** (`gpt-4o`): optional chat model + strategy validation stage 1. Optional — features
  degrade gracefully (503) if `OPENAI_API_KEY` is unset.

### 3.7 Telegram (`backend/telegram_bot/`)
Long-polling bot, parallel to the web. Shares the DB. Restricted to `TELEGRAM_CHAT_ID`. See §8.

### 3.8 Deployment services / Caddy / auth
- `docker-compose.prod.yml` + `docker-compose.yml` (base) merged on deploy; `deploy.sh` does
  `git pull` + `docker compose up -d --build` (or `quick` = frontend+api only).
- **Caddy** is the only public service: HTTPS, **HTTP Basic Auth** on everything except `/health`,
  SSE flush (`flush_interval -1`) for `/api/price/stream` and `/api/events/stream`, reverse proxy
  `/api/*`→api, `*`→frontend.

### 3.9 Data flow (market → DB → frontend)
`OKX/Binance` → **collectors** (write to Postgres) → **FastAPI routers** (read Postgres; some proxy
external REST live) → **React panels** (`fetch`/SSE). Workers read Postgres on a schedule and emit
notifications (Telegram/browser/webhook) + `event_log` rows. AI endpoints read Postgres for context,
call Claude/OpenAI, return structured results (and log events).

---

## 4. Current Feature Inventory

> Format: **what it does** · **where it lives** · **current limitation**.

### Market data
- **Live 1m candles (OKX swap)** · `collectors/price_collector.py`, `routers/price.py`,
  `PricePanel`/`PriceTicker` · 10s REST poll (not true tick); 3 symbols only.
- **Klines proxy (OKX)** · `/price/klines` · OKX only; 7 fixed intervals; 500-candle cap.
- **Order book (OKX books5)** · `collectors/orderbook_collector.py`, `OrderBookPanel` · top-5 only;
  5s throttle; table view (no depth chart).
- **Liquidations (Binance)** · `collectors/liquidation_collector.py`, `LiquidationPanel`,
  `LiquidationHeatmap`, `routers/liquidations.py` · Binance source while price is OKX (cross-venue).
- **Derivatives — funding / OI / L-S (Binance)** · `collectors/derivatives_collector.py`,
  `routers/derivatives.py`, `DerivativesPanel` · poll intervals 5–30 min; Binance source.
- **Relative strength / global stats / Fear&Greed / news** · `RelativeStrength`, `/price/market-global`
  (CoinGecko), `/price/fear-greed` (alternative.me), `routers/news.py` (RSS) · external free APIs, no caching layer.

### Charting
- **Candlestick + 4 synced sub-panes + 13 overlays + HA + patterns + annotations** · `PricePanel.tsx` ·
  all computed client-side; no persistence of analysis state; desktop-oriented density.
- **S&R levels / daily pivots** · `services/levels.py`, `/price/levels`, drawn in `PricePanel`.

### Alerts
- **8 condition types** (price above/below, price spike up/down, liquidation spike, funding
  above/below, OI spike), once/rearm, optional webhook, Telegram + browser notify · `models/alert.py`,
  `schemas/alert.py`, `alerts/evaluator.py`, `alerts/notifications.py`, `AlertsPanel.tsx` ·
  evaluator runs in a separate container every 15s; no per-alert trigger-count history (only event log).

### AI chat
- **Claude/ChatGPT chat with tool use** (get price, create/list/delete alert) · `routers/chat.py`,
  `ChatPanel.tsx` · BTC-only market context + tools; 5-step tool loop; no streaming to UI.

### Chart analysis
- **On-demand structured chart read** · `services/chart_analysis.py`, `/analysis/chart`, `PricePanel` ·
  **fetches klines from Binance spot (hardcoded BTCUSDT)** — inconsistent with the OKX chart/feed.

### Strategy validation
- **OpenAI validate → Claude summarize → approve→alert** · `routers/strategy.py`, ChatPanel
  StrategyCard, Telegram `/strategy` · requires OpenAI key; output is alerts, not a backtest.

### Scanner + AI setup
- **Rule-based multi-signal scanner** (price momentum 1m/15m/1H, liquidation surge, funding/OI/LS
  extremes, volume surge, candle patterns, key-level proximity) with composite score/bias ·
  `routers/scanner.py`, `ScannerPanel.tsx` · stateless (recomputed each call); no persisted signals.
- **AI trade setup** (entry/SL/3×TP/R:R/reasoning/risks) · `/scanner/setup`, `CandidatePanel.tsx` ·
  single top candidate; haiku; no invalidation/expiry lifecycle.

### Journal & performance
- **Journal with auto-outcome replay, notes, CSV export, live progress bar** · `models/journal.py`,
  `routers/journal.py`, `JournalPanel.tsx` · outcomes computed on read (24h window); manual-ish flow.
- **Performance dashboard + AI insights** · `PerformancePanel.tsx`, `/journal/stats`, `/journal/insights` ·
  journal-derived only; not a real account/equity ledger.
- **Trade-close notifications** · `workers/journal_worker.py`, `/journal/notifier-status` · Telegram + event log.

### Telegram bot
- **Full parallel interface** (price/status/alerts/setalert/analysis/strategy/model + free-text AI) ·
  `telegram_bot/bot.py` · BTC-only; long-polling; in-memory turn history per process (§8).

### Chat history / export
- **Web + Telegram sessions persisted; resume; save to `.md`; nightly export + retention** ·
  `models/chat.py`, `routers/chat_history.py`, `services/chat_history.py`, `chat_export/run.py`.

### Browser notifications
- **Desktop Notification API on alert trigger** · `AlertsPanel.tsx` · requires HTTPS + permission.

### Deployment / security
- **Dockerized prod stack, Caddy HTTPS + Basic Auth, daily pg_dump backup, service-health endpoint,
  pre-flight scripts** · `docker-compose.prod.yml`, `caddy/Caddyfile`, `scripts/`, `routers/health.py`,
  `ServiceHealth.tsx` · single shared credential; no multi-user; manual deploy.

### Operator console / event log
- **Unified event feed + SSE terminal** · `models/event_log.py`, `routers/events.py`,
  `EventLogPanel.tsx`, `services/event_logger.py`.

---

## 5. Current Data Sources

| Concern | Provider | Instrument assumption | Hardcoded? |
|---|---|---|---|
| Price candles / klines / SSE | **OKX** | `*-USDT-SWAP` perpetual | Symbol list hardcoded in collector + router |
| Order book | **OKX** `books5` | `*-USDT-SWAP` | Hardcoded instrument list |
| Liquidations | **Binance** futures WS | `*USDT` | Hardcoded |
| Funding / OI / L-S | **Binance** Futures REST | `*USDT` | Hardcoded `SYMBOLS` list |
| Chart "Analyze" klines | **Binance spot** REST | **`BTCUSDT` only** | Hardcoded in `chart_analysis.py` |
| Chat / scheduled summary / Telegram context | DB (`BTCUSDT` rows) | **BTC only** | Hardcoded `"BTCUSDT"` queries |
| Global mcap/dominance | CoinGecko | n/a | Endpoint hardcoded |
| Fear & Greed | alternative.me | n/a | Hardcoded |
| News | CoinTelegraph + CoinDesk RSS | n/a | Hardcoded feeds |

**Is it still BTC/USDT-specific?** Partly. Market data + scanner + alerts + journal are
**multi-symbol (BTC/ETH/SOL)**. But the **AI layers (chat, scheduled summary, chart Analyze,
Telegram) are still BTC-only**, and the chart-analysis service still pulls from **Binance spot**.

**OKX BTCUSDT perpetual-swap alignment — what's done vs remaining.**
- ✅ Done: price collector, klines proxy, SSE, order book all use OKX `BTC-USDT-SWAP` (+ ETH/SOL).
- ❌ Remaining: derivatives + liquidations still come from **Binance**; the `/analysis/chart`
  service still fetches **Binance spot** klines; AI chat/summary/Telegram are BTC-only and should
  become symbol-aware; funding/OI semantics differ between OKX swap and Binance (cross-venue basis).

**Hardcoded vs configurable.** A `tracked_symbols` **registry table exists** (`models/symbol.py`,
`/api/symbols`) intended as the source of truth, **but most code paths ignore it** and use their
own hardcoded `["BTCUSDT","ETHUSDT","SOLUSDT"]` / instrument-map constants (collectors, scanner,
price router, Layout). Intervals, poll cadences, scanner thresholds, and the symbol set are all
literals in code, not config.

---

## 6. Current Database State

**Engine.** PostgreSQL 16 (Docker, internal-only, named volume). SQLAlchemy async/asyncpg.

**Tables (all current models):**
- `price_candles` — 1m OHLCV; unique `(symbol, timestamp)` for upsert.
- `liquidations` — symbol, ts, side, price, quantity, exchange.
- `orderbook_snapshots` — symbol, ts, `bids`/`asks` JSONB; pruned to 24h.
- `alerts` — name, symbol, condition_type, threshold, window_minutes, trigger_mode, is_active,
  **webhook_url**, triggered_at, created_at.
- `analysis_summaries` — symbol, generated_at, summary_text, model_used.
- `chat_sessions` / `chat_messages` — platform (web/telegram), model, title, messages (cascade).
- `funding_rates` — symbol, ts, funding_rate, mark_price, index_price, exchange.
- `open_interest` — symbol, ts, oi_value (BTC contracts), exchange.
- `ls_ratios` — symbol, ts, long_ratio, short_ratio, ratio_type, exchange.
- `tracked_symbols` — registry: canonical symbol, okx_instrument_id, binance_symbol, display_name,
  is_active, sort_order. *(Exists but under-used — see §5.)*
- `event_log` — service, event_type, symbol, message, detail JSONB.
- `journal_entries` — setup fields, risk_reward, reasoning, key_risks, scanner_bias, **notes**,
  **notified_outcome**. (Outcome itself is computed on read, not stored except the notified flag.)

**Schema-management approach (fragile, dual-track).**
- The **live path** is `Base.metadata.create_all` on every API startup **plus** a growing list of
  idempotent `ALTER TABLE IF NOT EXISTS ...` statements in the `main.py` lifespan, **plus** a
  `scripts/init_db.sql` run on first container start.
- **Alembic is wired up** (`backend/alembic/`, 4 version files through `event_log`) **but is not the
  authoritative mechanism** — recent columns (`webhook_url`, `notes`, `notified_outcome`) were added
  via startup `ALTER`, not new Alembic revisions. On an existing VPS DB you must `alembic stamp head`.

**Current limitations / fragility.**
- New columns are added by editing the lifespan `ALTER` block — easy to forget, no rollback, no
  version parity between Alembic and reality.
- No positions/orders/account tables (Portfolio is localStorage-only; Journal outcomes are derived).
- No persisted scanner signals (scanner is stateless).
- No indexes beyond the price upsert unique index and PKs (no documented tuning for growth).

---

## 7. Current AI System

**Where Claude is used.**
- **Chat** (`routers/chat.py`, `claude-sonnet-4-6`) — agentic 5-step tool loop (price + alert tools).
- **Chart analysis** (`services/chart_analysis.py`, sonnet) — structured JSON trade read from 50
  candles + client-style indicator context + DB derivatives context.
- **Scheduled summary** (`analysis/claude_client.py`, `claude-haiku-4-5`) — 3–4 sentence BTC summary.
- **Trade setup** (`routers/scanner.py`, haiku) — entry/SL/3×TP/R:R JSON.
- **Journal insights** (`routers/journal.py`, haiku) — patterns/biases/suggestions JSON.
- **Strategy summary** (sonnet) — plain-English wrap of the validated strategy.

**Where OpenAI is used.** `gpt-4o` as an optional chat model and as **stage 1 of strategy
validation** (structured validity JSON). Everything OpenAI-dependent degrades to a 503 if the key
is missing. (Grok is referenced in comments/labels but not wired.)

**Tools / function calling.** Both Claude and OpenAI share the same 4 tools: `get_current_price`,
`create_price_alert`, `list_alerts`, `delete_alert`. **All BTC-only** and alert-scoped — the AI
cannot read derivatives, scanner, or journal data through tools.

**Scheduled analysis worker.** Separate `analysis` container; interval `ANALYSIS_INTERVAL_MINUTES`
(default 10). Reads latest candle + 5 liquidations + order book; writes a summary row; logs an event.

**Telegram AI behavior.** Same 4 tools, same BTC context; `/analysis` is a one-shot summary;
`/strategy` runs the OpenAI→Claude pipeline with inline Approve/Dismiss; free text → chat loop.
Conversation turns are kept **in-memory per process** (`chat_data`), so a bot restart loses turn
context (DB sessions persist, but the in-memory thread does not rehydrate).

**Token / cost implications.**
- Chat/chart use sonnet (higher cost) with full history (chat up to 12 turns; chart sends 30
  candle lines + indicator/derivatives context each call).
- Summary/setup/insights use haiku (cheap, capped 300–600 tokens).
- **No prompt caching** anywhere; system prompt + market context are rebuilt and resent every call.
- Scheduled summary runs every ~10 min continuously (steady background spend).

**What could later be replaced/assisted by local models.** Pattern detection + scanner scoring are
already deterministic and need no LLM. News sentiment and journal-insight batch jobs are latency-
tolerant and could use a small local model. Chat/interpretation and trade-decision reasoning
should stay API-based. Risk/execution logic must remain deterministic (never AI-gated).

---

## 8. Current Telegram System

**Commands.** `/start`, `/help`, `/price`, `/status`, `/alerts`, `/setalert <above|below> <price>`,
`/delete_alert <id>`, `/analysis`, `/strategy <text>`, `/model`, `/claude`, `/chatgpt`, `/clear`,
plus free-text → AI chat with tool use.

**Access control.** Hard restriction to `TELEGRAM_CHAT_ID`; all other chats are silently ignored
and logged as unauthorized. No per-user model; it's effectively single-operator.

**Sync with web/dashboard.** Shares the same Postgres DB, so alerts created/deleted via Telegram
appear on the web (chart line within ~15s) and vice-versa. Chat sessions persist to the same
`chat_sessions`/`chat_messages` tables as web.

**What's missing from the Telegram UX.**
- **No BotFather command menu**, **no persistent reply keyboard**, and inline keyboards are used
  **only** for the `/strategy` approve/dismiss step — there is no general inline action surface.
- BTC-only (no symbol switching; no ETH/SOL).
- No history commands (`/history`, `/session`, `/export`), no chart-image delivery, no webhook mode.
- In-memory turn history is lost on restart.

**How a future Telegram function panel could fit.** The bot already has authenticated command
routing + a shared DB + an inline-button pattern (`handle_callback`). A function panel = a
BotFather command menu + a persistent reply keyboard (Price / Alerts / Scanner / Positions / Kill)
+ contextual inline keyboards per message, all calling the same service functions the web uses.
This is additive and does not require architectural change.

---

## 9. Current Design Problems (summary — full treatment in `ui_redesign_context.md`)

- **Two pages carrying ~18 panels.** The Console right pane (7 tabs) and mobile bottom bars
  (6 and 9 tabs) are overflow dumping grounds, not an information architecture.
- **No workspace concept.** "Understand / find / act / review" are all mixed across two pages.
- **Fixed, non-configurable layouts.** No panel arrangement, sizing, or presets.
- **Orphaned/duplicated UI.** `AnalysisPanel` is unmounted; two "analysis" features share a name.
- **Auxiliary intelligence (heatmap, news, global stats, F&G, signals, portfolio) has no home** —
  it's parked in Console tabs.
- **Cross-venue + BTC-only inconsistencies** leak into the UI (chart on OKX, derivatives on Binance,
  AI on BTC only).
- **Inline styles everywhere** — no token/theme system makes a coherent redesign harder.

---

*End of current-state context. For unfinished phases see `future_phases_unfinished_overview.md`;
for the redesign plan see `ui_redesign_context.md`.*
