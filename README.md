# Trading Analysis Platform

A VPS-hosted crypto market monitoring platform with multiple visual panels for
price, liquidation, liquidity, alerts, and AI-assisted analysis.

## Goal

Build a personal market intelligence dashboard for BTC first, then evolve it
into a shareable and customizable platform.

## MVP Features

- Live market monitoring (price, liquidations, order-book)
- - Multiple dashboard panels
  - - Historical data storage in PostgreSQL
    - - AI-assisted market summaries (Claude API)
      - - Alerts
       
        - ## Planned Stack
       
        - | Layer      | Technology                        |
        - |------------|-----------------------------------|
        - | Backend    | Python / FastAPI                  |
        - | Frontend   | React + TypeScript + Vite         |
        - | Database   | PostgreSQL 16                     |
        - | Runtime    | Docker Compose (local + VPS)      |
       
        - ---

        ## Running Locally with Docker Compose

        ### Prerequisites

        - [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker
        -   Engine + Compose plugin on Linux)
        -   - Git
         
            - ### 1. Clone the repo
         
            - ```bash
              git clone https://github.com/dadadavid116/trading-analysis-platform.git
              cd trading-analysis-platform
              ```

              ### 2. Create your `.env` file

              ```bash
              cp .env.example .env
              ```

              The defaults in `.env.example` work out of the box for local development.
              You only need to change `POSTGRES_PASSWORD` if you want a stronger password.

              ### 3. Start the stack

              ```bash
              docker compose up --build
              ```

              Docker Compose will:
              1. Pull `postgres:16` and start the database.
              2. 2. Build and start the FastAPI backend (`api`) once the database is healthy.
                 3. 3. Build and start the React/Vite dev server (`frontend`) once the API is up.
                   
                    4. First build takes a few minutes while Docker downloads base images and installs
                    5. dependencies. Subsequent starts (without `--build`) are much faster.
                   
                    6. ### 4. Open the app
                   
                    7. | Service  | URL                        |
                    8. |----------|----------------------------|
                    9. | Frontend | http://localhost:5173      |
                    10. | API docs | http://localhost:8000/docs |
                    11. | API root | http://localhost:8000      |
                   
                    12. The frontend dev server proxies all `/api/*` requests to the backend
                    13. automatically — no CORS configuration needed.
                   
                    14. ### 5. Stop the stack
                   
                    15. ```bash
                        docker compose down
                        ```

                        PostgreSQL data is stored in the `postgres_data` Docker volume and survives
                        container restarts. To wipe the database volume completely:

                        ```bash
                        docker compose down -v
                        ```

                        ### Useful commands

                        ```bash
                        # View logs from all services
                        docker compose logs -f

                        # View logs from one service only
                        docker compose logs -f api

                        # Rebuild a single service after code changes
                        docker compose up --build api

                        # Open a psql shell in the running database container
                        docker compose exec db psql -U trading -d trading_db
                        ```

                        ---

                        ## Project Structure

                        ```
                        trading-analysis-platform/
                        ├── backend/          # FastAPI app, collectors, models
                        ├── frontend/         # React + TypeScript + Vite dashboard
                        ├── docs/             # Architecture and roadmap docs
                        ├── scripts/          # One-off helper scripts
                        ├── tests/            # Backend (pytest) and frontend (vitest) tests
                        ├── docker-compose.yml
                        ├── .env.example
                        └── README.md
                        ```

                        See [`docs/architecture.md`](docs/architecture.md) for the full technical
                        blueprint and build order.

                        ---

                        ## Status

                        Phase 4 complete — Docker / local runtime.
                        The full stack (db + api + frontend) runs together locally via Docker Compose.

                        Next: Phase 5 — seed the database with static test data and confirm the
                        frontend renders it end-to-end through the full stack.

                        ---

                        ## Notes

                        - This repo is for original development.
                        - - External repositories are used only as references for inspiration, not for
                          -   direct copying.
                          -   - Secrets and real API keys must never be committed. Use `.env` (git-ignored).
