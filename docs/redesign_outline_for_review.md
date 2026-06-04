# Redesign Outline — For External Double-Check

> **Purpose:** A self-contained summary of what changed in the forward roadmap after the
> Dashboard/Console + Context Desk discussion. Send this to ChatGPT (or any reviewer) to sanity-check
> before implementation begins. It states clearly **what was redesigned**, **what is brand new**, and
> **what open questions / gaps still need a decision.**
>
> **Source of truth for detail:** `docs/future_phases_unfinished_overview.md` (Phase 73–93).
> **Current-state reference:** `docs/current_platform_full_context.md`.
> **UI critique:** `docs/ui_redesign_context.md`.

---

## 1. One-paragraph summary

The forward roadmap was reframed from a flat "finish the self-trading OS" list (previously drafted as
`F1–F17`) into a **workspace-first plan numbered Phase 73–93**, continuing from the real build log
(which ended at Phase 72). The biggest change: a **third main workspace — the Context Desk / Factor
Intelligence Desk** — is introduced as a first-class part of the product, and the roadmap now insists
that **information-architecture and design-system work (Phase 73–75) happen before any new data,
scoring, or execution logic.** Macro/factor intelligence is explicitly **supporting context**, not
the headline product.

---

## 2. Numbering change

- **Before:** future work was an unordered `F1–F17` set inside the future-phases doc.
- **Now:** a sequential **Phase 73 → Phase 93** roadmap, continuing the real `roadmap.md` history
  (Phases 1–72 are done). The `F#` items still exist conceptually but are re-expressed and re-ordered.

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
| (was only a "next priority" note) | **Phase 73 — Information Architecture Reset** | **NEW as a formal phase / now FIRST** |
| (was only a "next priority" note) | **Phase 74 — Design System Foundation** | **NEW as a formal phase** |
| F4 Market Intelligence Workspace | **Phase 75 — Context Desk Shell** | **Redesigned + expanded** (distinct 3rd workspace) |
| F1 OKX Perpetual Alignment | Phase 76 | Reordered (now after IA reset) |
| F2 Symbol Registry SoT | Phase 77 | Reordered |
| F3 Macro/Factor Intelligence Layer | **Phase 78 Crypto Factor Pack + Phase 79 Macro Factor Pack + Phase 80 Factor Scoring Engine** | **Redesigned — split into 3 much more detailed phases** |
| (none) | **Phase 81 — Context Desk v1 Complete** | **NEW** |
| (scattered bits across F-notes) | **Phase 82 — AI Analysis Separation & Upgrade** | **Redesigned into a formal phase** (renames + trader profile + annotation lifecycle) |
| F5 Signal Engine | Phase 83 — Persisted Signal Engine | Same intent, fuller lifecycle/tables |
| F6 Risk Engine | Phase 84 | Same intent |
| F7 Positions/Account | Phase 85 — Execution & Account Workspace | Same intent, workspace-framed |
| F8 Paper Execution | Phase 86 | Same intent |
| F9 Backtesting/Replay | Phase 87 | Same intent |
| F10 Journal/Review deepen | Phase 88 — Review & Research Workspace | Same intent, workspace-framed |
| (none) | **Phase 89 — Model Diagnostics & Factor Attribution** | **NEW** (SHAP/IC/regime, from Gold Monitor) |
| F15 Telegram/Mobile | Phase 90 — Telegram UX Upgrade | Same intent, with command renames |
| F13 Cross-Asset Adapter | Phase 91 | Same intent |
| F14 Professional Auth | Phase 92 | Same intent |
| F17 Live Execution Gate | Phase 93 | Same intent (still last) |

---

## 5. What was REDESIGNED (changed from the earlier draft)

1. **Ordering flipped to UX-first.** Earlier draft led with schema/OKX/registry foundations; new plan
   leads with **IA reset → design system → Context Desk shell** (Phase 73–75), explicitly *before*
   data/scoring/execution.
2. **"Market Intelligence Workspace" → "Context Desk / Factor Intelligence Desk"** — promoted to a
   concrete third workspace with a defined 5-layer structure (Regime Header, Crypto Factor Cards,
   Macro Factor Cards, Asset Signal Tower, Factor Scorecard, Narrative layer).
3. **Macro/factor layer split into three phases** (crypto factors → macro factors → scoring engine)
   instead of one vague "macro intelligence layer."
4. **AI analysis cleanup became a formal phase (82)** with explicit flow renames, trader-profile
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
5. **Phase 89 Model Diagnostics & Factor Attribution** as a dedicated later research layer.
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

## 8. Open questions / gaps to confirm before building

These are points the new plan **does not fully resolve** — flagging for the reviewer:

1. **Schema-management hardening dropped.** The earlier draft had an explicit "make Alembic the
   single source of truth, retire startup `create_all` + ad-hoc `ALTER`" phase. The new Phase 73–93
   plan introduces ~14 new tables but **has no dedicated schema/migration-hardening phase.** Recommend
   inserting one before Phase 78 (first new tables) or folding it into Phase 76/77. **Decision needed.**
2. **Settings workspace has no phase.** "Settings" appears in the later 6-workspace nav, but no phase
   builds it (the earlier "Ultimate Settings / configurable layouts" item). Where does configurable
   layout + unified settings land — a Phase 94, or folded into Phase 92 (auth/per-user settings)?
3. **News/Catalyst deepening** (earlier F11) is now absorbed into Context Desk (narrative layer) +
   scoring (catalyst input). Confirm there's no need for a standalone news-AI-tagging phase.
4. **Macro data sourcing not specified.** Phase 79 lists DXY/UST/Gold/SPX/VIX/CPI/FOMC but not the
   provider (FRED? a paid macro API? scraping?). Free, reliable macro feeds are a real constraint —
   needs a data-source decision (and rate-limit/caching plan) before Phase 79.
5. **Context Score weighting** starts fixed, user-customizable later — confirm the v1 default weights
   and whether the score should *feed* the scanner composite immediately (Phase 80) or stay display-only
   until Phase 83.
6. **Regime taxonomy** (Risk-On / Neutral / Fragile / Crowded Long / Liquidity Trap) needs concrete,
   deterministic definitions so it isn't purely AI-narrative. Who defines the thresholds — rules, the
   scoring engine, or AI? (Per principle: enforcement/labels that gate decisions should be deterministic.)
7. **Asset Signal Tower for non-crypto assets** (DXY, Gold, UST 10Y, SPX) implies pulling/scoring
   non-crypto instruments early (Phase 79/81) — confirm this is "context only," not the start of the
   cross-asset/stocks vertical (which is deferred to Phase 91).
8. **OKX derivatives parity.** Phase 76 says "evaluate OKX replacements for liquidations/funding/OI/
   long-short." Some metrics may have no clean OKX equivalent; confirm the acceptable cross-venue
   fallbacks and how source badges communicate them.

---

## 9. Recommended first implementation slice (for sign-off)

**Phase 73 + 74 + 75 only**, with the explicit guardrails:
- No new data providers, no new strategy logic, no backend collector refactors.
- Deliver: workspace nav model; Context Desk as the 3rd workspace (existing data only); relocate
  auxiliary panels; mount AnalysisPanel; rename the two analyses; extract minimal design tokens +
  shared primitives; preserve all current functionality; keep the crypto trading workflow central.

**Question for the reviewer:** Do you agree the schema-hardening gap (§8.1) should be slotted in
*before* Phase 78, and that Phase 73–75 is the correct, low-risk first slice?

---

*Reply with confirmations/edits on §8 and §9 and we'll lock the roadmap and begin Phase 73.*
