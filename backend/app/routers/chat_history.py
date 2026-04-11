"""
routers/chat_history.py — Chat session management endpoints.

Endpoints:
    GET  /api/chat-history/sessions            — list all sessions (newest first)
    GET  /api/chat-history/sessions/{id}       — full session with all messages
    POST /api/chat-history/sessions/{id}/save  — manually export a session to file
    DELETE /api/chat-history/sessions/{id}     — delete a session
"""

from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import settings
from app.database import get_db
from app.models.chat import ChatSession
from app.schemas.chat_history import ChatSessionDetailSchema, ChatSessionSchema
from app.services.chat_history import export_session_to_file

router = APIRouter(prefix="/chat-history", tags=["chat-history"])

# Base directory for exported files — mounted as a Docker volume.
CHAT_HISTORY_DIR = Path("/app/chat_history")


@router.get("/sessions", response_model=List[ChatSessionSchema])
async def list_sessions(
    limit: int = 50,
    db: AsyncSession = Depends(get_db),
):
    """Return the most recent N sessions, newest first."""
    result = await db.execute(
        select(ChatSession)
        .order_by(ChatSession.last_active_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/sessions/{session_id}", response_model=ChatSessionDetailSchema)
async def get_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Return a session with its full message history."""
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    return session


@router.post("/sessions/{session_id}/save")
async def save_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Manually export a session to a .md file in the chat_history folder."""
    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")

    filepath = export_session_to_file(session, CHAT_HISTORY_DIR, "(Saved by User)")
    return {"saved_to": str(filepath)}


@router.delete("/sessions/{session_id}", status_code=204)
async def delete_session(
    session_id: int,
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete a session and all its messages."""
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id)
    )
    session = result.scalar_one_or_none()
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found.")
    await db.delete(session)
    await db.commit()
