# DevOps-for-GenAI---Ottawa-2026---Team-08

DevOps for GenAI - Ottawa Hackathon Series 2026- Team 08- Project Name - AI Observability

can i push?

## Obeverfy (branch: `obeverfy`)

A decorator-based Python tracing SDK, a multi-step insurance-claim demo agent instrumented with it, and a live dashboard — backed entirely by Supabase (Postgres + Realtime), no custom backend server.

Full task-by-task implementation plan: [`docs/plans/obeverfy-implementation-plan.md`](docs/plans/obeverfy-implementation-plan.md). Read that before picking up a task — it has the exact code, tests, and commands for each piece.

Folder layout:
- `obeverfy/` — the tracing SDK (`@traced` decorator, `SupabaseReporter`)
- `demo_app/` — the insurance-claim demo agent (Supabase-backed data, OpenAI calls, tools, the `handle_claim` pipeline)
- `dashboard/` — Vite + React live trace viewer
- `supabase/schema.sql` — the Postgres schema (spans, policies, claims)
- `tests/` — pytest suite for `obeverfy`/`demo_app`

The old `backend/` (Express) and `sdk/` (OpenAI stub) folders are from an earlier, superseded design and are left as-is on this branch rather than removed.
