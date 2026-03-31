"""
models/analysis.py — SQLAlchemy ORM model for AI-generated market summaries.

Maps to the `analysis_summaries` table.
Each row is one Claude-generated summary of the current BTC market state.

This table is created automatically on API startup via Base.metadata.create_all
in main.py — no manual SQL or DB wipe needed.
"""

from sqlalchemy import Column, Integer, String, Text, DateTime

from app.database import Base


class AnalysisSummary(Base):
    __tablename__ = "analysis_summaries"

    id           = Column(Integer, primary_key=True)
    symbol       = Column(String(20), nullable=False)
    generated_at = Column(DateTime(timezone=True), nullable=False)
    summary_text = Column(Text, nullable=False)
    model_used   = Column(String(100), nullable=False)
