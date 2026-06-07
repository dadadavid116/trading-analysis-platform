# Phase Status — Source of Truth

> **Read this first.** This file is the canonical statement of where the project is and what
> comes next. It is updated at the end of each phase. If anything here disagrees with chat
> memory, **this file wins.**
>
> Last updated: end of **Phase 83**.

---

## Current position

- **Current completed implementation phase:** **Phase 83** (Context Desk v1 Complete).
- **Roadmap range:** **Phase 73 → 97** (authoritative detail in `docs/future_phases_unfinished_overview.md`).
- **Legacy build log:** `docs/roadmap.md` records Phases 1–75 as done; Phases 76–77 recorded here.

## Completed recent slice

| Phase | Name | What it delivered |
|---|---|---|
| 73 | Information Architecture Reset | Third workspace **Context Desk**; 3-page nav; relocated News + Heatmap; mounted `AnalysisPanel`; renamed analyses. |
| 74 | Design System Foundation | `src/theme/` tokens + primitives. Technical foundation only — not final visual identity. |
| 75 | Context Desk Shell | 6-tab Context Desk from existing data only; Context Score PREVIEW badge; Asset Signal Tower. |
| 76 | Schema & Data-Foundation Hardening | Alembic is now the single source of truth. Revisions 0005 (`alerts.webhook_url`) + 0006 (`journal_entries` table + missing indexes on `liquidations` and `journal_entries`). Startup `create_all` + all ad-hoc `ALTER` removed from `main.py`. `deploy.sh` now runs `alembic upgrade head` automatically. |
| 77 | OKX Perpetual Alignment Completion | Chart "✦ Analyze" now fetches from **OKX perp** (was Binance spot BTCUSDT). `analyze_chart` is now symbol-aware — passes the active symbol through from `PricePanel` → API → service. Source badges added: **BINANCE FUTURES** on Derivatives + Liquidation panels; **OKX PERP** on Order Book panel. |
| 78 | Symbol Registry as Single Source of Truth | All collectors (`price`, `orderbook`, `liquidation`, `derivatives`) + `scanner` + `scanner_worker` now load active symbols from `tracked_symbols` via `services/symbol_registry.py` (retry + hardcoded fallback). `chat.py` accepts `symbol` field and builds market context + tool calls for the active symbol. Symbol selector in Layout is no longer Dashboard-only — shows on all pages. `ChatPanel`, `OperatorConsole`, `ContextDesk` receive `activeSymbol` prop from App.tsx. |
| 79 | Crypto Factor Collector Pack | `factor_observations` + `regime_snapshots` tables (Alembic). 7 normalized factors: funding_rate, oi_delta, ls_ratio, liq_pressure, ob_imbalance, fear_greed, total_mcap_24h. Deterministic regime classification (risk_on/neutral/fragile/risk_off/crowded_long/crowded_short). Derivatives Pressure Score + Liquidity Pressure Score sub-scores. `GET /api/factors/snapshot` endpoint. Context Desk Crypto tab + Overview regime header now use live scored data (replaced Phase 75 heuristic). |
| 80 | Macro Source Decision Matrix | Authoritative sourcing spec for all macro data items. Two vendors decided: **yfinance** (DXY, Gold, SPX, NDX, VIX — free, no key) + **FRED API** (yields, real rates, breakeven, HY spread, CPI, PCE, NFP — free API key). MOVE index omitted (not free); HY spread used as proxy. FOMC dates hardcoded in `macro_config.py`. Risk-on/off derived in Phase 82 scoring. `FRED_API_KEY` added to `.env.example`. Decisions D15–D21 logged in `decision_log.md`. |
| 81 | Macro Factor Collector Pack | `macro_observations` table (Alembic 0008). 7 macro factors: DXY, SPX, VIX, Gold (yfinance), UST 10Y, HY credit spread, CPI YoY (FRED API). 15-min DB cache, on-demand. `GET /api/macro/snapshot` with FOMC countdown. `MacroFactorsSection.tsx` upgraded from placeholder to live regime header + 7 factor cards. FRED factors gracefully absent if `FRED_API_KEY` not set. |
| 82 | Factor Scoring Engine v1 | `factor_scores` + `factor_weights` tables (Alembic 0009). `context_scorer.py` blends crypto (60%) + macro (40%) into a unified Context Score on -100..+100. `GET /api/context/score` + `/api/context/history`. `OverviewSection.tsx` upgraded from crypto-only PREVIEW to live unified score with consensus bar (▼ Short / ─ Neutral / ▲ Long), sub-score meta (Crypto 60% / Macro 40%), and 3 FactorCard contribution cards. Display-only v1 — does not gate scanner decisions. |
| 83 | Context Desk v1 Complete | `context_ai.py` — AI market context narrative via Claude Haiku (30-min cache). `GET /api/context/events` (FOMC/CPI/NFP countdown). `GET /api/context/ai-summary` (AI narrative, Refresh button). OverviewSection extended: Event Calendar Strip, AI Context Card, macro signal tower rows (DXY/Gold/UST10Y/SPX, context-only). CryptoFactorsSection + MacroFactorsSection placeholder text updated. Context Desk now fully usable as a daily trading-support page. |

## Next implementation phase

**Phase 84 — (see `docs/future_phases_unfinished_overview.md`).**

## Next implementation phase details
- Retire or replace the **startup `create_all` + ad-hoc `ALTER TABLE IF NOT EXISTS`** behavior in
  `backend/app/main.py` where appropriate.
- **Align Alembic state with the current live schema** (backfill revisions for columns added via
  startup `ALTER`: `alerts.webhook_url`, `journal_entries.notes`, `journal_entries.notified_outcome`;
  `alembic stamp head` on the live VPS DB).
- Add **index, retention, and backfill discipline** before the table-heavy phases (79+).

### Explicit NON-scope for Phase 76
- ❌ No new macro collectors.
- ❌ No factor scoring engine.
- ❌ No new strategy logic.
- ❌ No paper execution.
- ❌ No live execution.
- ❌ No final/premium visual design exploration (deferred — see `decision_log.md`).

> Phase 76 must complete before any phase that creates new tables (`factor_observations`,
> `regime_snapshots`, `factor_scores`, `signals`, `positions`, `orders`, `account_snapshots`, …).

---

## Current runtime / deployment status

- Live on a **Hetzner CX22 VPS**, Ubuntu, **Docker Compose**, domain via **DuckDNS**, HTTPS + HTTP
  Basic Auth via **Caddy**. The live website **is** the Docker stack on the VPS.
- ~10 containers: `db` (Postgres 16), `api` (FastAPI), `frontend` (Nginx static), `collector`,
  `analysis`, `alerts`, `telegram`, `chat_export`, `backup`, `caddy`.
- Deploy = on the VPS run **`bash deploy.sh`** (full) or **`bash deploy.sh quick`** (frontend+api).
  Code is not live until deployed; pushing to GitHub alone does not update the site.
- Single user (shared Basic Auth credential). No app-level accounts yet.

## Current key risks / blockers (before Phase 76)

1. **Fragile schema management (the reason Phase 76 exists):** startup `create_all` + ad-hoc `ALTER`
   is the live path; Alembic exists but is **out of parity** with the real schema. Production data
   safety must be preserved during the migration cleanup.
2. **No local Node/Python build toolchain on the author's Windows machine** — TypeScript only truly
   compiles during the VPS Docker `frontend` build. Type errors surface at deploy time, not locally.
3. **Cross-venue + BTC-only data** (chart/orderbook OKX; derivatives/liquidations Binance; AI BTC-only)
   — not a Phase 76 concern but tracked for Phase 77/78.

---

## What the next Claude chat should read before doing anything

In order:
1. `CLAUDE.md` (project rules + Project Memory section)
2. `docs/phase_status.md` (this file)
3. `docs/decision_log.md` (settled decisions — do not re-litigate)
4. `docs/next_task.md` (the execution brief for Phase 76 prep)
5. `docs/current_platform_full_context.md` (what exists in code)
6. `docs/future_phases_unfinished_overview.md` (locked roadmap 76→97)
7. `docs/redesign_outline_for_review.md` (redesigned-vs-new summary)
8. `docs/ui_redesign_context.md` (UI critique, post-Phase-75)
9. `docs/roadmap.md` (build log 1–75)

Then inspect code **only as needed**, and **summarize understanding back to the user before editing
anything.**
