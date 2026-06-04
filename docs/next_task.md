# Next Task — Execution Brief

> Compact brief for the next Claude chat. Read `docs/phase_status.md` and `docs/decision_log.md`
> first. Last updated: end of **Phase 75**.

---

## Next task

**Prepare for Phase 76 — Schema & Data-Foundation Hardening.**

## Rules of engagement

- **Do not implement until the user explicitly approves.** Phase 76 changes database startup/migration
  behavior on a **live production VPS** — get sign-off first.
- **First, summarize your understanding back to the user** (current schema reality + proposed safe
  migration path) before touching any file.
- Preserve **production data safety** at every step.

## Immediate scope (planning, then — only after approval — implementation)

1. **Inspect the current schema-management reality**, comparing:
   - SQLAlchemy models in `backend/app/models/`
   - `scripts/init_db.sql`
   - Alembic history in `backend/alembic/versions/`
   - Startup migration behavior in `backend/app/main.py` lifespan (`create_all` + `ALTER TABLE IF NOT EXISTS`)
2. **Identify all ad-hoc `create_all` / `ALTER` behavior** and every column/table that exists in the
   live DB but is **not** represented by an Alembic revision (known drift: `alerts.webhook_url`,
   `journal_entries.notes`, `journal_entries.notified_outcome`).
3. **Plan a safe migration path** to make Alembic the single source of truth:
   - backfill Alembic revisions to match the current live schema,
   - decide what to do with `create_all` + the `ALTER` block (retire/replace),
   - define the `alembic stamp head` / upgrade procedure for the existing VPS DB,
   - add index + retention + backfill discipline for the table-heavy phases to come.
4. **Avoid creating new feature tables** until schema discipline is fixed.

## Explicit out of scope for this task

- ❌ No macro collectors.
- ❌ No Context Score implementation (the Phase 82 engine).
- ❌ No factor tables yet — they may only be **documented** for future migrations, not created.
- ❌ No signal engine.
- ❌ No account / execution tables.
- ❌ No paper execution.
- ❌ No live execution.
- ❌ No visual redesign (final visual identity is deferred — see `decision_log.md` D14).

## Deliverable for the planning step

A short written plan covering: current-state findings, the exact drift, the safe migration sequence,
the production rollout/rollback procedure, and confirmation that no new feature tables are introduced
in Phase 76. Then wait for the user's go-ahead.
