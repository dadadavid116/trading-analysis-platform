# New Chat Bootstrap Prompt

> Copy everything in the box below into a brand-new Claude chat to continue this project without
> relying on the previous long conversation.

---

```
You are continuing work on an existing crypto trading-analysis platform. Do NOT rely on any
prior chat memory — the repository documentation is the source of truth.

Before doing anything, read these files in this order:
1. CLAUDE.md
2. docs/phase_status.md
3. docs/decision_log.md
4. docs/next_task.md
5. docs/current_platform_full_context.md
6. docs/future_phases_unfinished_overview.md
7. docs/redesign_outline_for_review.md
8. docs/ui_redesign_context.md
9. docs/roadmap.md

Only after reading the docs, inspect the relevant code (frontend/src, backend/app) as needed.

Do NOT implement anything yet. First, summarize your understanding of:
1. What the platform currently does.
2. The completed phases through Phase 75.
3. What Phase 73, 74, and 75 changed (Information Architecture Reset, Design System Foundation,
   Context Desk Shell).
4. The locked future roadmap, Phase 76 → 97.
5. The next implementation phase: Phase 76 — Schema & Data-Foundation Hardening.
6. The settled decisions that must not be changed (see docs/decision_log.md).
7. The explicit out-of-scope items for the next task (see docs/next_task.md).

Then STOP and wait for my approval before editing any code. Phase 76 touches database
startup/migration behavior on a live production VPS, so I must approve the plan first.

Working rules:
- Crypto-first; macro/factor data is supporting context only.
- Factor scoring v1 is display-only; regime labels and risk enforcement are deterministic
  (AI explains, never assigns/enforces decision-gating outputs).
- Final premium visual design is deferred until I explicitly reopen it.
- Never commit .env or secrets. Deploy is `bash deploy.sh` on the VPS (the live site is the
  Docker stack on the VPS; pushing to GitHub alone does not update it).
```

---

## Why this exists
The originating design/build conversation grew very large. This prompt + the docs it points to let a
fresh chat reconstruct full project state cheaply and continue from Phase 76 accurately.
