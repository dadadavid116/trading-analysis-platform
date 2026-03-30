# Backend

This folder contains the entire Python backend for the Trading Analysis Platform.

## Structure

```
backend/
├── app/                # FastAPI application (API server)
│   ├── main.py         # Entry point — creates the FastAPI app
│   ├── config.py       # Settings loaded from environment variables
│   ├── database.py     # SQLAlchemy engine and session setup
│   ├── models/         # ORM models (database table definitions)
│   ├── routers/        # API route handlers (one file per feature area)
│   └── schemas/        # Pydantic schemas (request/response shapes)
├── collectors/         # [Later] Data collection workers (Binance WebSocket streams)
├── analysis/           # [Later] AI-assisted analysis logic (Claude API)
├── alerts/             # [Later] Alert evaluation and notification logic
├── migrations/         # [Later] Alembic database migration scripts
├── tests/              # Pytest tests for the backend
├── requirements.txt    # Python dependencies
└── Dockerfile          # Container definition for the backend service
```

## Running Locally (without Docker)

```bash
# Create and activate a virtual environment
python -m venv venv
source venv/bin/activate  # Windows: venv\\Scripts\\activate

# Install dependencies
pip install -r requirements.txt

# Copy environment variables
cp ../.env.example ../.env
# Edit .env and fill in your values

# Start the API server
uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000.
Interactive docs are at http://localhost:8000/docs.

## Running with Docker Compose

From the repo root:

```bash
docker compose up --build
```

## Environment Variables

See `../.env.example` for all required variables.
The backend reads them via `app/config.py`.

## Notes

- The `collectors/`, `analysis/`, and `alerts/` folders are placeholders for now.
  They will be implemented in later phases (see `docs/architecture.md` Section 11).
- Database migrations (Alembic) will be added once the schema stabilises.
