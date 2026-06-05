# Decision Log — Settled Decisions

> **Purpose:** Durable record of decisions that are **settled**. Do not reopen these in future
> planning unless the user explicitly says so. New Claude chats: treat everything here as fixed
> constraints, not suggestions.
>
> Last updated: end of **Phase 75**.

---

## Product identity & direction

- **D1 — Crypto-first.** The platform is a crypto trade-analysis / decision-support platform first.
- **D2 — Long-term destination.** A **self-trading analysis platform for crypto markets first**, with
  *possible* future expansion to stocks, options, and other assets (via the Phase 94 cross-asset
  adapter refactor). Crypto remains the primary vertical; other assets must never derail it.
- **D3 — Macro/factor intelligence is supporting context, not the main product.** It lives in the
  Context Desk and as score inputs — never the landing screen, never the primary chart. The Context
  Desk must not become a "macro research website."
- **D4 — Context Desk is a third workspace, not just another panel.** Trading Desk (now) / Operator
  Console (find setups) / Context Desk (trading environment) are distinct workspaces.

## Phase sequencing

- **D5 — Phases 73–75 are complete** (IA Reset, Design System Foundation, Context Desk Shell). Do not
  re-plan them unless bugs are found.
- **D6 — Phase 76 (Schema & Data-Foundation Hardening) must happen before any new data-heavy phase or
  any new tables.** Alembic must become the single source of truth first.
- **D7 — Factor/macro/scoring work (Phases 79–82) waits until the schema foundation is hardened.**

## Determinism & AI boundaries

- **D8 — Factor Scoring v1 (Phase 82) is display-only / logged.** It must **not** gate scanner
  decisions or alter trade signals. Scanner/signal integration happens later (Phase 85) via persisted
  signals + `signal_context_snapshots`.
- **D9 — Regime labels are deterministic.** Regime classification (Risk-On / Neutral / Fragile /
  Crowded Long / Liquidity Trap, etc.) must be a deterministic rule/scoring output. **AI may explain a
  regime but must never assign a decision-gating regime label.** (Any preview score/regime shown
  before Phase 82 must be clearly badged as a non-authoritative preview.)
- **D10 — Risk enforcement is deterministic.** The risk engine (Phase 87) enforces limits via rules.
  **AI may explain risk but must never enforce risk limits.**

## Accounts, execution, safety

- **D11 — Professional app-level account/auth is deferred, not abandoned** (Phase 95). Before then the
  platform stays single-user behind Caddy Basic Auth.
- **D12 — Future professional auth scope** should eventually include: users table, signup/login,
  password hashing, sessions, account recovery, roles, and auth middleware across API + Telegram.
- **D13 — Live execution is last and gated** (Phase 97). It must remain gated behind: stable paper
  execution, a deterministic risk engine, backtesting, an active review loop, a kill switch, manual
  per-order approval, strict exchange-key permissions, and a separate live environment. No fully
  autonomous live trading.

## Design

- **D14 — Final premium visual design direction is postponed.** Phase 74 delivered only the
  **technical/shared foundation** (tokens + primitives), **not** the final visual identity. The
  premium visual/layout exploration is deferred until the future phases / product architecture are
  locked and the user **explicitly reopens** it.

## Macro data sourcing (Phase 80)

- **D15 — Yahoo Finance (`yfinance`) for market-traded macro prices.** DXY, Gold, SPX, NDX, VIX
  all collected via `yfinance>=0.2`. No API key required. Unofficial API — graceful degradation
  (confidence = 0) if it breaks. Fallback tickers documented in `macro_config.py`.
- **D16 — FRED API for yields and economic series.** All rate/yield/inflation/labor data
  (UST 2Y/10Y/30Y, TIPS, breakeven, CPI, PCE, NFP, HY spread) comes from FRED. Free API key
  required (`FRED_API_KEY` env var). Authoritative, well-documented, 120 req/min limit.
- **D17 — MOVE index omitted.** Not freely available via any no-cost API. HY credit spread
  (`BAMLH0A0HYM2` from FRED) used as partial credit/vol proxy instead.
- **D18 — FOMC calendar is a hardcoded list.** Maintained in `macro_config.py`. Refresh manually
  once per year (Fed publishes next year's dates in Nov/Dec). No external API needed.
- **D19 — Risk-on/off is a derived composite.** Computed in Phase 82 factor scoring from collected
  data (VIX, HY spread, DXY, SPX momentum). Not a separate data feed.
- **D20 — No Twelve Data, Alpha Vantage, or Bloomberg.** yfinance + FRED cover all needed items
  for free. Third-party paid/limited-tier sources excluded for this personal platform.
- **D21 — Macro caching rules.** Market prices: 5–15 min cache, stale at 1H. Daily rates: 4H
  cache, stale at 48H. Monthly econ: 24H cache, stale at 48H after next release. Stale factors:
  include with `confidence × 0.3` penalty. Older than 7 days: omit from scoring entirely.

---

## Notes for future chats

- These decisions came from a long design conversation (with the user and ChatGPT) plus a roadmap
  correction pass. The roadmap numbering is **Phase 73 → 97** (see
  `docs/future_phases_unfinished_overview.md`).
- If a new idea conflicts with a decision above, surface the conflict to the user rather than
  silently overriding it.
