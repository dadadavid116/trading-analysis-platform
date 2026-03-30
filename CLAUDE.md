# Trading Analysis Platform - Claude Project Instructions

## Project Goal
Build a modular crypto market monitoring platform that runs on a VPS 24/7.

## MVP Scope
The first version should support:
- one market first: BTC
- one web dashboard
- price visualization
- liquidation monitoring
- liquidity / order-book monitoring
- backend data collectors
- database storage
- alert support
- AI-assisted analysis panel

## Tech Direction
- Backend: Python
- Frontend: React + TypeScript
- Database: PostgreSQL
- Deployment: Docker Compose on VPS

## Repo Rules
- Do not add secrets or real API keys to the repository.
- Use `.env.example` for environment variable templates.
- Keep architecture decisions documented in `docs/architecture.md`.
- Keep roadmap changes documented in `docs/roadmap.md`.
- Prefer simple, modular structure over advanced abstractions.
- Build the MVP first before adding extra features.

## Working Style
- Before large changes, explain the plan briefly.
- Make changes in small steps.
- Keep files readable for a beginner maintainer.
- Add comments only where they truly help.
- When creating new folders, add a README or placeholder file if needed.

## Current Priority
Scaffold the backend and frontend foundations for the MVP.
