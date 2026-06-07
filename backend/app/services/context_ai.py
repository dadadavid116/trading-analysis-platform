"""
context_ai.py — AI Market Context Summary (Phase 83).

Calls Claude Haiku with current regime + factor data to produce a 3–5
sentence trading-environment narrative. 30-minute in-memory cache.
"""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

import anthropic
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.services.context_scorer import compute_context_snapshot
from app.services.factor_scorer import compute_snapshot as _crypto_snap
from app.services.macro_scorer import compute_macro_snapshot as _macro_snap
from app.services.macro_config import FOMC_DATES

logger = logging.getLogger(__name__)

SUMMARY_CACHE_SECONDS = 1800  # 30 minutes
_summary_cache: dict[str, tuple[datetime, str]] = {}


# ── Economic event calendar ───────────────────────────────────────────────────

def _first_friday(year: int, month: int) -> date:
    d = date(year, month, 1)
    days_ahead = (4 - d.weekday()) % 7   # 0=Mon, 4=Fri
    return d + timedelta(days=days_ahead)


def upcoming_events(count: int = 6) -> list[dict]:
    """Return the next `count` high-impact economic events sorted by date."""
    today = date.today()
    events: list[dict] = []

    # FOMC
    for d in FOMC_DATES:
        if d >= today:
            events.append({
                "name":      "FOMC Decision",
                "date":      d.isoformat(),
                "days_away": (d - today).days,
                "type":      "fomc",
                "impact":    "high",
            })

    # CPI (~11th) and NFP (first Friday) for the next 4 calendar months
    for delta in range(4):
        raw_month = today.month + delta
        y = today.year + (raw_month - 1) // 12
        m = (raw_month - 1) % 12 + 1

        cpi_d = date(y, m, 11)
        if cpi_d >= today:
            events.append({
                "name":      "CPI Release",
                "date":      cpi_d.isoformat(),
                "days_away": (cpi_d - today).days,
                "type":      "cpi",
                "impact":    "high",
            })

        nfp_d = _first_friday(y, m)
        if nfp_d >= today:
            events.append({
                "name":      "NFP",
                "date":      nfp_d.isoformat(),
                "days_away": (nfp_d - today).days,
                "type":      "nfp",
                "impact":    "medium",
            })

    events.sort(key=lambda e: e["date"])
    seen: set[str] = set()
    unique: list[dict] = []
    for ev in events:
        k = f"{ev['type']}-{ev['date']}"
        if k not in seen:
            seen.add(k)
            unique.append(ev)
        if len(unique) >= count:
            break
    return unique


# ── AI summary ────────────────────────────────────────────────────────────────

async def get_context_ai_summary(
    db: AsyncSession,
    symbol: str,
    refresh: bool = False,
) -> tuple[str, datetime]:
    """Return (summary_text, generated_at). 30-min in-memory cache."""
    if not refresh:
        cached = _summary_cache.get(symbol)
        if cached:
            ts, text = cached
            age = (datetime.now(timezone.utc) - ts).total_seconds()
            if age < SUMMARY_CACHE_SECONDS:
                return text, ts

    ctx = await compute_context_snapshot(db, symbol)

    # Detailed crypto factors (backend cache already warm)
    crypto_detail: dict = {}
    try:
        raw = await _crypto_snap(symbol, db)
        fmap = {f["factor_name"]: f for f in raw.get("factors", [])}
        ff = fmap.get("funding_rate", {})
        ls = fmap.get("ls_ratio", {})
        fg = fmap.get("fear_greed", {})
        oi = fmap.get("oi_delta", {})
        crypto_detail = {
            "funding_bps": (ff.get("raw_value") or 0) * 10_000,
            "funding_dir": ff.get("direction", "neutral"),
            "ls_long_pct": (ls.get("raw_value") or 0.5) * 100,
            "fear_greed_val": fg.get("raw_value"),
            "fear_greed_dir": fg.get("direction", "neutral"),
            "oi_delta_pct": oi.get("raw_value"),
        }
    except Exception as exc:
        logger.warning("Crypto detail fetch failed for AI summary: %s", exc)

    macro_detail: dict = {}
    try:
        macro = await _macro_snap(db)
        mf = {f.factor_name: f for f in macro.factors}
        dxy = mf.get("dxy")
        vix = mf.get("vix")
        spx = mf.get("spx")
        ust = mf.get("ust_10y")
        macro_detail = {
            "dxy":     dxy.raw_value if dxy else None,
            "dxy_dir": dxy.direction if dxy else "neutral",
            "vix":     vix.raw_value if vix else None,
            "spx_dir": spx.direction if spx else "neutral",
            "ust_10y": ust.raw_value if ust else None,
        }
    except Exception as exc:
        logger.warning("Macro detail fetch failed for AI summary: %s", exc)

    prompt = _build_prompt(symbol, ctx, crypto_detail, macro_detail)

    summary = "Context summary unavailable."
    try:
        client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key)
        msg = await client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=300,
            messages=[{"role": "user", "content": prompt}],
        )
        summary = msg.content[0].text.strip()
    except Exception as exc:
        logger.error("AI context summary call failed: %s", exc)

    now = datetime.now(timezone.utc)
    _summary_cache[symbol] = (now, summary)
    return summary, now


def _build_prompt(symbol: str, ctx, crypto: dict, macro: dict) -> str:
    asset = symbol.replace("USDT", "")
    lines = [
        f"You are a concise crypto trading analyst. Based on the following live market data, "
        f"write a 3-4 sentence trading environment summary for a {asset} swing trader.",
        "",
        f"Context Score: {ctx.context_score:+.1f}/100 ({ctx.regime.replace('_', ' ').title()})",
        f"Trade Environment: {ctx.trade_environment}",
        f"Consensus: {ctx.consensus}",
    ]
    if ctx.crypto_score is not None:
        lines.append(f"Crypto sub-score: {ctx.crypto_score:+.1f}/100")
    if ctx.macro_score is not None:
        lines.append(f"Macro sub-score: {ctx.macro_score:+.1f}/100")

    if crypto:
        lines += ["", "Crypto signals:"]
        if crypto.get("funding_bps") is not None:
            lines.append(f"- Funding: {crypto['funding_bps']:.1f} bps ({crypto['funding_dir']})")
        if crypto.get("ls_long_pct") is not None:
            lines.append(f"- Long/Short: {crypto['ls_long_pct']:.1f}% longs")
        if crypto.get("fear_greed_val") is not None:
            lines.append(f"- Fear & Greed: {crypto['fear_greed_val']:.0f} ({crypto['fear_greed_dir']})")
        if crypto.get("oi_delta_pct") is not None:
            lines.append(f"- OI delta (1H): {crypto['oi_delta_pct']:+.2f}%")

    if macro:
        lines += ["", "Macro context:"]
        if macro.get("dxy") is not None:
            lines.append(f"- DXY: {macro['dxy']:.2f} (USD {macro['dxy_dir']})")
        if macro.get("vix") is not None:
            lines.append(f"- VIX: {macro['vix']:.1f}")
        if macro.get("ust_10y") is not None:
            lines.append(f"- UST 10Y: {macro['ust_10y']:.2f}%")
        if macro.get("spx_dir"):
            lines.append(f"- SPX: {macro['spx_dir']}")

    lines += [
        "",
        "Write 3-4 sentences. State the regime clearly, identify the single biggest risk "
        "or opportunity right now, and name one specific thing a trader should watch. "
        "Be direct and specific. No disclaimers or preamble.",
    ]
    return "\n".join(lines)
