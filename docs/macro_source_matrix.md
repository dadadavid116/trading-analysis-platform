# Macro Source Decision Matrix — Phase 80

> **Status:** Decided. This document is the authoritative sourcing spec for Phase 81 (Macro Factor
> Collector Pack). Do not change provider decisions here without updating `decision_log.md`.
>
> **Principle:** Macro is *context*, not the main product. The goal is a small set of reliably-sourced
> signals — not a comprehensive macro research database. Every item here must earn its place.

---

## Decisions Made

### A. Primary sources (two vendors, both free)

| Vendor | Use case | Auth | Rate limit | Python lib |
|--------|----------|------|-----------|------------|
| **Yahoo Finance** (`yfinance`) | Market-traded instruments (DXY, Gold, SPX, NDX, VIX) | None | Unofficial, generous (~2 000 req/hr practical) | `yfinance>=0.2` |
| **FRED API** (Federal Reserve Economic Data) | Yields, real rates, credit spread, inflation series | Free API key | 120 req/min | `httpx` (already in use) |
| **Hardcoded list** | FOMC meeting dates | N/A | N/A | Built into `macro_config.py` |

### B. Items explicitly excluded

| Item | Reason | Alternative used |
|------|--------|-----------------|
| MOVE index (ICE BofA) | Not freely available via any no-cost API | HY credit spread (`BAMLH0A0HYM2`) from FRED as partial proxy |
| Twelve Data | 800 req/day free-tier limit; yfinance covers all needed symbols | — |
| Alpha Vantage | 25 req/day free tier; too restrictive | — |
| Bloomberg / Refinitiv | Paid; out of scope for personal platform | — |
| Investing.com scraping | Unreliable, ToS-violating | — |

### C. Derived items (no separate data feed)

| Item | How | When |
|------|-----|------|
| Risk-on / risk-off composite | Weighted combo of VIX, HY spread, DXY, SPX momentum | Phase 82 factor scoring |
| 2Y-10Y yield curve | `DGS10 − DGS2` (FRED series, computed) | Phase 81 scorer |
| Real yield spread | `DGS10 − T10YIE` (FRED series, computed) | Phase 81 scorer |

### D. New environment variable

```
FRED_API_KEY=<your key>
```

Register free at: `https://fred.stlouisfed.org/docs/api/api_key.html`

---

## The Full Matrix

| Data item | Category | Primary source | Ticker / series | Fallback | Cost | Update freq | Cache TTL | Stale threshold | Notes |
|-----------|----------|---------------|-----------------|----------|------|-------------|-----------|----------------|-------|
| **DXY** | USD | yfinance | `DX-Y.NYB` | — | Free | ~1 min intraday | 15 min | 1 H | USD Index futures; market hours only |
| **Gold** | Commodity | yfinance | `GC=F` | `GLD` (ETF) | Free | ~1 min intraday | 10 min | 1 H | Gold futures; previous close off-hours |
| **SPX** | Equity | yfinance | `^GSPC` | `SPY` (ETF) | Free | ~1 min intraday | 5 min | 1 H | S&P 500 |
| **NDX (Nasdaq 100)** | Equity | yfinance | `^NDX` | `QQQ` (ETF) | Free | ~1 min intraday | 5 min | 1 H | Nasdaq 100; `^IXIC` is composite |
| **VIX** | Volatility | yfinance | `^VIX` | — | Free | ~1 min intraday | 5 min | 1 H | CBOE spot VIX |
| **UST 2Y yield** | Rates | FRED API | `DGS2` | yfinance `^IRX`×10 | Free (key) | Daily | 4 H | 48 H | Released next biz day after 3 PM ET |
| **UST 10Y yield** | Rates | FRED API | `DGS10` | yfinance `^TNX`×0.1 | Free (key) | Daily | 4 H | 48 H | Benchmark yield |
| **UST 30Y yield** | Rates | FRED API | `DGS30` | yfinance `^TYX`×0.1 | Free (key) | Daily | 4 H | 48 H | Long-bond yield |
| **10Y TIPS (real yield)** | Rates | FRED API | `DFII10` | — | Free (key) | Daily | 4 H | 48 H | 10Y inflation-adjusted yield |
| **10Y Breakeven inflation** | Inflation | FRED API | `T10YIE` | — | Free (key) | Daily | 4 H | 48 H | Market-implied 10Y inflation expectation |
| **HY Credit spread (OAS)** | Credit/Vol | FRED API | `BAMLH0A0HYM2` | — | Free (key) | Daily | 4 H | 48 H | ICE BofA US HY OAS; partial MOVE proxy |
| **CPI (headline)** | Inflation | FRED API | `CPIAUCSL` | BLS API | Free (key) | Monthly | 24 H | 48 H | Released ~6 wks after ref month |
| **Core CPI** | Inflation | FRED API | `CPILFESL` | BLS API | Free (key) | Monthly | 24 H | 48 H | Ex food & energy |
| **PCE Price Index** | Inflation | FRED API | `PCEPI` | — | Free (key) | Monthly | 24 H | 48 H | Fed's preferred inflation gauge |
| **Core PCE** | Inflation | FRED API | `PCEPILFE` | — | Free (key) | Monthly | 24 H | 48 H | Ex food & energy; most-watched by Fed |
| **NFP** | Labor | FRED API | `PAYEMS` | BLS API | Free (key) | Monthly | 24 H | 48 H | First Friday of month for prior month |
| **FOMC meeting dates** | Calendar | Hardcoded | — | — | Free | Annual refresh | 7 days | N/A | Static list in `macro_config.py` |
| **Risk-on/off composite** | Derived | Scoring | — | — | Free | Computed | — | — | Phase 82; no separate data feed |
| **MOVE index** | Volatility | **Omitted** | — | — | Paid | — | — | — | Not freely available; use HY spread instead |

---

## API Details

### Yahoo Finance (`yfinance`)

- **Package:** `yfinance>=0.2` (add to `backend/requirements.txt` in Phase 81)
- **Auth:** None required
- **Behavior:** Market hours → ~1 min bars available; off-hours → previous close returned
- **Known risk:** Unofficial reverse-engineered API; Yahoo has broken it before (2022, 2024)
- **Mitigation:** All market-price factors degrade gracefully — mark confidence = 0 if fetch fails,
  omit from scoring (same pattern as Phase 79 external factor scorers)

### FRED API

- **Base URL:** `https://api.stlouisfed.org/fred/series/observations`
- **Auth:** `?api_key=FRED_API_KEY&series_id=DGS10&sort_order=desc&limit=1&file_type=json`
- **Rate limit:** 120 requests/minute (free tier is essentially unlimited for this use case)
- **Response format:** JSON, `observations` array with `date` + `value` (string `"."` for missing)
- **Missing values:** FRED returns `"."` for weekends/holidays — skip, use last valid
- **Reliability:** Very high (US Federal Reserve official data)

### FOMC Calendar

Maintained as a hardcoded list in `backend/app/services/macro_config.py`. The Fed publishes meeting
dates approximately one year in advance. The list should be refreshed manually once per year.

---

## Freshness / Staleness Rules

These rules apply to the `FactorObservation` records that Phase 81 will write:

| Data type | Cache TTL | Stale if older than | Omit from scoring if older than |
|-----------|-----------|--------------------|---------------------------------|
| Intraday market prices (DXY, Gold, SPX, NDX, VIX) | 5–15 min | 1 H | 6 H |
| Daily rates / yields (FRED) | 4 H | 48 H | 7 days |
| Monthly econ (CPI, PCE, NFP) | 24 H | 48 H after next release | N/A (valid until next release) |
| FOMC dates | 7 days | N/A (static) | N/A |

When a factor is stale: include in scoring with `confidence × 0.3` penalty (same as missing-data
degradation in Phase 79 `factor_scorer.py`).

---

## Phase 81 Build Scope (preview — do not implement yet)

Using this matrix, Phase 81 will deliver:

1. **Alembic migration** — `macro_observations` table (mirrors `factor_observations` schema)
2. **`collectors/macro_collector.py`** — background service polling yfinance + FRED; runs every 15 min
3. **`services/macro_scorer.py`** — normalize raw values to −1..+1 with documented formulas
4. **`routers/macro.py`** — `GET /api/macro/snapshot` endpoint
5. **`frontend/src/pages/contextdesk/MacroFactorsSection.tsx`** — live macro tab in Context Desk

The scoring formulas (normalization) are NOT decided here — that is Phase 81 work.

---

## Maintenance

- **FOMC dates:** Update `FOMC_DATES` in `macro_config.py` once per year (Fed publishes next year's
  schedule in November/December of the prior year).
- **FRED series:** If a series is deprecated, FRED's API returns an error with a successor series ID.
- **yfinance breakage:** If Yahoo breaks the API, switch market-price collection to
  Twelve Data free tier (800 req/day limit; sufficient for 6 symbols at 15-min intervals).
