# UI / Product Redesign Context

> **Purpose:** Honest design critique of the current UI plus a concrete redesign target, for a
> UI/product architect. Pairs with `current_platform_full_context.md` (what exists) and
> `future_phases_unfinished_overview.md` (what's planned).
>
> **Constraint:** This is a **crypto trade-analysis/decision platform first**. Macro/factor data is
> *supporting context*, never the headline. The redesign must keep the trading workflow central.

---

## Status update — after Phases 73–75 (read first)

This document's original critique (Part A) and recommendation (Part B) were written at the **Phase 72**
state. **Phases 73–75 have since shipped** and implemented the first, structural part of the redesign.
Read Parts A/B as the *rationale*; this banner is the *current reality*.

**What Phases 73–75 improved:**
- **Workspace model introduced** — the app now has **three workspaces** (Dashboard/Trading Desk ·
  Operator Console · **Context Desk**), with a 6-workspace target later. This directly addresses the
  old "no workspace concept" and "two pages carrying ~18 panels" problems (A2, A1, A6).
- **Context Desk exists as a real third workspace** (not just another panel) — it now homes the
  auxiliary intelligence (news, heatmap, global stats, Fear&Greed, relative strength, market summary)
  that used to be dumped in the Console tab strip (A4 partial, the "no home" problem).
- **Orphan/naming fixed** — `AnalysisPanel` is mounted; the two analyses were renamed (A4).
- **Design-system foundation built (Phase 74)** — `src/theme/` tokens + primitives replace "no design
  system" (A8). **Important: Phase 74 is technical/shared foundation only — NOT the final visual
  identity.**

**What still remains (open design problems):**
- **Fixed, non-configurable layouts** (A7) — deferred to Phase 96 (Settings/Customization).
- **Two style systems coexist** — new `theme/` primitives (Context Desk) vs legacy `panelStyles.ts`
  (all other panels); migration is incremental.
- **Execution & Account / Review & Research workspaces don't exist yet** — Journal/Performance/Portfolio
  sit temporarily in the Console (Phases 85–91).
- **Cross-venue + BTC-only inconsistencies** (A5) — Phases 77/78.
- **Symbol model still half-global** (A9).

**Deferred by decision:** the **final premium visual design / layout exploration is postponed** until
the future phases / product architecture are locked and the user explicitly reopens it (see
`decision_log.md` D14). Do not start a visual-identity redesign before then.

> **Note on naming:** Part B below proposed a "Market Intelligence" workspace; the implemented
> direction instead uses **Context Desk** (and Trading Desk / Operator Console). The authoritative,
> current workspace model + roadmap is `docs/future_phases_unfinished_overview.md`.

---

## Part A — Current Design Problems (honest + specific) — *as of Phase 72; see status banner above*

### A1. Panels were added incrementally and now overflow their containers
There are ~18 panels spread across **only two pages**:
- **Dashboard** (desktop): a fixed 5-panel grid (Price, OrderBook, Liquidation, Derivatives,
  Alerts) + a collapsible Chat column.
- **Console**: a 340px left column (Scanner + Candidate) + a **right pane with 7 tabs**
  (Event Log, Journal, Performance, Heatmap, News, Portfolio, Signals).
- **Mobile**: bottom tab bars with **6 tabs (dashboard)** and **9 tabs (console)**.

The Console right pane and the mobile tab bars are **dumping grounds**: Heatmap, News, Portfolio,
and Signals live there because nothing else had room, not because they belong to the
find→evaluate flow. Nine bottom tabs on mobile is unusable as navigation.

### A2. No workspace concept — the four mental modes are blurred
The product naturally has four modes: **understand the market → find setups → act/manage → review**.
Today these are crammed into two pages. "Understand" (chart, derivatives, news, macro) and
"review" (journal, performance) both bleed into the Console, and execution/account has no home at all.

### A3. Too much functionality squeezed onto single surfaces
- `PricePanel` alone carries the chart, 13 overlays, HA, patterns, 4 sub-panes, S&R, pivots,
  AI-analyze, bias selector, annotations, and click-to-alert — it is the densest object in the app
  and hard to use on anything but a wide screen.
- The Dashboard tries to be the whole "market view" in five fixed cells; the Chat column competes
  for the same horizontal space.

### A4. Orphaned and duplicated UI
- `AnalysisPanel.tsx` (scheduled-summary viewer) is **not mounted** on either page's default layout.
- Two features both called "analysis": the **scheduled market summary** and the on-demand
  **chart "Analyze"**. Same word, different scope — confusing in UI and API.

### A5. Cross-venue / BTC-only inconsistencies surface in the UI
The chart and order book are **OKX**, derivatives/liquidations are **Binance**, the chart-"Analyze"
service pulls **Binance spot**, and chat/summary/Telegram are **BTC-only**. A user switching to ETH
gets a partly-working experience (no AI, different venue context) with no indication why.

### A6. Navigation is unclear and shallow
A two-item top nav (Dashboard/Console) plus per-panel tab strips means the user must *know* that
"Journal lives under Console → 4th tab." There is no map of where capabilities live, no
breadcrumb, no persistent left rail.

### A7. Fixed, non-configurable layout
Panel selection, arrangement, and sizing are hardcoded in `App.tsx`/`OperatorConsole.tsx`. No
presets ("scalping view", "review mode"), no resize, no add/remove. The panels are modular under
the hood but the composition layer is frozen.

### A8. No design system
Every style is an inline `CSSProperties` literal; the only shared constants are in
`panels/panelStyles.ts`. There are no design tokens (color/space/type scales), no theming, no
reusable primitives (Card, Tab, Badge, Button) — so any visual redesign means touching every panel.

### A9. Symbol model is half-finished in the UI
A symbol selector exists (BTC/ETH/SOL) and drives Dashboard panels via a prop, but Console panels
mostly ignore it (they scan all three), and AI surfaces ignore it entirely (BTC-only). The user's
mental model of "the active symbol" doesn't hold across the app.

---

## Part B — Redesign-Relevant Summary

### B1. What the current core dashboard should become
Split the single "Dashboard + Console" pair into **four explicit workspaces** reachable from a
persistent left rail (or top workspace switcher), mirroring the trader's loop:

1. **Market Intelligence** — *understand.*
2. **Operator Console** — *find & evaluate setups.*
3. **Execution & Account** — *act & manage* (paper first).
4. **Review & Research** — *learn & validate.*

The current Dashboard becomes the heart of **Market Intelligence**; the current Console splits —
its scanner/candidate stay in **Operator Console**, while Journal/Performance/Portfolio move to
**Review** and **Execution & Account**.

### B2. What new major workspaces should exist
- **Market Intelligence** (chart + market structure + macro/factor + AI commentary).
- **Operator Console** (scanner queue → candidate → AI setup → send to execution).
- **Execution & Account** (proposals, positions, risk, equity/account stats) — *new*; today only a
  localStorage portfolio + a calculator widget exist.
- **Review & Research** (journal, performance, backtesting/replay) — *partly exists, no home*.

### B3. Which current panels belong in each workspace

| Workspace | Panels to place there (existing) |
|---|---|
| **Market Intelligence** | `PricePanel`, `DerivativesPanel`, `LiquidationPanel` + `LiquidationHeatmap`/`HeatmapPanel`, `NewsPanel`, `AnalysisPanel` (un-orphan it), `RelativeStrength`, global-stats/Fear&Greed widgets, `ChatPanel` (as a dockable assistant), **+ new macro/factor panel** |
| **Operator Console** | `ScannerPanel`, `CandidatePanel`, `SignalMatrixPanel`, `EventLogPanel` |
| **Execution & Account** | `PortfolioPanel` (→ DB-backed positions), new risk/proposal panels, account/equity stats |
| **Review & Research** | `JournalPanel`, `PerformancePanel`, new backtest/replay panels |

`PriceTicker` and `ServiceHealth` stay global (header). The symbol selector becomes a true global
control that every workspace and the AI layer respect.

### B4. The new auxiliary-trading-information panel/workspace to add
Add a **Market Context / Macro-Factor panel** inside Market Intelligence that consolidates the
"auxiliary trading information" currently scattered or absent:
- existing seeds: BTC dominance / total market cap / 24h (CoinGecko), Fear & Greed, correlation
  matrix, relative strength, news;
- new: a **regime read** (risk-on/off), leadership rotation across tracked symbols, and an AI
  one-paragraph "market context" summary distinct from chart-setup analysis.

This panel is **context that biases setups** — it should be glanceable and feed the scanner/analysis,
not occupy the trader's primary attention.

### B5. How macro/factor data fits without replacing the crypto focus
- Macro/factor lives **only** in the Market Intelligence workspace and as **score inputs** to the
  scanner/analysis — never as the landing screen or the primary chart.
- It answers "what regime are we in?" to tune position bias/size, while the chart + order book +
  derivatives + scanner remain the operator's main surfaces.
- Keep it **collapsible/secondary**: a context strip or side panel, not a full workspace of its own.

### B6. Recommended next design priority
1. **Introduce the 4-workspace shell + a persistent nav rail** (pure UX; reuses every existing panel
   as-is). This removes the tab-dump problem immediately and gives every panel a logical home —
   including un-orphaning `AnalysisPanel` and clarifying the two "analysis" features by name.
2. **Extract a minimal design-token layer** in `panelStyles.ts` (color/space/type + Card/Tab/Badge/
   Button primitives) so subsequent visual work is consistent and cheap.
3. **Make the symbol selector truly global** and surface a clear "data source / availability" hint
   so cross-venue + BTC-only gaps are explicit instead of silently broken.
4. Defer configurable layouts/presets (the "Ultimate Settings" layout engine) until the workspace
   IA and token system exist — building it earlier means rebuilding it.

> Net: **reshape information architecture first (workspaces + nav + tokens), then layer macro/factor
> context into Market Intelligence, then build the Execution/Account and Review/Research workspaces
> that the unfinished backend phases (F5–F10) will fill in.**

---

*See `current_platform_full_context.md` for the exact panel/route inventory and
`future_phases_unfinished_overview.md` for the backend phases these workspaces depend on.*
