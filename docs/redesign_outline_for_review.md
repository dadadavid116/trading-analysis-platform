# Redesign Outline — For External Double-Check

> **Purpose:** A self-contained summary of what changed in the forward roadmap after the
> Dashboard/Console + Context Desk discussion. Send this to ChatGPT (or any reviewer) to sanity-check
> before implementation begins. It states clearly **what was redesigned**, **what is brand new**, and
> **what open questions / gaps still need a decision.**
>
> **Source of truth for detail:** `docs/future_phases_unfinished_overview.md` (Phase 73–97).
> **Current-state reference:** `docs/current_platform_full_context.md`.
> **UI critique:** `docs/ui_redesign_context.md`.

---

## 1. One-paragraph summary

The forward roadmap was reframed from a flat "finish the self-trading OS" list (previously drafted as
`F1–F17`) into a **workspace-first plan**, continuing from the real build log (which ended at Phase
72). The biggest change: a **third main workspace — the Context Desk / Factor Intelligence Desk** —
is introduced as a first-class part of the product, and the roadmap now insists that
**information-architecture and design-system work (Phase 73–75) happen before any new data, scoring,
or execution logic.** Macro/factor intelligence is explicitly **supporting context**, not the
headline product.

**A roadmap correction pass has since been applied** (this revision). It renumbered the plan cleanly
to **Phase 73 → 97** and resolved five structural issues: a dedicated **schema-hardening phase (76)**
now precedes all new tables; the **Risk↔Account dependency loop is broken** by splitting out an
**Account State Foundation (86)** before the Risk Engine (87) and the Execution & Account UI (88);
**Factor Scoring v1 (82) is display-only/logged** and does not gate signals; **regime labels are
deterministic** (AI explains only); a **Macro Source Decision Matrix (80)** precedes any macro
collector; and a **Settings/Customization phase (96)** was added.

**Build status (current):** **Phases 73, 74, and 75 are COMPLETE** (Information Architecture Reset,
Design System Foundation, Context Desk Shell). The **next implementation phase is Phase 76 — Schema
& Data-Foundation Hardening.** Everything from Phase 76 onward is still planned/unbuilt.

---

## 2. Numbering change

- **Before:** future work was an unordered `F1–F17` set inside the future-phases doc.
- **After ChatGPT reframe:** a sequential `Phase 73 → 93` roadmap.
- **After correction pass (current):** a clean **Phase 73 → 97** roadmap — four phases inserted
  (76 Schema Hardening, 80 Macro Source Matrix, 86 Account State Foundation, 96 Settings) and the
  tail renumbered. No fractional numbers. The `F#` items still map through (table below).

---

## 3. Workspace model (old → new)

| | Before | After |
|---|---|---|
| Pages | Dashboard + Console (2) | Immediate: Trading Desk + Operator Console + **Context Desk** (3); Later: + Execution & Account + Review & Research + Settings (6) |
| Console role | Dumping ground (7 tabs / 9 mobile tabs) | Narrowed to scan → candidate → setup → risk-preview → save/reject |
| Market understanding | Spread across Dashboard + Console | Concentrated in Trading Desk (live) + **Context Desk** (environment) |
| Macro/factor data | Absent / scattered seeds | **Context Desk** — explicit, structured, but secondary |

---

## 4. Phase mapping — old `F#` → new `Phase` (status)

| Old draft | New phase | Status |
|---|---|---|
| (was only a "next priority" note) | **Phase 73 — Information Architecture Reset** | ✅ DONE |
| (was only a "next priority" note) | **Phase 74 — Design System Foundation** | ✅ DONE |
| F4 Market Intelligence Workspace | **Phase 75 — Context Desk Shell** | ✅ DONE (distinct 3rd workspace) |
| F12 Schema/Data-Foundation Hardening | **Phase 76 — Schema & Data-Foundation Hardening** | **NEXT** — restored by correction pass; precedes all new tables |
| F1 OKX Perpetual Alignment | Phase 77 | Reordered (after schema hardening) |
| F2 Symbol Registry SoT | Phase 78 | Reordered |
| F3 (part) Crypto factors | Phase 79 — Crypto Factor Collector Pack | Split from the old macro layer |
| (none) | **Phase 80 — Macro Source Decision Matrix** | **NEW (correction pass)** — sourcing decided before any macro collector |
| F3 (part) Macro factors | Phase 81 — Macro Factor Collector Pack | Split; now depends on the matrix |
| F3 (part) Scoring | Phase 82 — Factor Scoring Engine v1 | **Clarified: display-only / logged, not signal-gating** |
| (none) | Phase 83 — Context Desk v1 Complete | From reframe |
| (scattered bits) | Phase 84 — AI Analysis Separation & Upgrade | Redesigned into a formal phase |
| F5 Signal Engine | Phase 85 — Persisted Signal Engine | First consumer of Context Score (via `signal_context_snapshots`) |
| (none) | **Phase 86 — Account State Foundation** | **NEW (correction pass)** — splits account state out *before* Risk to break the loop |
| F6 Risk Engine | Phase 87 — Risk Engine v1 | Now depends on 86 (account state), **not** the workspace UI |
| F7 Positions/Account | Phase 88 — Execution & Account Workspace (UI) | Now depends on 86 + 87 |
| F8 Paper Execution | Phase 89 | Same intent |
| F9 Backtesting/Replay | Phase 90 | Same intent |
| F10 Journal/Review deepen | Phase 91 — Review & Research Workspace | Same intent |
| (none) | Phase 92 — Model Diagnostics & Factor Attribution | From reframe (SHAP/IC/regime) |
| F15 Telegram/Mobile | Phase 93 — Telegram UX Upgrade | Same intent |
| F13 Cross-Asset Adapter | Phase 94 | Same intent |
| F14 Professional Auth | Phase 95 | Same intent |
| F16 Ultimate Settings | **Phase 96 — Settings / Customization** | **RESTORED by correction pass** — was missing; layout presets, model prefs, notification routing, factor weights, per-user after auth |
| F17 Live Execution Gate | Phase 97 | Same intent (still last) |

---

## 5. What was REDESIGNED (changed from the earlier draft)

1. **Ordering flipped to UX-first.** Earlier draft led with schema/OKX/registry foundations; new plan
   leads with **IA reset → design system → Context Desk shell** (Phase 73–75), explicitly *before*
   data/scoring/execution.
2. **"Market Intelligence Workspace" → "Context Desk / Factor Intelligence Desk"** — promoted to a
   concrete third workspace with a defined 5-layer structure (Regime Header, Crypto Factor Cards,
   Macro Factor Cards, Asset Signal Tower, Factor Scorecard, Narrative layer).
3. **Macro/factor layer staged across four phases** instead of one vague "macro intelligence layer":
   **Phase 79 Crypto Factor Collector Pack → Phase 80 Macro Source Decision Matrix → Phase 81 Macro
   Factor Collector Pack → Phase 82 Factor Scoring Engine v1.**
4. **AI analysis cleanup became a formal phase (Phase 84)** with explicit flow renames, trader-profile
   inputs, and an annotation lifecycle (expire/invalidate/supersede/manual-clear).
5. **Signal/Risk/Account/Execution/Review** reframed as **named workspaces**, not just backend layers.
6. **Telegram** gets concrete command renames to kill the `/analysis` duplication
   (`/market`, `/setup`, `/context`, `/signals`, `/risk`).

---

## 6. What is BRAND NEW (no prior equivalent)

1. **Context Desk as a first-class workspace** with the regime header + factor cards + asset signal
   tower + factor scorecard + narrative layer.
2. **Four reference dashboards adopted as design inspiration** (crypto-translated, not copied):
   - **US Rates Monitor** → factor scorecard / yield-curve structure / "data → stance" scoring.
   - **USD Monitor** → equation-style scoring model.
   - **Inflation Monitor** → regime score + Asset Signal Tower (per-asset bias/confidence/driver/risk).
   - **Gold Monitor** → later research diagnostics (SHAP, IC tracking, regime heatmap, attribution).
3. **Factor Scoring Engine v1** with an explicit additive model
   (`Context Score = Crypto Derivatives + Liquidity + Momentum + Macro Pressure + Volatility +
   News/Catalyst`), per-factor metadata (raw/normalized/direction/confidence/weight/source/timestamp/
   explanation), and a consensus bar.
4. **New backend tables** introduced by the plan: `factor_observations`, `regime_snapshots`,
   `factor_scores`, `factor_weights`, `signals`, `signal_factors`, `signal_context_snapshots`,
   `signal_events`, `positions`, `orders`, `order_events`, `account_snapshots`, `equity_curve`,
   `trade_stats`.
5. **Phase 92 Model Diagnostics & Factor Attribution** as a dedicated later research layer.
6. **New navigation model** (immediate 3 → later 6 workspaces) and an explicit **panel reassignment
   table** mapping every current panel to a new home.
7. **Three guiding principles** codified: macro is context (not the product); refactor IA before
   factors; the real problem is unified state, not missing panels.
8. **Design System Foundation (Phase 74)** as a real phase with a named primitive set (Card, Button,
   Badge, Tabs, SectionHeader, MetricCard, ScoreBar, FactorCard, WorkspaceShell) and token groups.

---

## 7. What stayed the SAME (intent unchanged)

- The end-state vision: crypto-first self-trading OS with a controlled, gated path to live execution.
- The dependency spirit: data consistency → signals → risk → account → paper → backtest → review →
  auth → live (live is always last; risk enforcement is always deterministic, never AI-gated).
- Paper-only execution with mandatory human approval before any position.

---

## 8. Open questions — what the correction pass RESOLVED vs what REMAINS

### 8a. Resolved by the correction pass
1. **Schema-management hardening — RESOLVED.** Now **Phase 76 — Schema & Data-Foundation Hardening**,
   placed after the 73–75 UI slice and **before any new tables** (factors/signals/account/orders).
   Makes Alembic the single source of truth, retires startup `create_all` + ad-hoc `ALTER`, and adds
   index/retention/backfill discipline.
2. **Settings had no phase — RESOLVED.** Now **Phase 96 — Settings / Customization** (layout presets,
   model preferences, notification routing, user-editable factor weights; per-user persistence after
   auth, `localStorage` fallback before).
3. **Risk ↔ Account dependency loop — RESOLVED.** Split into **Phase 86 Account State Foundation**
   (account snapshots, simulated capital/equity base, open-exposure base) → **Phase 87 Risk Engine**
   (depends on 86, *not* the UI) → **Phase 88 Execution & Account Workspace UI** (depends on 86 + 87).
4. **Factor Scoring v1 gating behavior — RESOLVED.** **Phase 82 is display-only + logged to
   snapshots**; it does not gate scanner decisions or change signals. Integration happens later at
   **Phase 85** via persisted signals + `signal_context_snapshots`.
5. **Regime taxonomy authority — RESOLVED.** Codified as **Principle D**: regime labels and
   decision-gating stances are **deterministic rule/scoring outputs**; AI explains but never assigns
   them. (Concrete threshold values still to be defined in Phase 79/82 — see 8b.5.)
6. **Macro sourcing process — RESOLVED as a process.** **Phase 80 — Macro Source Decision Matrix**
   now requires a per-item decision (provider, cost, frequency, rate limits, reliability, fallback,
   caching, freshness) **before** any macro collector (Phase 81).

### 8b. Confirmed by reviewer
1. **Actual macro providers — DEFERRED to Phase 80.** Concrete provider picks (FRED vs paid API vs
   scraping for DXY/UST/CPI/VIX, etc.) are intentionally decided in the Macro Source Decision Matrix,
   not before it.
2. **No standalone News/Catalyst phase for now.** News/catalyst deepening stays inside the Context
   Desk narrative layer + scoring (catalyst input) until a standalone phase is proven necessary.
3. **OKX derivatives parity — handled in Phase 77.** Where a Binance-sourced metric (funding/OI/
   long-short/liquidations) has no clean OKX equivalent, the unavoidable cross-venue fallback is kept
   and made explicit via **source badges** on the panel.
4. **Asset Signal Tower non-crypto rows are context-only.** DXY/Gold/UST 10Y/SPX appear as trading
   *context*, not as a cross-asset trading vertical (which remains deferred to Phase 94).
5. **Context Score v1 stays display-only / logged.** It does not gate signals; persisted signals
   consume it later (Phase 85 via `signal_context_snapshots`).

### 8c. Still open — needs a reviewer decision
1. **Context Score v1 default weights + regime thresholds.** Confirm the initial fixed weights and the
   numeric thresholds that map scores → regime labels (deterministic per Principle D). Land these in
   Phase 79/82, not in the 73–75 slice.

---

## 9. Recommended first implementation slice (for sign-off)

**Phase 73 + 74 + 75 only** (unchanged in spirit), with explicit guardrails:
- No new data providers, no new strategy logic, no backend collector refactors.
- Deliver: workspace nav model; Context Desk as the 3rd workspace (existing data only); relocate
  auxiliary panels; mount AnalysisPanel; rename the two analyses; extract minimal design tokens +
  shared primitives; preserve all current functionality; keep the crypto trading workflow central.

**Then Phase 76 (schema hardening)** immediately after, before any new tables.

**Reviewer status:** §8b decisions are confirmed. The first slice (**Phase 73–75) is now COMPLETE**.
The only remaining open item (§8c — Context Score v1 default weights + regime thresholds) lands in
Phase 79/82 and does **not** block Phase 76. The roadmap is locked; the next implementation phase is
**Phase 76 — Schema & Data-Foundation Hardening** (do not start until the user approves the plan).

---

*Remaining input needed only on §8c (Phase 79/82 timeframe). Phases 73–75 are done; Phase 76 is next.*
