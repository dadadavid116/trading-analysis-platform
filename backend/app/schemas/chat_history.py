"""
schemas/chat_history.py — Pydantic response schemas for chat history endpoints.
"""

from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict


class ChatMessageSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:        int
    role:      str
    content:   str
    timestamp: datetime


class ChatSessionSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:             int
    platform:       str
    model:          str
    title:          Optional[str]
    created_at:     datetime
    last_active_at: datetime


class ChatSessionDetailSchema(ChatSessionSchema):
    messages: List[ChatMessageSchema] = []
