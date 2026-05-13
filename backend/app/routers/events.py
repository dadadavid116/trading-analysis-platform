"""
routers/events.py — Platform event log endpoints for the Operator Console.

Endpoints:
    GET /api/events/        — paginated list of recent events (newest first)
    GET /api/events/stream  — SSE stream of new events as they arrive
"""

import asyncio
import json
from typing import List

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db, AsyncSessionLocal
from app.models.event_log import EventLog

router = APIRouter(prefix="/events", tags=["events"])


class EventSchema(BaseModel):
    id:         int
    timestamp:  str
    service:    str
    event_type: str
    symbol:     str | None
    message:    str

    class Config:
        from_attributes = True


@router.get("/", response_model=List[EventSchema])
async def list_events(
    limit:    int = Query(100, ge=1, le=500),
    since_id: int = Query(0,   ge=0, description="Return only events with id > since_id"),
    db: AsyncSession = Depends(get_db),
):
    """Return recent platform events, newest first."""
    result = await db.execute(
        select(EventLog)
        .where(EventLog.id > since_id)
        .order_by(desc(EventLog.timestamp))
        .limit(limit)
    )
    rows = result.scalars().all()
    return [
        EventSchema(
            id         = r.id,
            timestamp  = r.timestamp.isoformat(),
            service    = r.service,
            event_type = r.event_type,
            symbol     = r.symbol,
            message    = r.message,
        )
        for r in rows
    ]


@router.get("/stream")
async def stream_events():
    """
    SSE stream that pushes new EventLog rows as they arrive.

    Polls for new rows every 2 s. Starts from the current max id so the
    client only receives events that happen after it connects.
    """
    async def generator():
        # Seed the cursor at the current max id
        async with AsyncSessionLocal() as session:
            r = await session.execute(select(func.max(EventLog.id)))
            last_id = r.scalar_one_or_none() or 0

        while True:
            await asyncio.sleep(2)
            try:
                async with AsyncSessionLocal() as session:
                    r = await session.execute(
                        select(EventLog)
                        .where(EventLog.id > last_id)
                        .order_by(EventLog.id)
                    )
                    rows = r.scalars().all()

                for row in rows:
                    last_id = row.id
                    payload = {
                        "id":         row.id,
                        "timestamp":  row.timestamp.isoformat(),
                        "service":    row.service,
                        "event_type": row.event_type,
                        "symbol":     row.symbol,
                        "message":    row.message,
                    }
                    yield f"data: {json.dumps(payload)}\n\n"

            except asyncio.CancelledError:
                return
            except Exception:
                pass

    return StreamingResponse(
        generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )
