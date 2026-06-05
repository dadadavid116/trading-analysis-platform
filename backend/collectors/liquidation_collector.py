"""
liquidation_collector.py — Multi-symbol liquidation collector via OKX WebSocket.

Subscribes to OKX's public `liquidation-orders` channel (SWAP instType) which
covers BTC/ETH/SOL perpetual swaps.

Switched from Binance fstream because Binance futures WebSocket is unreachable
from many VPS regions.

OKX message format:
  {
    "arg":  { "channel": "liquidation-orders", "instType": "SWAP" },
    "data": [{
      "instId": "BTC-USDT-SWAP",
      "ts":     "1623987654321",   # ms, outer timestamp
      "details": [{
        "side":    "sell",         # sell = long liq, buy = short liq
        "posSide": "long",
        "bkPx":   "65000",        # liquidation/bankruptcy price
        "sz":     "1.2",          # size in contracts
        "state":  "filled"
      }]
    }]
  }

OKX sends a plain-text "ping" every 25 s — we reply "pong".
A 90 s receive timeout detects silent hangs and forces a reconnect.
"""

import asyncio
import json
import logging
from datetime import datetime, timezone

import websockets

from app.database import AsyncSessionLocal
from app.models.liquidation import Liquidation
from app.services.symbol_registry import load_okx_symbol_map

logger = logging.getLogger(__name__)

OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/public"

_SUBSCRIBE = json.dumps({
    "op":   "subscribe",
    "args": [{"channel": "liquidation-orders", "instType": "SWAP"}],
})


async def _store(inst_id: str, detail: dict, ts_ms: int, symbol_map: dict[str, str]) -> None:
    canonical = symbol_map.get(inst_id)
    if not canonical:
        return

    side = detail.get("side", "")
    if side not in ("buy", "sell"):
        # Fallback: derive from position side
        side = "sell" if detail.get("posSide") == "long" else "buy"

    price = float(detail.get("bkPx") or 0)
    qty   = float(detail.get("sz")   or 0)
    if price <= 0 or qty <= 0:
        return

    liq = Liquidation(
        symbol    = canonical,
        timestamp = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc),
        side      = side,
        price     = price,
        quantity  = qty,
        exchange  = "okx",
    )
    async with AsyncSessionLocal() as session:
        session.add(liq)
        await session.commit()

    logger.info("Liquidation: %s  side=%s  price=%.2f  qty=%.4f", canonical, side, price, qty)


async def run() -> None:
    symbol_map = await load_okx_symbol_map()
    logger.info("Liquidation collector starting (OKX liquidation-orders WebSocket, symbols=%s)...",
                list(symbol_map.values()))
    while True:
        try:
            async with websockets.connect(OKX_WS_URL) as ws:
                await ws.send(_SUBSCRIBE)
                logger.info("Liquidation collector: subscribed to OKX liquidation-orders (SWAP).")

                while True:
                    try:
                        raw = await asyncio.wait_for(ws.recv(), timeout=90.0)
                    except asyncio.TimeoutError:
                        logger.warning("Liquidation WS: no message for 90 s — reconnecting.")
                        break

                    if raw == "ping":
                        await ws.send("pong")
                        continue

                    try:
                        msg = json.loads(raw)
                    except json.JSONDecodeError:
                        continue

                    if "event" in msg:
                        logger.debug("Liquidation WS event: %s", msg)
                        continue

                    for item in msg.get("data", []):
                        inst_id = item.get("instId", "")
                        if inst_id not in symbol_map:
                            continue
                        ts_ms = int(item.get("ts") or 0)
                        for detail in item.get("details", []):
                            try:
                                await _store(inst_id, detail, ts_ms, symbol_map)
                            except Exception as exc:
                                logger.error("Error storing liquidation: %s", exc)

        except Exception as exc:
            logger.error("Liquidation collector error: %s — reconnecting in 5 s.", exc)

        await asyncio.sleep(5)
