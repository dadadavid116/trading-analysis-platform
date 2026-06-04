# Future / Unfinished Phases — Overview (Phase 73+)

> **Purpose:** The authoritative forward roadmap for everything planned but **not yet built**,
> for an external product architect. Pairs with `current_platform_full_context.md` (what exists)
> and `ui_redesign_context.md` (UI critique).
>
> **This version supersedes the earlier `F1–F17` draft** in this file. The plan below was refined
> with ChatGPT and reframes the future around **three (later five) explicit workspaces** plus a new
> **Context Desk / Factor Intelligence** layer. The earlier `F#` items are mapped to the new
> `Phase 73+` numbering in `docs/redesign_outline_for_review.md`.
>
> **Direction:** crypto-first self-trading platform → information-architecture reset →
> Context Desk (factor/macro intelligence as *supporting context*) → consistent data
> (OKX alignment + symbol registry) → factor collectors + scoring engine → AI analysis upgrade →
> persisted signal engine → risk engine → execution & account → paper execution → backtesting →
> review & research → diagnostics → Telegram → cross-asset adapters → auth → live-execution gate.

---

## 0. Guiding principles (settled)

**A — Macro is context, not the main product.** The macro/factor layer *supports* trading; it is
never the landing screen or the primary chart. The main line stays: crypto data → market context →
scanner → signal → risk → paper execution → review → eventually live execution. The Context Desk
must not become a "macro research website."

**B — Refactor information architecture *before* adding complex factors.** Do not start writing
DXY/CPI/Treasury collectors first. Step 1 is UI/IA: split workspaces cleanly, re-home existing
panels, add the Context Desk shell, and only then add factor data. Otherwise new features keep
getting stuffed into the old structure.

**C — The most dangerous current problem is lack of unified state, not lack of panels.** The real
issues — Dashboard/Console mixed, no global active symbol, BTC-only AI, OKX-vs-Binance split,
orphaned AnalysisPanel, messy Console tabs, localStorage-only Portfolio, stateless scanner, no
persisted signals — cannot be solved by "adding one more panel."

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
  Liquidity Trap), Context Score 0–100, Trade Environment (Favorable / Caution / Avoid),
  Primary Driver (Derivatives / Macro / Liquidity / News), Next Major Event (CPI / FOMC / NFP /
  ETF Flow / Funding Reset).
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

## 2. Phase roadmap (Phase 73 → 93)

> Each phase keeps the source plan's **Goal / What to build / Why / Do not build yet** plus compact
> architect fields: **Change type** ∈ {UX redesign, structural refactor, data expansion, logic layer,
> execution layer} and **Dependencies**.

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
  strip, signal tower — but stay crypto-first.
- **Do not build yet:** real macro model, SHAP, IC tracking, backtest account.
- **Change type:** UX redesign / new workspace. **Dependencies:** 73, 74.

### Phase 76 — OKX Perpetual Alignment Completion
- **Goal:** Make OKX perpetual-swap data the consistent base for chart, order book, derivatives,
  liquidations, and AI analysis.
- **Problem:** price/order book are OKX, but derivatives/liquidations are Binance Futures, and
  chart analysis still pulls **Binance spot BTCUSDT**.
- **Build (backend):** move chart-analysis klines to OKX + make symbol-aware; evaluate OKX
  replacements for liquidations / funding / OI / long-short; update labels where metrics stay
  cross-venue; add clear source tags.
- **Build (frontend):** data-source badges (OKX Perp / Binance Futures fallback / CoinGecko /
  FRED-or-macro later).
- **Why:** serious signal/risk logic can't be built while panels silently read different venues.
- **Change type:** structural refactor / data consistency. **Dependencies:** none (do early).

### Phase 77 — Symbol Registry as Single Source of Truth
- **Goal:** Make `tracked_symbols` the true global registry.
- **Problem:** registry table exists but most paths use hardcoded BTC/ETH/SOL lists.
- **Build (backend):** collectors read active symbols from DB/config; routers + scanner + AI
  context builder use the registry mapping; Telegram commands accept a symbol.
- **Build (frontend):** global symbol selector drives all workspaces; Context Desk respects active
  symbol; AI chat and chart analysis become symbol-aware.
- **Do not build yet:** large multi-exchange adapter system; stocks/options.
- **Change type:** structural refactor. **Dependencies:** 76.

### Phase 78 — Crypto Factor Collector Pack
- **Goal:** Build crypto-native factor inputs before macro expansion.
- **Collect/normalize:** funding, OI, long/short, liquidation pressure, order-book imbalance, depth
  wall concentration, volatility, BTC dominance, total crypto mcap, Fear & Greed, relative strength,
  correlation regime.
- **Build (frontend):** Context Desk Crypto Factor Cards, Crypto Regime Summary, Derivatives
  Pressure Score, Liquidity Pressure Score.
- **Build (backend):** `factor_observations`, `regime_snapshots`, normalized score functions,
  source-quality flags.
- **Change type:** data expansion. **Dependencies:** 75, 76, 77.

### Phase 79 — Macro Factor Collector Pack
- **Goal:** Bring in macro context as a supporting layer (not a research site).
- **Collect:** DXY; UST 2Y/10Y/30Y; yield-curve slope; real yields (if available); gold;
  SPX/Nasdaq; VIX/MOVE (if available); CPI/PCE/NFP/FOMC calendar; inflation-pressure proxy;
  risk-on/off proxy.
- **Design references:** US Rates Monitor (yield curve / policy / factor scorecard), USD Monitor
  (equation-style scoring), Inflation Monitor (regime score + asset signal tower), Gold Monitor
  (later factor attribution / research diagnostics).
- **Important:** must feed Context Desk + signal scoring only — not become a macro research website.
- **Change type:** data expansion. **Dependencies:** 78 (crypto factors first).

### Phase 80 — Factor Scoring Engine v1
- **Goal:** Convert raw factor data into structured scores.
- **Score model:** `Context Score = Crypto Derivatives + Liquidity + Momentum + Macro Pressure +
  Volatility + News/Catalyst`. Each factor carries: raw value, normalized score, direction
  (supports long / short / neutral), confidence, weight, source, timestamp, explanation.
- **Build (backend):** `factor_scores`, `factor_weights`, scoring services, scoring-history endpoint.
- **Build (frontend):** Context Desk score header, factor cards, editable weights (later), consensus
  bar (supports long / neutral / supports short).
- **Reference:** the "data → stance" concept from the US Rates factor scorecard.
- **Change type:** logic layer. **Dependencies:** 78, 79.

### Phase 81 — Context Desk v1 Complete
- **Goal:** Make the Context Desk usable as a daily trading-support page.
- **Must include:** Context Score Header, Regime Banner, Crypto Factor Cards, Macro Factor Cards,
  Asset Signal Tower, Event Calendar Strip, News/Narrative Summary, AI Market Context Summary,
  source-freshness/data-quality indicators.
- **Asset Signal Tower:** BTC, ETH, SOL, DXY, Gold, UST 10Y, SPX/Nasdaq — each with bias,
  confidence, key driver, key risk, historical note (borrows Inflation Monitor's asset mapping).
- **Change type:** feature completion / UX. **Dependencies:** 80.

### Phase 82 — AI Analysis Separation and Upgrade
- **Goal:** Fix the duplicated "analysis" concepts and upgrade analysis into trader-specific decision support.
- **Rename flows:** Scheduled Market Summary · Chart Trade Setup Analysis · Context Regime Summary ·
  Signal Rationale · Risk Review.
- **Add trader inputs:** trading style, risk per trade, preferred holding duration, target R:R,
  preferred setup types, excluded conditions, max risk environment.
- **Add annotation lifecycle:** clear lines, expire after time, invalidate when price breaks
  condition, supersede old analysis on new, manual clear button.
- **Why:** current chart analysis is mostly interpretation; it should become setup validation based
  on the user's actual trading style.
- **Change type:** AI workflow refactor. **Dependencies:** 73 (renames), benefits from 77, 80.

### Phase 83 — Persisted Signal Engine v1
- **Goal:** Turn scanner output into real persisted signal objects.
- **Problem:** scanner is stateless and recomputed each request; no lifecycle or audit trail.
- **Lifecycle:** candidate → pending → active → invalidated → expired → hit_tp → hit_sl → archived.
- **Build (backend):** `signals`, `signal_factors`, `signal_context_snapshots`, `signal_events`,
  lifecycle worker.
- **Build (frontend):** Operator Console signal queue, candidate detail, factor contribution,
  invalidation status, expiry timer, "send to risk review".
- **Change type:** structural logic layer. **Dependencies:** 76, 77, 80.

### Phase 84 — Risk Engine v1
- **Goal:** A non-AI **deterministic** risk engine.
- **Must include:** risk per trade; stop type (structure / ATR / manual); position sizing; max open
  risk; max daily loss; scale-in rules; kill switch; risk events.
- **Important:** AI may *explain* risk, but must **not enforce** it — enforcement is deterministic.
- **Change type:** logic layer. **Dependencies:** 83 (signals to size), 85 (account to cap against).

### Phase 85 — Execution & Account Workspace
- **Goal:** Build the user account / trades / performance workspace.
- **Panels — Account Total:** balance, return, net profit, daily gain/loss, equity curve, drawdown,
  open risk, margin estimate. **Trades:** win/loss ratio (day/month/year), total PnL
  (day/month/year), active positions, closed trades, AI trading score. **Risk:** current exposure,
  open risk by symbol, rule adherence, risk warning, kill-switch status.
- **Build (backend):** `positions`, `orders`, `order_events`, `account_snapshots`, `equity_curve`,
  `trade_stats`.
- **Solves:** PortfolioPanel is localStorage-only; there is no real account ledger.
- **Change type:** new workspace / state-management layer. **Dependencies:** 84.

### Phase 86 — Paper Execution Adapter
- **Goal:** Enable **paper execution only**.
- **Flow:** signal → risk-sized proposal → user approve/reject → paper order → position →
  stop/target tracking → journal.
- **Rules:** no live trading; no exchange trading keys; every action requires confirmation; full
  event log; Telegram confirm buttons only after the web flow is stable.
- **Change type:** execution workflow. **Dependencies:** 83, 84, 85.

### Phase 87 — Backtesting and Replay
- **Goal:** Allow strategy testing before real risk.
- **Features:** historical replay; strategy backtest; trade list; equity curve; max drawdown; win
  rate; R-multiple distribution; profit factor; parameter comparison; factor context at signal time.
- **Why:** backtesting is required before any live-execution gate.
- **Change type:** research / validation layer. **Dependencies:** 76/77 (clean data), 83 (signal defs).

### Phase 88 — Review & Research Workspace
- **Goal:** Separate review from the Console.
- **Move here:** `JournalPanel`, `PerformancePanel`, AI Journal Insights, backtesting results,
  replay panel, trade notes, factor attribution, model diagnostics.
- **Add:** end-of-day review, end-of-week review, setup-type performance, regime-based performance,
  rule-adherence score, AI coaching summary.
- **Change type:** workspace / review loop. **Dependencies:** 87.

### Phase 89 — Model Diagnostics and Factor Attribution
- **Goal:** Borrow the advanced research style from Gold Monitor.
- **Features:** factor contribution, SHAP-like attribution, IC tracking, regime heatmap, correlation
  matrix, factor performance over time, strategy performance by regime.
- **Important:** do not build too early — requires historical signal/outcome data to be meaningful.
- **Change type:** research diagnostics. **Dependencies:** enough data from 83/86/88.

### Phase 90 — Telegram UX Upgrade
- **Goal:** Make Telegram usable without memorizing commands.
- **Features:** BotFather command menu; persistent reply keyboard; inline keyboards for common
  actions; symbol switching; `/context`, `/signals`, `/risk`, `/positions`, `/history`;
  chart/context snapshot delivery.
- **Fix naming (avoid duplicate `/analysis`):** `/market` (commentary), `/setup` (trade setup),
  `/context` (factor/regime summary), `/signals` (scanner), `/risk` (risk/account summary).
- **Change type:** external access / UX. **Dependencies:** workspaces + actions stable (73, 85, 86).

### Phase 91 — Cross-Asset Adapter Refactor
- **Goal:** Prepare for future stocks/options without disturbing the crypto-first mission.
- **Add adapter interfaces:** market data, derivatives, execution, account, news/catalyst.
- **Why:** the stock reference platform is useful, but stocks/options are a future vertical, not
  something that derails current crypto work.
- **Change type:** architecture refactor. **Dependencies:** 76, 86.

### Phase 92 — Professional Account / Auth System
- **Goal:** Move from single-user Basic Auth to proper app-level accounts.
- **Include:** users table; signup/login; password hashing; sessions; account recovery; roles; auth
  middleware; per-user settings / alerts / risk profile.
- **Timing:** after core safety, paper execution, review loop, deployment stability — deferred, not abandoned.
- **Change type:** professionalization. **Dependencies:** 84–88 stable.

### Phase 93 — Live Execution Gate (final, gated)
- **Goal:** Allow real exchange execution only after paper execution is proven.
- **Requirements before start:** OKX alignment complete; risk engine stable; paper execution stable;
  backtesting useful; review loop useful; ≥30 days paper data; kill switch; manual approval; strict
  key permissions; separate live environment.
- **Rule:** no fully autonomous live trading.
- **Change type:** controlled execution gate. **Dependencies:** ALL of 84, 86, 87, 88 stable.

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

## 5. What to build first (Claude-ready)

The **next** task is **not** macro collectors. It is **Phase 73 + 74 + 75**:
information-architecture reset, design-system foundation, and the Context Desk shell using existing
data only. That gives the visual/product foundation to safely add factor intelligence later.

**First implementation prompt should instruct:**
> Do not add new data providers yet. Do not add new strategy logic yet. Do not refactor backend
> collectors yet.
> First: (1) add the new workspace navigation model; (2) create Context Desk as the third main
> workspace; (3) relocate existing auxiliary panels into Context Desk; (4) mount AnalysisPanel
> properly; (5) rename duplicated analysis concepts; (6) extract minimal design tokens and shared UI
> primitives; (7) preserve current functionality; (8) keep the crypto trading workflow central.

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
