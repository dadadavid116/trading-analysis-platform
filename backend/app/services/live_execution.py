"""services/live_execution.py — OKX live order placement and gate checks (Phase 97).

All live orders go through the full Phase 87 risk engine before placement.
OKX credentials are read from environment variables — never stored in the DB.
Kill switch immediately prevents new live orders when active.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
from datetime import datetime, timezone
from typing import Optional

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.account import AccountConfig, OpenPosition
from app.models.live_order import LiveOrder

logger = logging.getLogger(__name__)

OKX_BASE = "https://www.okx.com"

# OKX perpetual swap instrument IDs
SYMBOL_TO_INST: dict[str, str] = {
    "BTCUSDT": "BTC-USDT-SWAP",
    "ETHUSDT": "ETH-USDT-SWAP",
    "SOLUSDT": "SOL-USDT-SWAP",
}

# Base currency per contract for OKX USDT-margined perpetuals
CONTRACT_SIZES: dict[str, float] = {
    "BTC-USDT-SWAP": 0.01,   # 1 contract = 0.01 BTC
    "ETH-USDT-SWAP": 0.1,    # 1 contract = 0.1 ETH
    "SOL-USDT-SWAP": 1.0,    # 1 contract = 1 SOL
}


# ── OKX API client ─────────────────────────────────────────────────────────────

def _okx_timestamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"


def _okx_sign(timestamp: str, method: str, path: str, body: str) -> str:
    msg = timestamp + method.upper() + path + body
    digest = hmac.new(settings.okx_api_secret.encode(), msg.encode(), hashlib.sha256).digest()
    return base64.b64encode(digest).decode()


def _okx_headers(method: str, path: str, body: str = "") -> dict:
    ts = _okx_timestamp()
    headers = {
        "OK-ACCESS-KEY":       settings.okx_api_key,
        "OK-ACCESS-SIGN":      _okx_sign(ts, method, path, body),
        "OK-ACCESS-TIMESTAMP": ts,
        "OK-ACCESS-PASSPHRASE": settings.okx_api_passphrase,
        "Content-Type":        "application/json",
    }
    if settings.okx_sandbox:
        headers["x-simulated-trading"] = "1"
    return headers


async def _okx_get(path: str) -> dict:
    headers = _okx_headers("GET", path)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(OKX_BASE + path, headers=headers)
    return resp.json()


async def _okx_post(path: str, payload: dict) -> dict:
    body_str = json.dumps(payload)
    headers = _okx_headers("POST", path, body_str)
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(OKX_BASE + path, headers=headers, content=body_str)
    return resp.json()


# ── Gate check ─────────────────────────────────────────────────────────────────

async def check_live_gate(db: AsyncSession) -> dict:
    """Return gate status for live mode. All gates must pass before enabling."""
    from app.services.account_state import get_config
    cfg = await get_config(db)

    keys_configured = bool(
        settings.okx_api_key.strip()
        and settings.okx_api_secret.strip()
        and settings.okx_api_passphrase.strip()
    )

    closed_count = await db.scalar(
        select(func.count()).select_from(OpenPosition).where(OpenPosition.status == "closed")
    ) or 0

    gates = [
        {
            "name":  "OKX API Keys Configured",
            "pass":  keys_configured,
            "note":  "Set OKX_API_KEY, OKX_API_SECRET, OKX_API_PASSPHRASE in .env on the VPS",
        },
        {
            "name":  "Kill Switch Inactive",
            "pass":  not cfg.kill_switch_active,
            "note":  "Disable the kill switch in the Risk tab before enabling live mode",
        },
        {
            "name":  "Capital Configured",
            "pass":  cfg.starting_capital > 0,
            "note":  "Set starting capital in Account Config",
        },
        {
            "name":  "Risk Parameters Within Safe Range",
            "pass":  0 < cfg.max_risk_per_trade_pct <= 5.0,
            "note":  f"Risk per trade is {cfg.max_risk_per_trade_pct:.1f}% — must be between 0% and 5%",
        },
        {
            "name":  "Paper Trading History",
            "pass":  closed_count >= 1,
            "note":  f"Complete at least 1 paper trade first ({closed_count} completed so far)",
        },
    ]

    return {
        "all_pass":          all(g["pass"] for g in gates),
        "live_mode_enabled": cfg.live_mode_enabled,
        "kill_switch_active": cfg.kill_switch_active,
        "okx_sandbox":       settings.okx_sandbox,
        "keys_configured":   keys_configured,
        "gates":             gates,
    }


# ── Enable / disable live mode ─────────────────────────────────────────────────

async def enable_live_mode(db: AsyncSession) -> dict:
    """Enable live mode after all gate checks pass."""
    from app.services.account_state import get_config
    gate = await check_live_gate(db)
    if not gate["all_pass"]:
        failed = [g["name"] for g in gate["gates"] if not g["pass"]]
        raise ValueError(f"Gate checks failed: {', '.join(failed)}")

    cfg = await get_config(db)
    cfg.live_mode_enabled = True
    cfg.updated_at = datetime.now(timezone.utc)
    db.add(cfg)
    await db.commit()
    logger.warning(
        "LIVE MODE ENABLED. sandbox=%s. All gate checks passed.",
        settings.okx_sandbox,
    )
    return {"live_mode_enabled": True, "okx_sandbox": settings.okx_sandbox}


async def disable_live_mode(db: AsyncSession) -> dict:
    """Disable live mode immediately."""
    from app.services.account_state import get_config
    cfg = await get_config(db)
    cfg.live_mode_enabled = False
    cfg.updated_at = datetime.now(timezone.utc)
    db.add(cfg)
    await db.commit()
    logger.info("Live mode disabled.")
    return {"live_mode_enabled": False}


# ── OKX key verification ───────────────────────────────────────────────────────

async def verify_okx_keys() -> dict:
    """Ping OKX account endpoint to verify credentials. Read-only."""
    if not settings.okx_api_key.strip():
        return {"ok": False, "error": "OKX API key not configured"}
    try:
        data = await _okx_get("/api/v5/account/balance")
        if data.get("code") == "0":
            return {"ok": True, "message": "OKX API keys are valid"}
        return {"ok": False, "error": data.get("msg", "Unknown OKX error")}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── Order placement ────────────────────────────────────────────────────────────

def _calc_contracts(inst_id: str, size_usd: float, price: float) -> int:
    """Calculate number of contracts for a given notional USD size."""
    contract_size = CONTRACT_SIZES.get(inst_id, 0.01)
    if contract_size <= 0 or price <= 0:
        return 0
    contracts = int(size_usd / (price * contract_size))
    return max(0, contracts)


async def place_live_order(
    db: AsyncSession,
    symbol: str,
    direction: str,
    size_usd: float,
    entry_price: Optional[float] = None,
    stop_loss: Optional[float] = None,
    tp1: Optional[float] = None,
    order_type: str = "limit",
    signal_id: Optional[int] = None,
    proposal_id: Optional[int] = None,
    notes: Optional[str] = None,
) -> dict:
    """Place a live order via OKX API after all safety checks."""
    from app.services.account_state import get_config

    cfg = await get_config(db)

    if not cfg.live_mode_enabled:
        raise ValueError("Live mode is not enabled. Enable it in the Live tab first.")
    if cfg.kill_switch_active:
        raise ValueError("Kill switch is active. Disable it before placing live orders.")
    if not settings.okx_api_key.strip():
        raise ValueError("OKX API keys are not configured.")

    inst_id = SYMBOL_TO_INST.get(symbol)
    if not inst_id:
        raise ValueError(f"Unsupported symbol: {symbol}. Supported: {list(SYMBOL_TO_INST.keys())}")

    if order_type == "limit" and not entry_price:
        raise ValueError("entry_price is required for limit orders")

    price_for_calc = entry_price or 0.0
    if price_for_calc <= 0:
        raise ValueError("entry_price must be positive")

    contracts = _calc_contracts(inst_id, size_usd, price_for_calc)
    if contracts < 1:
        raise ValueError(
            f"Position size ${size_usd:.0f} is too small. "
            f"Minimum is 1 contract ({CONTRACT_SIZES[inst_id]} {symbol[:3]} "
            f"≈ ${price_for_calc * CONTRACT_SIZES[inst_id]:.0f})."
        )

    # Build OKX order payload
    payload: dict = {
        "instId": inst_id,
        "tdMode": "cross",
        "side":   "buy" if direction == "long" else "sell",
        "ordType": order_type,
        "sz":     str(contracts),
    }
    if order_type == "limit":
        payload["px"] = str(round(price_for_calc, 2))

    # Create DB record first (before placement attempt)
    live_order = LiveOrder(
        symbol      = symbol,
        direction   = direction,
        order_type  = order_type,
        size_usd    = size_usd,
        entry_price = entry_price,
        stop_loss   = stop_loss,
        tp1         = tp1,
        okx_status  = "pending",
        signal_id   = signal_id,
        proposal_id = proposal_id,
        created_at  = datetime.now(timezone.utc),
        notes       = notes,
    )
    db.add(live_order)
    await db.flush()  # get the ID without committing

    try:
        data = await _okx_post("/api/v5/trade/order", payload)
        if data.get("code") == "0" and data.get("data"):
            okx_order_id = data["data"][0].get("ordId", "")
            okx_error = data["data"][0].get("sMsg", "")
            if okx_error:
                live_order.okx_status = "failed"
                live_order.error_msg = okx_error
            else:
                live_order.okx_order_id = okx_order_id
                live_order.okx_status = "live"
        else:
            live_order.okx_status = "failed"
            live_order.error_msg = data.get("msg", "Unknown OKX API error")
    except Exception as exc:
        live_order.okx_status = "failed"
        live_order.error_msg = str(exc)
        logger.error("OKX order placement failed: %s", exc)

    db.add(live_order)
    await db.commit()
    await db.refresh(live_order)

    if live_order.okx_status == "failed":
        raise ValueError(f"OKX order failed: {live_order.error_msg}")

    logger.info(
        "Live order placed: %s %s %s contracts on %s (okx_id=%s sandbox=%s)",
        direction, contracts, inst_id, order_type, live_order.okx_order_id, settings.okx_sandbox,
    )
    return _order_dict(live_order)


async def cancel_live_order(db: AsyncSession, live_order_id: int) -> dict:
    """Cancel a live order via OKX API."""
    result = await db.execute(select(LiveOrder).where(LiveOrder.id == live_order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise ValueError("Live order not found")
    if not order.okx_order_id:
        raise ValueError("No OKX order ID — cannot cancel")

    inst_id = SYMBOL_TO_INST.get(order.symbol, order.symbol)
    try:
        data = await _okx_post("/api/v5/trade/cancel-order", {
            "instId": inst_id,
            "ordId":  order.okx_order_id,
        })
        if data.get("code") == "0":
            order.okx_status = "cancelled"
        else:
            raise ValueError(data.get("msg", "Cancel failed"))
    except Exception as exc:
        raise ValueError(str(exc))

    db.add(order)
    await db.commit()
    return _order_dict(order)


async def list_live_orders(db: AsyncSession, limit: int = 50) -> list[dict]:
    rows = await db.execute(
        select(LiveOrder).order_by(LiveOrder.created_at.desc()).limit(limit)
    )
    return [_order_dict(r) for r in rows.scalars()]


def _order_dict(o: LiveOrder) -> dict:
    return {
        "id":           o.id,
        "symbol":       o.symbol,
        "direction":    o.direction,
        "order_type":   o.order_type,
        "size_usd":     o.size_usd,
        "entry_price":  o.entry_price,
        "stop_loss":    o.stop_loss,
        "tp1":          o.tp1,
        "okx_order_id": o.okx_order_id,
        "okx_status":   o.okx_status,
        "signal_id":    o.signal_id,
        "proposal_id":  o.proposal_id,
        "created_at":   o.created_at.isoformat() if o.created_at else None,
        "filled_at":    o.filled_at.isoformat() if o.filled_at else None,
        "fill_price":   o.fill_price,
        "error_msg":    o.error_msg,
        "notes":        o.notes,
    }
