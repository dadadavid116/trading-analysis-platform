"""user_service.py — User management, password hashing, and JWT tokens (Phase 95)."""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from jose import jwt
from passlib.context import CryptContext
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.user import User

logger = logging.getLogger(__name__)

_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
_ALGORITHM = "HS256"
_TOKEN_EXPIRE_DAYS = 30


def _hash_password(password: str) -> str:
    return _pwd.hash(password)


def _verify_password(plain: str, hashed: str) -> bool:
    return _pwd.verify(plain, hashed)


def check_password(user: User, password: str) -> bool:
    return _verify_password(password, user.hashed_password)


def create_token(user_id: int, email: str, role: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=_TOKEN_EXPIRE_DAYS)
    payload = {"sub": str(user_id), "email": email, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Raises JWTError on failure."""
    return jwt.decode(token, settings.jwt_secret_key, algorithms=[_ALGORITHM])


async def get_by_email(db: AsyncSession, email: str) -> Optional[User]:
    r = await db.execute(select(User).where(User.email == email.lower()))
    return r.scalar_one_or_none()


async def get_by_id(db: AsyncSession, user_id: int) -> Optional[User]:
    r = await db.execute(select(User).where(User.id == user_id))
    return r.scalar_one_or_none()


async def create_user(
    db: AsyncSession,
    email: str,
    username: str,
    password: str,
    role: str = "admin",
) -> User:
    user = User(
        email=email.lower(),
        username=username,
        hashed_password=_hash_password(password),
        role=role,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, email: str, password: str) -> Optional[User]:
    user = await get_by_email(db, email)
    if user is None or not user.is_active:
        return None
    if not _verify_password(password, user.hashed_password):
        return None
    user.last_login = datetime.now(timezone.utc)
    await db.commit()
    return user


async def set_password(db: AsyncSession, user: User, new_password: str) -> None:
    user.hashed_password = _hash_password(new_password)
    await db.commit()


async def user_count(db: AsyncSession) -> int:
    r = await db.execute(select(func.count()).select_from(User))
    return r.scalar() or 0


async def seed_admin(db: AsyncSession) -> None:
    """Create the default admin user from env vars if no users exist yet."""
    admin_email = settings.admin_email.strip()
    admin_password = settings.admin_password.strip()
    if not admin_email or not admin_password:
        return
    if await user_count(db) > 0:
        return
    await create_user(db, admin_email, "admin", admin_password, role="admin")
    logger.info("Default admin user seeded: %s", admin_email)
