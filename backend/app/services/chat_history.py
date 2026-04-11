"""
services/chat_history.py — Shared helpers for persisting and exporting chat sessions.

Used by:
  - app/routers/chat.py      (web ChatPanel messages)
  - telegram_bot/bot.py      (Telegram messages)
  - app/routers/chat_history.py  (session list / detail / manual save)
  - chat_export/run.py       (nightly export + pruning)
"""

from __future__ import annotations

import logging
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.chat import ChatMessage, ChatSession

logger = logging.getLogger(__name__)

# Maps model/platform keys → export subfolder names.
_FOLDER_MAP = {
    "claude":  "Claude",
    "openai":  "ChatGPT",
    "grok":    "Grok",
}


# ── Session management ─────────────────────────────────────────────────────────

async def get_or_create_session(
    db: AsyncSession,
    platform: str,
    model: str,
    session_id: Optional[int] = None,
    first_message: Optional[str] = None,
) -> ChatSession:
    """Return an existing session by ID, or create a new one."""
    if session_id:
        result = await db.execute(
            select(ChatSession).where(ChatSession.id == session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            session.last_active_at = datetime.now(timezone.utc)
            await db.commit()
            return session

    # Auto-title from the opening message (max 80 chars).
    title: Optional[str] = None
    if first_message:
        title = first_message[:80] + ("…" if len(first_message) > 80 else "")

    session = ChatSession(platform=platform, model=model, title=title)
    db.add(session)
    await db.commit()
    await db.refresh(session)
    return session


async def add_message(
    db: AsyncSession, session_id: int, role: str, content: str
) -> None:
    """Append a single message to a session."""
    db.add(ChatMessage(session_id=session_id, role=role, content=content))
    await db.commit()


# ── Markdown formatting ────────────────────────────────────────────────────────

def _folder_for_session(session: ChatSession) -> str:
    """Return the export subfolder name for a session."""
    if session.platform == "telegram":
        return "Telegram"
    return _FOLDER_MAP.get(session.model, session.model.title())


def _format_session_md(session: ChatSession) -> str:
    """Render a single session as a Markdown block."""
    title = session.title or "Untitled"
    started = session.created_at.strftime("%Y-%m-%d %H:%M UTC")
    model_label = _FOLDER_MAP.get(session.model, session.model.title())

    lines = [
        f"## {title}",
        f"*Started: {started} | Model: {model_label} | Platform: {session.platform}*",
        "",
    ]
    for msg in session.messages:
        speaker = "**You**" if msg.role == "user" else f"**{model_label}**"
        lines.append(f"{speaker}:  {msg.content}")
        lines.append("")
    return "\n".join(lines)


# ── Export a single session to a file (manual save) ───────────────────────────

def export_session_to_file(session: ChatSession, base_dir: Path, label: str) -> Path:
    """
    Write one session to a .md file and return the path.
    label is appended to the filename, e.g. '(Saved by User)'.
    """
    folder = base_dir / _folder_for_session(session)
    folder.mkdir(parents=True, exist_ok=True)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M")
    filename = f"{ts} {label}.md"
    filepath = folder / filename

    folder_name = _folder_for_session(session)
    header = [
        f"# {folder_name} — {ts} {label}",
        f"**Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
        "",
        "---",
        "",
    ]
    content = "\n".join(header) + _format_session_md(session)
    filepath.write_text(content, encoding="utf-8")
    return filepath


# ── Nightly export ─────────────────────────────────────────────────────────────

async def export_day(db: AsyncSession, target_date: date, base_dir: Path) -> int:
    """
    Export all sessions whose created_at falls on target_date (UTC).
    Groups sessions by their export folder and writes one file per folder.
    Returns the total number of sessions exported.
    """
    start = datetime.combine(target_date, datetime.min.time()).replace(tzinfo=timezone.utc)
    end   = start + timedelta(days=1)

    result = await db.execute(
        select(ChatSession)
        .options(selectinload(ChatSession.messages))
        .where(ChatSession.created_at >= start, ChatSession.created_at < end)
        .order_by(ChatSession.model, ChatSession.created_at)
    )
    sessions = list(result.scalars().all())

    if not sessions:
        logger.info("No sessions on %s — skipping export.", target_date)
        return 0

    # Group by destination folder.
    by_folder: dict[str, list[ChatSession]] = {}
    for s in sessions:
        key = _folder_for_session(s)
        by_folder.setdefault(key, []).append(s)

    date_str = target_date.strftime("%Y-%m-%d")

    for folder_name, folder_sessions in by_folder.items():
        folder = base_dir / folder_name
        folder.mkdir(parents=True, exist_ok=True)

        filename = f"{date_str} Daily Log (Auto-Saved).md"
        filepath = folder / filename

        lines = [
            f"# {folder_name} — {date_str} Daily Log (Auto-Saved)",
            f"**Exported:** {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}",
            f"**Sessions:** {len(folder_sessions)}",
            "",
            "---",
            "",
        ]
        for s in folder_sessions:
            lines.append(_format_session_md(s))
            lines.append("---")
            lines.append("")

        filepath.write_text("\n".join(lines), encoding="utf-8")
        logger.info("Exported %d session(s) → %s", len(folder_sessions), filepath)

    return len(sessions)


# ── Prune sessions older than retention_days ──────────────────────────────────

async def prune_old_sessions(db: AsyncSession, retention_days: int) -> int:
    """Delete sessions older than retention_days. Returns the count deleted."""
    cutoff = datetime.now(timezone.utc) - timedelta(days=retention_days)
    result = await db.execute(
        select(ChatSession).where(ChatSession.created_at < cutoff)
    )
    old = list(result.scalars().all())
    for s in old:
        await db.delete(s)
    if old:
        await db.commit()
        logger.info("Pruned %d session(s) older than %d days.", len(old), retention_days)
    return len(old)
