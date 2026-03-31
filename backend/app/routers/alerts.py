"""
routers/alerts.py — API endpoints for alert management.

Endpoints:
    GET  /api/alerts/  — list all alerts
    POST /api/alerts/  — create a new alert rule
"""

from datetime import datetime, timezone
from typing import List

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.alert import Alert
from app.schemas.alert import AlertCreate, AlertSchema

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("/", response_model=List[AlertSchema])
async def list_alerts(db: AsyncSession = Depends(get_db)):
    """Return all alert rules, newest first."""
    result = await db.execute(
        select(Alert).order_by(Alert.created_at.desc())
    )
    return list(result.scalars().all())


@router.post("/", response_model=AlertSchema, status_code=201)
async def create_alert(body: AlertCreate, db: AsyncSession = Depends(get_db)):
    """Create a new alert rule."""
    alert = Alert(
        name=body.name,
        symbol=body.symbol,
        condition_type=body.condition_type,
        threshold=body.threshold,
        window_minutes=body.window_minutes,
        created_at=datetime.now(tz=timezone.utc),
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)
    return alert
