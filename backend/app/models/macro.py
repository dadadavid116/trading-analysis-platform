from sqlalchemy import Column, Integer, String, Float, DateTime
from app.database import Base


class MacroObservation(Base):
    __tablename__ = "macro_observations"

    id               = Column(Integer, primary_key=True)
    collected_at     = Column(DateTime(timezone=True), nullable=False)
    factor_name      = Column(String(50),  nullable=False)
    raw_value        = Column(Float)
    normalized_score = Column(Float,       nullable=False)
    direction        = Column(String(10),  nullable=False)
    confidence       = Column(Float,       nullable=False)
    source           = Column(String(30),  nullable=False)
    as_of            = Column(DateTime(timezone=True))
