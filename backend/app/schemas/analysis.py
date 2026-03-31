"""
schemas/analysis.py — Pydantic response schema for the analysis endpoint.
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class AnalysisSummarySchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:           int
    symbol:       str
    generated_at: datetime
    summary_text: str
    model_used:   str
