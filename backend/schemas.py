"""Validated request and response shapes."""
from datetime import datetime

from pydantic import BaseModel, Field

from .config import MAX_TEXT_LENGTH


class JournalEntry(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


class MemoryQuery(BaseModel):
    query: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


class EvaluationText(BaseModel):
    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)


class JournalEntryResponse(BaseModel):
    id: int
    text: str
    created_at: datetime

    class Config:
        from_attributes = True
