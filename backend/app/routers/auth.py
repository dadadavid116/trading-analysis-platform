"""auth.py — JWT-based application authentication (Phase 95).

POST /api/auth/login           — exchange email + password for a JWT token
GET  /api/auth/me              — return the current authenticated user
POST /api/auth/change-password — update password (requires valid token)
GET  /api/auth/status          — returns whether JWT auth is configured (no auth required)
"""

from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from jose import JWTError
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.services.user_service import (
    authenticate,
    check_password,
    create_token,
    decode_token,
    get_by_id,
    set_password,
    user_count,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _current_user(request: Request, db: AsyncSession = Depends(get_db)):
    """Dependency: resolve the calling user from the X-App-Token header."""
    token = request.headers.get("X-App-Token")
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    if not settings.jwt_secret_key.strip():
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="JWT not configured")
    try:
        payload = decode_token(token)
        user_id = int(payload["sub"])
    except (JWTError, KeyError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = await get_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


# ── Request / response models ──────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def auth_status():
    """Return whether JWT app-level auth is enabled on this server."""
    return {"enabled": bool(settings.jwt_secret_key.strip())}


@router.post("/login")
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    if not settings.jwt_secret_key.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="JWT_SECRET_KEY is not configured. Set it in .env and restart.",
        )
    if await user_count(db) == 0:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="No users exist. Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart.",
        )
    user = await authenticate(db, body.email, body.password)
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    token = create_token(user.id, user.email, user.role)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "username": user.username,
            "role": user.role,
        },
    }


@router.get("/me")
async def me(user=Depends(_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "username": user.username,
        "role": user.role,
        "last_login": user.last_login.isoformat() if user.last_login else None,
    }


@router.post("/change-password")
async def change_password(
    body: ChangePasswordRequest,
    user=Depends(_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not check_password(user, body.current_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )
    if len(body.new_password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be at least 8 characters",
        )
    await set_password(db, user, body.new_password)
    return {"ok": True}
