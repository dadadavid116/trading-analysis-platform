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

## Project Memory / Source of Truth
The originating build conversation is very large. **Do not rely on chat memory alone.** The
repository docs are the source of truth. Before making any change:

1. Read these docs first (in order):
   - `docs/phase_status.md` — current completed phase + next task (canonical status)
   - `docs/decision_log.md` — settled decisions that must not be re-litigated
   - `docs/next_task.md` — the execution brief for the next phase
   - `docs/current_platform_full_context.md` — what exists in code today
   - `docs/future_phases_unfinished_overview.md` — locked roadmap (Phase 76 → 97)
   - `docs/redesign_outline_for_review.md`, `docs/ui_redesign_context.md`, `docs/roadmap.md`
2. The **current completed phase** and the **next task** always live in `docs/phase_status.md`
   and `docs/next_task.md`. If chat memory disagrees with those files, the files win.
3. **Do not start implementation without reading those docs and summarizing your understanding
   back to the user first.** A fresh chat can bootstrap from `docs/new_chat_bootstrap_prompt.md`.

## Current Priority
Phases 73–75 are complete (Information Architecture Reset, Design System Foundation, Context Desk
Shell). The next implementation phase is **Phase 76 — Schema & Data-Foundation Hardening** (make
Alembic the single source of truth before any new tables). Do not begin Phase 76 until the user
approves the plan. See `docs/phase_status.md`.
