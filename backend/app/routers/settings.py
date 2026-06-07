"""routers/settings.py — Per-user application settings (Phase 96).

GET  /api/settings  — returns current settings (defaults if unauthenticated)
PUT  /api/settings  — saves settings to the authenticated user's record
"""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_config
from app.database import get_db
from app.models.user import User
from app.services.user_service import decode_token, get_by_id

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/settings", tags=["settings"])


# ── Pydantic models ────────────────────────────────────────────────────────────

class AIModelPrefs(BaseModel):
    chat:     str = "claude"
    analysis: str = "claude"
    scanner:  str = "claude"


class NotificationPrefs(BaseModel):
    browserEnabled:    bool = False
    telegramEnabled:   bool = True
    webhookUrl:        str  = ""
    quietHoursEnabled: bool = False
    quietFrom:         str  = "22:00"
    quietTo:           str  = "08:00"


class FactorWeights(BaseModel):
    derivatives:   int = 25
    liquidity:     int = 20
    momentum:      int = 20
    macroPressure: int = 15
    volatility:    int = 10
    newsCatalyst:  int = 10


class AppSettings(BaseModel):
    density:       str               = "compact"
    aiModel:       AIModelPrefs      = Field(default_factory=AIModelPrefs)
    notifications: NotificationPrefs = Field(default_factory=NotificationPrefs)
    factorWeights: FactorWeights     = Field(default_factory=FactorWeights)
    exportFormat:  str               = "csv"


# ── Auth helper ────────────────────────────────────────────────────────────────

async def _optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Return the current user if authenticated, None otherwise."""
    if not app_config.jwt_secret_key.strip():
        return None
    token = request.headers.get("X-App-Token", "")
    if not token:
        return None
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
        user = await get_by_id(db, user_id)
        return user if (user and user.is_active) else None
    except Exception:
        return None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("")
async def get_settings(
    user: Optional[User] = Depends(_optional_user),
) -> AppSettings:
    if user is None:
        return AppSettings()
    try:
        stored = json.loads(user.settings_json or "{}")
        return AppSettings(**stored)
    except Exception:
        return AppSettings()


@router.put("")
async def save_settings(
    body: AppSettings,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(_optional_user),
) -> AppSettings:
    if user is None:
        raise HTTPException(status_code=401, detail="Authentication required to save settings")
    user.settings_json = body.model_dump_json()
    db.add(user)
    await db.commit()
    return body
