"""
models/chat.py — SQLAlchemy models for persistent chat history.

Two tables:
  chat_sessions  — one row per conversation (web or Telegram)
  chat_messages  — every user/assistant message in each session

Sessions are grouped by platform and AI model so the nightly export
can route each session to the correct folder:
  Claude/  ChatGPT/  Grok/  Telegram/
"""

from datetime import datetime, timezone

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.database import Base


class ChatSession(Base):
    __tablename__ = "chat_sessions"

    id             = Column(Integer, primary_key=True, index=True)
    platform       = Column(String(20),  nullable=False)   # "web" | "telegram"
    model          = Column(String(20),  nullable=False)   # "claude" | "openai" | "grok"
    title          = Column(String(200), nullable=True)    # first 80 chars of opening message
    created_at     = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    last_active_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    messages = relationship(
        "ChatMessage",
        back_populates="session",
        cascade="all, delete-orphan",
        order_by="ChatMessage.timestamp",
    )


class ChatMessage(Base):
    __tablename__ = "chat_messages"

    id         = Column(Integer, primary_key=True, index=True)
    session_id = Column(
        Integer,
        ForeignKey("chat_sessions.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    role      = Column(String(20), nullable=False)   # "user" | "assistant"
    content   = Column(Text,       nullable=False)
    timestamp = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    session = relationship("ChatSession", back_populates="messages")
