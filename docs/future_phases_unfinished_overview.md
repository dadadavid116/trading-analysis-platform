# Future / Unfinished Phases — Overview

> **Purpose:** Everything planned but **not yet built**, framed for an external product
> architect. Pairs with `current_platform_full_context.md` (what exists) and
> `ui_redesign_context.md` (how to reshape the UI).
>
> **Direction:** crypto-first self-trading platform → macro/factor intelligence layer →
> market-intelligence workspace → operator console → signal engine → risk engine →
> account/trades workspace → paper execution → backtesting/replay → journal/performance →
> cross-asset adapters → professional account/auth → live-execution gate.

---

## 0. Roadmap reconciliation (read first)

Three roadmap documents disagree on numbering. Reality:

- `roadmap.md` is the **actual build log** (Phases 1–72, all done). It already shipped many things
  the older `strategic_roadmap.txt` lists as "future": Operator Console, scanner, AI trade setup,
  journal, performance dashboard, multi-timeframe scanner, S&R levels, chart overlays/sub-panes,
  pivots, heatmap, Ichimoku, Fear&Greed, correlation, global stats, news feed, portfolio tracker,
  signal matrix, funding/OI/spike alerts, multi-symbol alerts, live ticker, equity curve, CSV
  export, Heikin-Ashi, candlestick patterns, AI journal insights, webhook notifications, OI-spike
  alerts, chart annotations, journal notes, open-trade monitor, trade-close notifications.
- `strategic_roadmap.txt` remains the best statement of **product intent** (the "self-trading OS"
  layers) even though its phase numbers are stale.
- The phases below are the **genuinely unbuilt** capabilities, re-derived from the current code,
  not from any single roadmap's numbering. Each is independent of the old numbers.

**One-line status of the big strategic blocks:**

| Strategic block | Status today |
|---|---|
| Market intelligence | Partial — panels exist, no unified workspace, no macro/factor layer |
| Operator console | Partial — scanner + candidate + event log exist; no persisted signals |
| Signal engine | Partial — stateless rule scanner only; no signal objects/lifecycle |
| Risk engine | Minimal — a position-size calculator widget only |
| Account / trades / positions | Not built — Portfolio is localStorage; Journal is derived |
| Paper execution | Not built |
| Backtesting / replay | Not built |
| Cross-asset adapters | Not built — exchange logic is inlined |
| Professional account/auth | Not built — single Basic Auth credential |
| Live execution gate | Not built (intentionally last) |
| Macro / factor intelligence | Not built (new direction; seeds: CoinGecko, F&G, news) |
| OKX perpetual alignment | Partial — price/orderbook on OKX; derivatives/liquidations/AI not |

---

## Unfinished Phases

> Per-phase fields: **Purpose · Problem solved · Frontend areas · Backend areas · Change type ·
> Dependencies.** Change type ∈ {structural refactor, data expansion, feature enhancement, UX redesign}.

### F1 — OKX Perpetual Alignment (finish the migration)
- **Purpose:** Make OKX `*-USDT-SWAP` the single source for *all* market + derivatives data.
- **Problem solved:** Today price/orderbook are OKX but derivatives/liquidations are Binance and the
  chart-"Analyze" service uses **Binance spot** — cross-venue basis errors and inconsistent context.
- **Frontend:** DerivativesPanel labels/semantics; any "Binance" copy.
- **Backend:** `derivatives_collector.py`, `liquidation_collector.py`, `services/chart_analysis.py`
  (switch klines to OKX + make symbol-aware), funding/OI schema notes.
- **Change type:** structural refactor + data expansion.
- **Dependencies:** none — should precede signal/risk work so they read consistent data.

### F2 — Symbol Registry as Source of Truth
- **Purpose:** Drive collectors/scanner/routers/UI from the `tracked_symbols` table, not hardcoded lists.
- **Problem solved:** Symbol set is duplicated as literals across ≥5 files; adding an asset means code edits.
- **Frontend:** symbol selector + per-panel symbol props read from `/api/symbols`.
- **Backend:** collectors, `routers/scanner.py`, `routers/price.py`, AI context builders.
- **Change type:** structural refactor.
- **Dependencies:** F1 (define instrument mapping cleanly in the registry).

### F3 — Macro / Factor Intelligence Layer (new direction)
- **Purpose:** Add a cross-market context layer: BTC dominance/total cap trend, DXY/rates proxy,
  ETF/stablecoin flows or sentiment, correlation regime — as *context*, not a replacement for the
  crypto trade focus.
- **Problem solved:** The platform reads micro-structure (price/OI/funding/liq) but has no top-down
  regime/factor read to bias setups (risk-on/off, leadership rotation).
- **Frontend:** a **Market Intelligence workspace** (see `ui_redesign_context.md`) hosting macro
  widgets alongside existing global-stats/F&G/news/correlation/heatmap panels.
- **Backend:** new collectors/proxies (macro feeds), an AI "regime" summarizer, factor scoring that
  can feed the scanner composite.
- **Change type:** data expansion + feature enhancement.
- **Dependencies:** F1/F2 for clean data; benefits from F4 workspace shell.

### F4 — Market Intelligence Workspace (UX)
- **Purpose:** Promote market understanding to its own workspace: chart + derivatives + liquidations
  + macro/factor + news + AI commentary, with a clear split between "market commentary" and
  "trade-setup analysis".
- **Problem solved:** Intelligence is scattered across the Dashboard and Console tab-dump.
- **Frontend:** new route/workspace; relocate PricePanel, DerivativesPanel, LiquidationPanel,
  HeatmapPanel, NewsPanel, AnalysisPanel (currently orphaned), macro widgets; rename the two analyses.
- **Backend:** none new (composition), beyond F3 feeds.
- **Change type:** UX redesign.
- **Dependencies:** F3 (content), ui_redesign_context decisions.

### F5 — Signal Engine v1 (persisted signals + lifecycle)
- **Purpose:** Turn the stateless scanner into structured **signal objects** with a lifecycle
  (pending → active → expired/invalidated/hit), confidence score, entry/SL/TP, invalidation,
  expiry, context snapshot, AI rationale, strategy source.
- **Problem solved:** Scanner output is recomputed each request and not tracked; no setup history/audit.
- **Frontend:** Operator Console candidate/queue UI shows persisted signals + status; signal detail.
- **Backend:** new `signals` table(s), L1/L2 filter logic, setup-type taxonomy, lifecycle worker,
  AI rationale persistence; build on `routers/scanner.py`.
- **Change type:** structural + logic layer.
- **Dependencies:** F1/F2 (consistent data), event_log already exists.

### F6 — Risk Engine v1
- **Purpose:** Deterministic per-trade sizing + portfolio open-risk cap + stop-logic types (structure/
  ATR/manual) + scale-in rules + kill switch + risk-event logging.
- **Problem solved:** Only a UI position-size calculator exists; no enforced risk limits or kill switch.
- **Frontend:** risk panel in an Execution/Account workspace; cap indicators; kill-switch control.
- **Backend:** risk module (pure functions), `risk_events` logging, guardrail checks callable by
  signal/execution layers.
- **Change type:** logic layer (must stay non-AI/deterministic).
- **Dependencies:** F5 (signals to size), F7 (account state to cap against).

### F7 — Positions / Orders / Account State Layer
- **Purpose:** Real DB-backed positions/orders/order_events + an **Account workspace** (equity curve,
  net P&L, returns, daily gain/loss, win/loss stats, AI trading score).
- **Problem solved:** Portfolio is localStorage-only; Journal outcomes are derived; there is no
  account ledger or persistent equity history.
- **Frontend:** Account workspace; migrate PortfolioPanel/PerformancePanel into it.
- **Backend:** `positions`, `orders`, `order_events` tables; account aggregation endpoints; AI score.
- **Change type:** structural state-management layer + data expansion.
- **Dependencies:** F6 (risk amounts), schema-management hardening (F12).

### F8 — Paper Execution Adapter
- **Purpose:** Simulated fills at current price with a **signal → risk-sized proposal → operator
  approve/reject → position** flow; order/stop/target management; execution timeline.
- **Problem solved:** The platform observes but never "acts," even in simulation; no proposal/approval loop.
- **Frontend:** Execution workspace (proposals, open positions, manage/close, drag-to-adjust stops).
- **Backend:** paper execution service writing to F7 tables; Telegram execution commands w/ confirm.
- **Change type:** execution workflow layer.
- **Dependencies:** F5, F6, F7.

### F9 — Replay & Backtesting
- **Purpose:** Bar-by-bar historical replay + strategy backtests (trade list, equity curve, win rate,
  drawdown, R-multiple distribution, profit factor) + parameter comparison + strategy versioning.
- **Problem solved:** All analysis is forward-looking; strategies can't be validated before risking.
- **Frontend:** Review/Research workspace with a replay chart + results panels.
- **Backend:** backtest engine over stored/imported klines; strategy rule representation; results store.
- **Change type:** feature enhancement + new compute layer.
- **Dependencies:** F1/F2 (clean data), F5 (signal/setup definitions); **required before F14 (live)**.

### F10 — Journal & Performance Review (deepen)
- **Purpose:** Extend the existing journal into full review: tags/screenshots, AI end-of-day/week
  review, rule-adherence tracking, score-evolution chart, attribution by setup/symbol/timeframe.
- **Problem solved:** Journal captures notes + outcomes but not structured review/attribution/adherence.
- **Frontend:** Review workspace; extend `JournalPanel`/`PerformancePanel`.
- **Backend:** extend `routers/journal.py` (tags, periodic AI review, adherence metrics).
- **Change type:** feature enhancement.
- **Dependencies:** F7 (account/score), F8 (plan-vs-execution comparison).

### F11 — News & Catalyst Layer (deepen)
- **Purpose:** Beyond the current RSS feed: AI symbol/sentiment/urgency tagging, scheduled
  summarization, and catalyst-linked scanner score adjustments.
- **Problem solved:** News is a passive headline list; it doesn't enrich signals or context.
- **Frontend:** News panel tagging UI within the Market Intelligence workspace.
- **Backend:** extend `routers/news.py`; AI tagging; hook into scanner composite + analysis context.
- **Change type:** feature enhancement + data expansion.
- **Dependencies:** F3/F4 (workspace), F5 (scanner integration).

### F12 — Schema Management & Data Foundation Hardening
- **Purpose:** Make Alembic the single source of truth; retire startup `create_all` + ad-hoc
  `ALTER TABLE` block; add indexes/retention/backfill discipline.
- **Problem solved:** Dual-track schema management is fragile; recent columns bypassed Alembic.
- **Frontend:** none.
- **Backend:** `backend/alembic/`, `main.py` lifespan, model definitions.
- **Change type:** structural refactor.
- **Dependencies:** none — should happen **before** the data-heavy layers (F5/F7/F9) grow the schema.

### F13 — Cross-Asset Adapter Refactor
- **Purpose:** Abstract market + account behind adapter interfaces (get_price/orderbook/funding/OI/
  klines; positions/orders/fills) so new exchanges/asset classes plug in without core changes.
- **Problem solved:** Exchange specifics (OKX/Binance) are inlined throughout collectors/services.
- **Frontend:** minimal (source/exchange labels).
- **Backend:** new adapter layer; refactor collectors + execution to consume it.
- **Change type:** architecture refactor.
- **Dependencies:** F1, F8 (so both market and account sides exist to abstract).

### F14 — Professional Account System (auth/multi-user)
- **Purpose:** Users table, login/sessions, roles (admin/trader/viewer), per-user profile/risk/alerts;
  retire Caddy Basic Auth as the primary gate; migrate single-user data to a default account.
- **Problem solved:** One shared credential; no per-user state or roles.
- **Frontend:** auth UI; per-user settings.
- **Backend:** users/auth middleware across API + Telegram; data migration.
- **Change type:** structural / platform.
- **Dependencies:** stable data + execution + review (do **after** F7–F10, per strategic intent).

### F15 — Mobile & External Access Expansion (incl. Telegram function panel)
- **Purpose:** BotFather command menu + reply keyboard + broader inline keyboards; Telegram history
  commands; optional chart-image delivery; webhook mode; richer responsive web.
- **Problem solved:** Telegram inline UI is limited to `/strategy`; mobile is bottom-tab-dump; no
  command menu/keyboard.
- **Frontend:** responsive refinements per workspace.
- **Backend:** `telegram_bot/bot.py` (menus/keyboards/history/webhook), optional render pipeline.
- **Change type:** UX + access enhancement.
- **Dependencies:** workspaces defined (F4/F7/F8) so Telegram mirrors a stable action set.

### F16 — Ultimate Settings & Customization
- **Purpose:** One unified settings surface: chat prefs, analysis indicator/trader-profile prefs,
  **configurable panel layouts/presets**, themes/density/timezone, notification routing, export prefs.
- **Problem solved:** Settings are scattered (ChatPanel modal, localStorage toggles); layout is fixed.
- **Frontend:** settings route/modal; layout configuration layer over the modular panels.
- **Backend:** settings persistence (per-user once F14 lands; localStorage before).
- **Change type:** platform polish / UX.
- **Dependencies:** most features must exist first (F14 for per-user persistence).

### F17 — Live Execution Gate (final, gated)
- **Purpose:** Real OKX order connection (withdraw disabled), staged paper→micro→full rollout, strict
  per-order human approval, emergency cancel/flatten/disconnect, permission isolation, enforced guardrails.
- **Problem solved:** Turns the validated paper system into controlled live trading.
- **Frontend:** explicit live-mode controls + confirmations.
- **Backend:** OKX trading adapter (via F13), execution guardrails (F6), isolated live container.
- **Change type:** controlled execution gate.
- **Dependencies:** **ALL of** F6, F8, F9, F10 stable; ≥30 days paper; low-latency VPS region.
  Do not start until every prerequisite is met.

---

## Suggested build order (dependency-respecting)

1. **F12** schema hardening → **F1** OKX alignment → **F2** symbol registry (foundation).
2. **F3/F4** macro layer + Market Intelligence workspace (first visible product upgrade).
3. **F5** signal engine → **F6** risk engine → **F7** account/positions (the self-trading core).
4. **F8** paper execution → **F9** backtesting/replay → **F10** journal/review deepen.
5. **F11** news/catalyst, **F13** cross-asset adapter, **F15** mobile/Telegram, **F16** settings.
6. **F14** professional auth (after execution/review stable) → **F17** live gate (last).

---

*For the UI/workspace reshaping that several of these depend on, see `ui_redesign_context.md`.*
