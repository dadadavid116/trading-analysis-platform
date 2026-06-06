from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.services.macro_scorer import compute_macro_snapshot
from app.services.macro_config import days_to_fomc

router = APIRouter(prefix="/macro", tags=["macro"])


@router.get("/snapshot")
async def get_macro_snapshot(db: AsyncSession = Depends(get_db)):
    """
    Compute (or return cached) macro factor snapshot.
    Fetches DXY/SPX/VIX/Gold from yfinance and UST10Y/HY spread/CPI from FRED.
    Results are cached for 15 minutes in macro_observations.
    FRED factors require FRED_API_KEY env var; yfinance factors always run.
    """
    snap = await compute_macro_snapshot(db)
    return {
        "computed_at":       snap.computed_at.isoformat(),
        "macro_score":       round(snap.macro_score, 2),
        "macro_regime":      snap.macro_regime,
        "trade_environment": snap.trade_environment,
        "primary_driver":    snap.primary_driver,
        "fomc_days":         days_to_fomc(),
        "factors": [
            {
                "factor_name":      f.factor_name,
                "raw_value":        f.raw_value,
                "normalized_score": round(f.normalized_score, 4),
                "direction":        f.direction,
                "confidence":       round(f.confidence, 2),
                "source":           f.source,
                "as_of":            f.as_of.isoformat() if f.as_of else None,
            }
            for f in snap.factors
        ],
    }
