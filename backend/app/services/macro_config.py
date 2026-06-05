"""
Macro data source configuration — Phase 80 decision matrix.

This module is the single source of truth for what macro data to collect and how.
Phase 81 imports these constants to implement the actual collectors.
No collection logic lives here — only mappings, schedules, and FOMC dates.
"""

from datetime import date

# ── yfinance tickers ────────────────────────────────────────────────────────
# Format: ticker → (label, category, cache_seconds, stale_seconds)

YFINANCE_SYMBOLS: dict[str, tuple[str, str, int, int]] = {
    "DX-Y.NYB": ("DXY",   "usd",       900,  3_600),   # USD Index futures
    "GC=F":     ("Gold",  "commodity", 600,  3_600),   # Gold futures
    "^GSPC":    ("SPX",   "equity",    300,  3_600),   # S&P 500
    "^NDX":     ("NDX",   "equity",    300,  3_600),   # Nasdaq 100
    "^VIX":     ("VIX",   "volatility",300,  3_600),   # CBOE VIX
}

# Fallback tickers (used when primary fetch fails)
YFINANCE_FALLBACKS: dict[str, str] = {
    "GC=F":  "GLD",    # Gold → GLD ETF
    "^GSPC": "SPY",    # SPX  → SPY ETF
    "^NDX":  "QQQ",    # NDX  → QQQ ETF
}

# ── FRED series ─────────────────────────────────────────────────────────────
# Format: series_id → (label, category, cache_seconds, stale_seconds, unit)

FRED_SERIES: dict[str, tuple[str, str, int, int, str]] = {
    "DGS2":           ("UST 2Y",          "rates",     14_400, 172_800, "pct"),
    "DGS10":          ("UST 10Y",         "rates",     14_400, 172_800, "pct"),
    "DGS30":          ("UST 30Y",         "rates",     14_400, 172_800, "pct"),
    "DFII10":         ("Real 10Y (TIPS)", "rates",     14_400, 172_800, "pct"),
    "T10YIE":         ("10Y Breakeven",   "inflation", 14_400, 172_800, "pct"),
    "BAMLH0A0HYM2":   ("HY Credit Spread","credit",    14_400, 172_800, "pct"),
    "CPIAUCSL":       ("CPI",             "inflation", 86_400, 172_800, "index"),
    "CPILFESL":       ("Core CPI",        "inflation", 86_400, 172_800, "index"),
    "PCEPI":          ("PCE",             "inflation", 86_400, 172_800, "index"),
    "PCEPILFE":       ("Core PCE",        "inflation", 86_400, 172_800, "index"),
    "PAYEMS":         ("NFP",             "labor",     86_400, 172_800, "thousands"),
}

FRED_BASE_URL = "https://api.stlouisfed.org/fred/series/observations"

# ── FOMC meeting dates ────────────────────────────────────────────────────
# End dates of each FOMC meeting (the day of the rate decision + press conference).
# Update this list once per year (Fed publishes the next year's schedule in Nov/Dec).
# Source: https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm

FOMC_DATES: list[date] = [
    date(2026, 6, 17),
    date(2026, 7, 29),
    date(2026, 9, 16),
    date(2026, 10, 28),
    date(2026, 12, 9),
    date(2027, 1, 27),
    date(2027, 3, 17),
    date(2027, 5, 5),
    date(2027, 6, 16),
    date(2027, 7, 28),
    date(2027, 9, 15),
    date(2027, 10, 27),
    date(2027, 12, 8),
]

def next_fomc() -> date | None:
    """Return the nearest upcoming FOMC date, or None if list needs refreshing."""
    today = date.today()
    upcoming = [d for d in FOMC_DATES if d >= today]
    return upcoming[0] if upcoming else None

def days_to_fomc() -> int | None:
    """Return days until the next FOMC meeting, or None if unknown."""
    nxt = next_fomc()
    if nxt is None:
        return None
    return (nxt - date.today()).days

# ── Staleness rules ──────────────────────────────────────────────────────────
# confidence_penalty applies when data is stale (older than stale_seconds).
# If data is older than omit_seconds, exclude from scoring entirely.

STALE_CONFIDENCE_PENALTY = 0.3   # multiply confidence by this when stale
OMIT_THRESHOLD_SECONDS   = 604_800  # 7 days — omit any factor older than this
