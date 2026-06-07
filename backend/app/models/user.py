"""user.py — User ORM model (Phase 95)."""

from sqlalchemy import Boolean, Column, DateTime, Integer, String, Text

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id              = Column(Integer, primary_key=True)
    email           = Column(String(255), nullable=False, unique=True)
    username        = Column(String(50), nullable=False)
    hashed_password = Column(Text, nullable=False)
    role            = Column(String(20), nullable=False, default="admin")
    is_active       = Column(Boolean, nullable=False, default=True)
    created_at      = Column(DateTime(timezone=True), nullable=False)
    last_login      = Column(DateTime(timezone=True), nullable=True)
