# Future / Unfinished Phases — Overview (Phase 73+)

> **Purpose:** The authoritative forward roadmap for everything planned but **not yet built**,
> for an external product architect. Pairs with `current_platform_full_context.md` (what exists)
> and `ui_redesign_context.md` (UI critique).
>
> **Status:** Refined with ChatGPT, then passed through a **roadmap correction pass** that:
> (1) inserted a dedicated schema/data-foundation hardening phase before any heavy table creation,
> (2) broke the Risk↔Account dependency loop by splitting Account State Foundation out first,
> (3) made Factor Scoring v1 display-only/logged (not signal-gating), (4) made regime labels a
> deterministic output (AI explains, never assigns), (5) added a Macro Source Decision Matrix before
> any macro collector, and (6) added a later Settings/Customization phase. Phases are renumbered
> cleanly (73 → 97); no fractional numbers.
>
> **Progress:** **Phases 73, 74, and 75 are COMPLETE** (Information Architecture Reset, Design System
> Foundation, Context Desk Shell — see `docs/roadmap.md` and `docs/phase_status.md`). The **next
> implementation phase is Phase 76 (Schema & Data-Foundation Hardening)**, which must complete before
> any phase that creates new tables.
>
> **Direction:** crypto-first self-trading platform → information-architecture reset → Context Desk
> shell → **schema hardening** → consistent data (OKX alignment + symbol registry) → crypto factors →
> **macro source decision** → macro factors → factor scoring (display-only) → Context Desk v1 →
> AI analysis upgrade → persisted signals → **account state → risk engine → execution/account UI** →
> paper execution → backtesting → review & research → diagnostics → Telegram → cross-asset adapters →
> auth → settings → live-execution gate.

---

## 0. Guiding principles (settled)

**A — Macro is context, not the main product.** The macro/factor layer *supports* trading; it is
never the landing screen or the primary chart. The main line stays: crypto data → market context →
scanner → signal → risk → paper execution → review → eventually live execution. The Context Desk
must not become a "macro research website."

**B — Refactor information architecture *before* adding complex factors.** Step 1 is UI/IA: split
workspaces cleanly, re-home existing panels, add the Context Desk shell — then harden the schema —
and only then add factor data. Otherwise new features keep getting stuffed into the old structure.

**C — The most dangerous current problem is lack of unified state, not lack of panels.** The real
issues — Dashboard/Console mixed, no global active symbol, BTC-only AI, OKX-vs-Binance split,
orphaned AnalysisPanel, messy Console tabs, localStorage-only Portfolio, stateless scanner, no
persisted signals — cannot be solved by "adding one more panel."

**D — Determinism gates decisions; AI only explains.** Any label or score that *gates a trade
decision* — regime classification, factor stance, risk enforcement — must be a deterministic
rule/scoring output. AI may narrate or explain it, but AI is never the authority that assigns a
decision-gating regime label or enforces a risk limit.

**E — Schema discipline before data growth.** Many new tables are coming (factors, signals,
account, orders). Alembic must be the single source of truth *before* they are created, so growth
is reproducible and reversible.

---

## 1. The workspace model

### Immediate version (3 workspaces)
1. **Dashboard / Trading Desk** — *what is happening now.*
2. **Operator Console / Setup Desk** — *what setups can I take.*
3. **Context Desk / Factor Intelligence Desk** — *what environment am I trading inside.*

### Later version (6 workspaces)
1. Trading Desk · 2. Context Desk · 3. Operator Console · 4. Execution & Account ·
5. Review & Research · 6. Settings.

We do not build all six now: the highest-value move is to introduce the **Context Desk** and stop
using the Console as a dumping ground.

### 1.1 Dashboard / Trading Desk — real-time trading observation
Keep only what affects "can I read the tape now, wait for a setup, set an alert":
`PricePanel`, `OrderBookPanel`, `LiquidationPanel`, `DerivativesPanel`, `AlertsPanel`,
`ChatPanel` dock, `ServiceHealth`, `PriceTicker`, Symbol Selector. **Move out** journal, portfolio,
news, macro, performance.

### 1.2 Operator Console / Setup Desk — find & evaluate setups
Keep: `ScannerPanel`, `CandidatePanel`, `SignalMatrixPanel`, `EventLogPanel`, AI trade setup,
position-size calculator, setup notes, save-to-journal. Workflow: **scan → candidate → setup →
risk preview → save / reject**. **Move out:** Portfolio, News, Performance, Heatmap, full Journal review.

### 1.3 Context Desk / Factor Intelligence Desk — *new* trading-environment read
Crypto-first, but borrows the *shape* of four reference macro dashboards (US Rates Monitor,
USD Monitor, Inflation Monitor, Gold Monitor) without becoming a research site. Layers:

- **Top — Regime Header:** Crypto Regime (Risk-On / Neutral / Fragile / Crowded Long /
  Liquidity Trap — **deterministic, see Principle D**), Context Score 0–100, Trade Environment
  (Favorable / Caution / Avoid), Primary Driver (Derivatives / Macro / Liquidity / News),
  Next Major Event (CPI / FOMC / NFP / ETF Flow / Funding Reset).
- **Layer 1 — Crypto Factor Cards:** Funding, Open Interest, Long/Short Ratio, Liquidation
  Pressure, Orderbook Imbalance, Volatility, BTC Dominance, Total Crypto Market Cap, Fear & Greed,
  Relative Strength.
- **Layer 2 — Macro Factor Cards:** DXY/USD pressure, UST 2Y/10Y/30Y, real yields, Gold,
  SPX/Nasdaq, VIX/MOVE, CPI/PCE/NFP/FOMC calendar, inflation-pressure proxy.
- **Layer 3 — Asset Signal Tower** (à la Inflation Monitor): BTC, ETH, SOL, DXY, Gold, UST 10Y,
  SPX/Nasdaq — each with setup bias / confidence / key driver / key risk.
- **Layer 4 — Factor Scorecard** (à la US Rates Monitor): per-factor weights (fixed first,
  user-customizable later) → total score → long-bias / short-bias / neutral.
- **Layer 5 — Narrative / News / Event Layer:** crypto news, macro event calendar, AI summary,
  event-risk flags, catalyst tagging.

---

## 2. Phase roadmap (Phase 73 → 97)

> Per phase: **Goal / What to build / Why / Do not build yet** plus compact architect fields —
> **Change type** ∈ {UX redesign, structural refactor, data expansion, planning/decision, logic
> layer, execution layer} and **Dependencies**.

### Phase 73 — Information Architecture Reset
- **Goal:** Upgrade the Dashboard+Console two-page structure into three clear workspaces
  (Trading Desk, Operator Console, Context Desk).
- **Build (frontend):** workspace switcher; keep current Dashboard as Trading Desk; keep
  scanner/candidate/event as Operator Console core; create an empty Context Desk route; move
  News/Heatmap/Global Stats/Fear&Greed/Correlation out of Console tabs; **mount AnalysisPanel
  properly** (un-orphan); **rename** the two analyses → "Scheduled Market Summary" and
  "Chart Trade Setup Analysis".
- **Build (backend):** none major; only adjust API calls if relocated panels need props.
- **Why first:** the natural workflow is understand → find → act/manage → review, currently
  crushed into two pages; without the IA reset every new feature keeps becoming a temp panel.
- **Do not build yet:** macro collectors, scoring engine, account system, execution system.
- **Change type:** UX redesign. **Dependencies:** none.

### Phase 74 — Design System Foundation
- **Goal:** Minimal design-token layer so later redesign doesn't require per-panel inline-CSS edits.
- **Build (frontend):** expand `panelStyles.ts` into a small design system; primitives — Card,
  Button, Badge, Tabs, SectionHeader, MetricCard, ScoreBar, FactorCard, WorkspaceShell; token
  groups — colors, spacing, typography, radius, shadows, density modes.
- **Why:** almost all styles are inline `CSSProperties` today; no tokens/theming/primitives.
- **Do not build yet:** full theme customization, drag-and-drop layout, settings system.
- **Change type:** UX infrastructure. **Dependencies:** none (parallel with 73).

### Phase 75 — Context Desk Shell
- **Goal:** Add the third main workspace using **existing data only**.
- **Build (frontend):** `ContextDesk.tsx` with sections — Overview, Crypto Factors, Macro Factors,
  Events/News, Asset Signal Tower, Scorecard. Initially reuse Fear&Greed, CoinGecko global stats,
  NewsPanel, RelativeStrength, correlation matrix, Heatmap, Derivatives summary.
- **Build (backend):** none — use existing endpoints.
- **UI target:** top regime/score banner, factor cards, warning/education banner, event-calendar
  strip, signal tower — but stay crypto-first. (Regime/score are placeholders here; real logic lands 79–83.)
- **Do not build yet:** real macro model, SHAP, IC tracking, backtest account.
- **Change type:** UX redesign / new workspace. **Dependencies:** 73, 74.

### Phase 76 — Schema & Data-Foundation Hardening  *(NEW — correction #1)*
- **Goal:** Make Alembic the single source of truth and retire the fragile startup path **before**
  any phase creates many new tables.
- **Build (backend):**
  - Retire startup `Base.metadata.create_all` + the ad-hoc `ALTER TABLE IF NOT EXISTS` block in the
    `main.py` lifespan; replace with proper Alembic revisions; `alembic stamp head` on the live VPS DB.
  - Backfill Alembic revisions for the columns that were added via startup `ALTER`
    (`alerts.webhook_url`, `journal_entries.notes`, `journal_entries.notified_outcome`) so Alembic
    state matches reality.
  - Add **index discipline** (documented indexes for time-series queries on `symbol, timestamp`),
    **retention discipline** (pruning policy per high-volume table), and a **backfill discipline**
    (repeatable scripts for re-deriving normalized values).
  - CI/dev guard: schema changes must ship as a migration, not a model edit alone.
- **Why:** Phases 79+ introduce ~14 new tables (factors, signals, account, orders). Doing this now
  makes that growth reproducible and reversible; doing it later means migrating a live, messy schema.
- **Do not build yet:** the new tables themselves — only the migration discipline + existing-table cleanup.
- **Change type:** structural refactor / data foundation. **Dependencies:** 73–75 (IA stable first).
- **This phase MUST precede:** `factor_observations`, `regime_snapshots`, `factor_scores`,
  `factor_weights`, `signals`, `signal_*`, `positions`, `orders`, `order_events`, `account_snapshots`,
  `equity_curve`, `trade_stats`.

### Phase 77 — OKX Perpetual Alignment Completion
- **Goal:** Make OKX perpetual-swap data the consistent base for chart, order book, derivatives,
  liquidations, and AI analysis.
- **Problem:** price/order book are OKX, but derivatives/liquidations are Binance Futures, and
  chart analysis still pulls **Binance spot BTCUSDT**.
- **Build (backend):** move chart-analysis klines to OKX + make symbol-aware; evaluate OKX
  replacements for liquidations / funding / OI / long-short; update labels where metrics stay
  cross-venue; add clear source tags.
- **Build (frontend):** data-source badges (OKX Perp / Binance Futures fallback / CoinGecko /
  macro source later).
- **Why:** serious signal/risk logic can't be built while panels silently read different venues.
- **Change type:** structural refactor / data consistency. **Dependencies:** 76.

### Phase 78 — Symbol Registry as Single Source of Truth
- **Goal:** Make `tracked_symbols` the true global registry.
- **Problem:** registry table exists but most paths use hardcoded BTC/ETH/SOL lists.
- **Build (backend):** collectors read active symbols from DB/config; routers + scanner + AI
  context builder use the registry mapping; Telegram commands accept a symbol.
- **Build (frontend):** global symbol selector drives all workspaces; Context Desk respects active
  symbol; AI chat and chart analysis become symbol-aware.
- **Do not build yet:** large multi-exchange adapter system; stocks/options.
- **Change type:** structural refactor. **Dependencies:** 77.

### Phase 79 — Crypto Factor Collector Pack
- **Goal:** Build crypto-native factor inputs before macro expansion.
- **Collect/normalize:** funding, OI, long/short, liquidation pressure, order-book imbalance, depth
  wall concentration, volatility, BTC dominance, total crypto mcap, Fear & Greed, relative strength,
  correlation regime.
- **Build (frontend):** Context Desk Crypto Factor Cards, Crypto Regime Summary, Derivatives
  Pressure Score, Liquidity Pressure Score.
- **Build (backend):** `factor_observations`, `regime_snapshots` (via Alembic — Phase 76), normalized
  score functions, source-quality flags. **Regime labels here are deterministic (Principle D).**
- **Change type:** data expansion. **Dependencies:** 76 (schema), 77, 78.

### Phase 80 — Macro Source Decision Matrix  *(NEW — correction #5; planning, no collectors)*
- **Goal:** Before writing any macro collector, decide and document the sourcing for every macro item.
- **Build (doc/decision):** a matrix where **each macro data item** (DXY, UST 2Y/10Y/30Y, real yields,
  Gold, SPX/Nasdaq, VIX/MOVE, CPI/PCE/NFP/FOMC calendar, inflation proxy, risk-on/off proxy) has:
  - provider · cost/free-tier · update frequency · API/rate limits · production reliability ·
    fallback source · caching rule · freshness/timestamp rule.
- **Why:** free, reliable macro feeds are a real constraint; committing collectors before sourcing is
  decided causes rework and rate-limit failures in production.
- **Do not build yet:** the macro collectors themselves (that is Phase 81).
- **Change type:** planning / decision. **Dependencies:** 79 (crypto factors prove the pattern first).

### Phase 81 — Macro Factor Collector Pack
- **Goal:** Bring in macro context as a supporting layer (not a research site).
- **Collect:** the items defined in the Phase 80 matrix, using the decided providers/fallbacks/caching.
- **Design references:** US Rates Monitor (yield curve / policy / factor scorecard), USD Monitor
  (equation-style scoring), Inflation Monitor (regime score + asset signal tower), Gold Monitor
  (later factor attribution / research diagnostics).
- **Important:** must feed Context Desk + signal scoring only — not become a macro research website.
- **Change type:** data expansion. **Dependencies:** 80 (sourcing decided), 76 (schema), 79.

### Phase 82 — Factor Scoring Engine v1  *(clarified — correction #3)*
- **Goal:** Convert raw factor data into structured scores — **display-only in v1.**
- **v1 behavior (explicit):** the Context Score is **display-only and logged to `regime_snapshots`/
  scoring history**. It **does not gate scanner decisions and does not alter trade signals.** Scanner/
  signal integration happens later (Phase 85) via persisted signals + `signal_context_snapshots`.
- **Score model:** `Context Score = Crypto Derivatives + Liquidity + Momentum + Macro Pressure +
  Volatility + News/Catalyst`. Each factor carries: raw value, normalized score, direction
  (supports long / short / neutral), confidence, weight, source, timestamp, explanation.
- **Build (backend):** `factor_scores`, `factor_weights`, scoring services, scoring-history endpoint.
- **Build (frontend):** Context Desk score header, factor cards, editable weights (later), consensus
  bar (supports long / neutral / supports short).
- **Determinism (Principle D):** stance and any regime label are computed by rules/weights; AI text
  only explains them.
- **Change type:** logic layer. **Dependencies:** 79, 81.

### Phase 83 — Context Desk v1 Complete
- **Goal:** Make the Context Desk usable as a daily trading-support page.
- **Must include:** Context Score Header, Regime Banner (deterministic), Crypto Factor Cards, Macro
  Factor Cards, Asset Signal Tower, Event Calendar Strip, News/Narrative Summary, AI Market Context
  Summary, source-freshness/data-quality indicators.
- **Asset Signal Tower:** BTC, ETH, SOL, DXY, Gold, UST 10Y, SPX/Nasdaq — each with bias, confidence,
  key driver, key risk, historical note. **Non-crypto rows are context-only**, not the start of a
  cross-asset trading vertical (that is Phase 94).
- **Change type:** feature completion / UX. **Dependencies:** 82.

### Phase 84 — AI Analysis Separation and Upgrade
- **Goal:** Fix the duplicated "analysis" concepts and upgrade analysis into trader-specific decision support.
- **Rename flows:** Scheduled Market Summary · Chart Trade Setup Analysis · Context Regime Summary ·
  Signal Rationale · Risk Review.
- **Add trader inputs:** trading style, risk per trade, preferred holding duration, target R:R,
  preferred setup types, excluded conditions, max risk environment.
- **Add annotation lifecycle:** clear lines, expire after time, invalidate when price breaks
  condition, supersede old analysis on new, manual clear button.
- **Change type:** AI workflow refactor. **Dependencies:** 73 (renames), benefits from 78, 82.

### Phase 85 — Persisted Signal Engine v1
- **Goal:** Turn scanner output into real persisted signal objects — and the first place Context
  Score is *consumed* by signals (per correction #3).
- **Problem:** scanner is stateless and recomputed each request; no lifecycle or audit trail.
- **Lifecycle:** candidate → pending → active → invalidated → expired → hit_tp → hit_sl → archived.
- **Build (backend):** `signals`, `signal_factors`, `signal_context_snapshots` (captures the Context
  Score/regime at signal time), `signal_events`, lifecycle worker.
- **Build (frontend):** Operator Console signal queue, candidate detail, factor contribution,
  invalidation status, expiry timer, "send to risk review".
- **Change type:** structural logic layer. **Dependencies:** 76, 77, 78, 82.

### Phase 86 — Account State Foundation  *(NEW — correction #2, split out first)*
- **Goal:** Establish the account/equity state base **before** the risk engine, so Risk does not
  depend on the workspace UI.
- **Build (backend):** `account_snapshots`, a **simulated capital / equity base**, and an
  **open-exposure base** (current exposure derivable from open positions/proposals). Define the
  account ledger primitives the risk engine will read.
- **Why:** breaks the previous Risk↔Account-Workspace dependency loop — Risk needs *account state*,
  not the *workspace*. This phase provides the state; the workspace UI comes later (Phase 88).
- **Do not build yet:** the full Execution & Account workspace UI; paper order placement.
- **Change type:** state-management foundation. **Dependencies:** 76 (schema).

### Phase 87 — Risk Engine v1
- **Goal:** A non-AI **deterministic** risk engine.
- **Must include:** risk per trade; stop type (structure / ATR / manual); position sizing; max open
  risk; max daily loss cap; scale-in rules; kill switch; risk events.
- **Important (Principle D):** AI may *explain* risk, but must **not enforce** it — enforcement is deterministic.
- **Change type:** logic layer. **Dependencies:** 85 (signals to size), **86 (account/exposure state to
  cap against)** — *not* the workspace UI.

### Phase 88 — Execution & Account Workspace (UI)
- **Goal:** Build the user-facing account / trades / performance workspace on top of the foundations.
- **Panels — Account Total:** balance, return, net profit, daily gain/loss, equity curve, drawdown,
  open risk, margin estimate. **Trades:** win/loss ratio (day/month/year), total PnL
  (day/month/year), active positions, closed trades, AI trading score. **Risk:** current exposure,
  open risk by symbol, rule adherence, risk warning, kill-switch status.
- **Build (backend):** `positions`, `orders`, `order_events`, `equity_curve`, `trade_stats` (built on
  the Phase 86 account base).
- **Solves:** PortfolioPanel is localStorage-only; there is no real account ledger.
- **Change type:** new workspace / state-management layer. **Dependencies:** 86, 87.

### Phase 89 — Paper Execution Adapter
- **Goal:** Enable **paper execution only**.
- **Flow:** signal → risk-sized proposal → user approve/reject → paper order → position →
  stop/target tracking → journal.
- **Rules:** no live trading; no exchange trading keys; every action requires confirmation; full
  event log; Telegram confirm buttons only after the web flow is stable.
- **Change type:** execution workflow. **Dependencies:** 85, 87, 88.

### Phase 90 — Backtesting and Replay
- **Goal:** Allow strategy testing before real risk.
- **Features:** historical replay; strategy backtest; trade list; equity curve; max drawdown; win
  rate; R-multiple distribution; profit factor; parameter comparison; factor context at signal time.
- **Why:** backtesting is required before any live-execution gate.
- **Change type:** research / validation layer. **Dependencies:** 77/78 (clean data), 85 (signal defs).

### Phase 91 — Review & Research Workspace
- **Goal:** Separate review from the Console.
- **Move here:** `JournalPanel`, `PerformancePanel`, AI Journal Insights, backtesting results,
  replay panel, trade notes, factor attribution, model diagnostics.
- **Add:** end-of-day review, end-of-week review, setup-type performance, regime-based performance,
  rule-adherence score, AI coaching summary.
- **Change type:** workspace / review loop. **Dependencies:** 90.

### Phase 92 — Model Diagnostics and Factor Attribution
- **Goal:** Borrow the advanced research style from Gold Monitor.
- **Features:** factor contribution, SHAP-like attribution, IC tracking, regime heatmap, correlation
  matrix, factor performance over time, strategy performance by regime.
- **Important:** do not build too early — requires historical signal/outcome data to be meaningful.
- **Change type:** research diagnostics. **Dependencies:** enough data from 85/89/91.

### Phase 93 — Telegram UX Upgrade
- **Goal:** Make Telegram usable without memorizing commands.
- **Features:** BotFather command menu; persistent reply keyboard; inline keyboards for common
  actions; symbol switching; `/context`, `/signals`, `/risk`, `/positions`, `/history`;
  chart/context snapshot delivery.
- **Fix naming (avoid duplicate `/analysis`):** `/market` (commentary), `/setup` (trade setup),
  `/context` (factor/regime summary), `/signals` (scanner), `/risk` (risk/account summary).
- **Change type:** external access / UX. **Dependencies:** workspaces + actions stable (73, 88, 89).

### Phase 94 — Cross-Asset Adapter Refactor
- **Goal:** Prepare for future stocks/options without disturbing the crypto-first mission.
- **Add adapter interfaces:** market data, derivatives, execution, account, news/catalyst.
- **Why:** the stock reference platform is useful, but stocks/options are a future vertical, not
  something that derails current crypto work.
- **Change type:** architecture refactor. **Dependencies:** 77, 89.

### Phase 95 — Professional Account / Auth System
- **Goal:** Move from single-user Basic Auth to proper app-level accounts.
- **Include:** users table; signup/login; password hashing; sessions; account recovery; roles; auth
  middleware; per-user settings / alerts / risk profile.
- **Timing:** after core safety, paper execution, review loop, deployment stability — deferred, not abandoned.
- **Change type:** professionalization. **Dependencies:** 87–91 stable.

### Phase 96 — Settings / Customization  *(NEW — correction #6)*
- **Goal:** A unified settings surface (the "Settings" workspace in the later nav model).
- **Build (frontend + backend):** unified settings panel; **layout presets** (configurable workspace
  layouts using the Phase 74 primitives); **model preferences** (default AI model per surface);
  **notification routing** (browser / Telegram / webhook per alert + quiet hours); **factor weights**
  (user-editable Context Score weights from Phase 82); display/theme/density; export preferences.
- **Persistence:** **per-user** settings once auth exists (Phase 95); `localStorage` fallback before
  that for any setting surfaced earlier.
- **Why a discrete phase:** settings are most useful once all features exist; building earlier means
  rebuilding. Folding factor weights here keeps Phase 82 v1 simple (fixed weights).
- **Change type:** platform polish / UX. **Dependencies:** 95 (per-user persistence), 74 (primitives),
  82 (factor weights), 88 (account/risk prefs).

### Phase 97 — Live Execution Gate (final, gated)
- **Goal:** Allow real exchange execution only after paper execution is proven.
- **Requirements before start:** OKX alignment complete; risk engine stable; paper execution stable;
  backtesting useful; review loop useful; ≥30 days paper data; kill switch; manual approval; strict
  key permissions; separate live environment.
- **Rule:** no fully autonomous live trading.
- **Change type:** controlled execution gate. **Dependencies:** ALL of 87, 89, 90, 91 stable.

---

## 3. Navigation model

- **Immediate:** `Dashboard` · `Console` · `Context`.
- **Later:** `Trading Desk` · `Context Desk` · `Operator Console` · `Execution & Account` ·
  `Review & Research` · `Settings`.

We don't build all six now because the platform needs a clean transition; the highest-value move is
introducing the Context Desk and ending the Console-as-dumping-ground pattern.

---

## 4. Panel reassignment plan

| Current panel | New home |
|---|---|
| PricePanel | Dashboard / Trading Desk |
| OrderBookPanel | Dashboard / Trading Desk |
| LiquidationPanel | Dashboard + Context summary |
| DerivativesPanel | Dashboard + Context summary |
| AlertsPanel | Dashboard / Trading Desk |
| ChatPanel | Dockable global assistant |
| ScannerPanel | Operator Console |
| CandidatePanel | Operator Console |
| SignalMatrixPanel | Operator Console, later Signal Engine |
| EventLogPanel | Operator Console, later also global |
| NewsPanel | Context Desk |
| HeatmapPanel | Context Desk |
| RelativeStrength | Header + Context Desk |
| Fear & Greed | Context Desk |
| Global Stats | Context Desk |
| Correlation Matrix | Context Desk |
| AnalysisPanel | Context Desk or Dashboard side summary |
| PortfolioPanel | Execution & Account (later) |
| JournalPanel | Review & Research (later) |
| PerformancePanel | Review & Research (later) |

---

## 5. Build status & what's next

**Completed first slice (✅ done):** **Phase 73** (Information Architecture Reset — 3 workspaces),
**Phase 74** (Design System Foundation — `src/theme/` tokens + primitives), **Phase 75** (Context Desk
Shell — 6-tab workspace from existing data only). The first-slice guardrails (no new data providers,
no new strategy logic, no backend collector refactors) were honored.

**Next: Phase 76 — Schema & Data-Foundation Hardening** (make Alembic the single source of truth;
retire startup `create_all` + ad-hoc `ALTER`; add index/retention/backfill discipline) — **before any
phase that creates new tables.** Do not begin until the user approves the plan; see
`docs/next_task.md` for the execution brief.

**Framing:** not "Dashboard + Console + one more panel," but **Trading workflow + Setup workflow +
Context intelligence workflow** — the Context Desk is a real workspace, not another giant panel:

- Dashboard = what is happening now
- Console = what setups can I take
- Context Desk = what environment am I trading inside
- Execution & Account = what am I managing
- Review & Research = what did I learn

---

*For the redesigned-vs-new outline (for external double-check), see
`docs/redesign_outline_for_review.md`. For the UI critique, see `docs/ui_redesign_context.md`.*
