# AI Observability

**DevOps for GenAI – Ottawa Hackathon Series 2026**
**Team 08**
**Selected Theme:** Unified AI Observability

## Overview

### Elevator Pitch

Obeverfy is a lightweight observability SDK for Python-based AI agents that makes their execution visible in real time. Developers add a simple @traced decorator to agent functions, and Obeverfy automatically captures nested execution spans, inputs, outputs, status, errors, and timing. A live dashboard then visualizes the resulting trace, helping developers understand how multi-step agents behave and where failures occur.

### Problem Statement

AI agents can perform multiple LLM calls, tool calls, and decision-making steps during a single task, making it difficult for developers to understand what happened when an agent behaves unexpectedly. Traditional application logs may show individual events but do not necessarily preserve the parent-child relationships, inputs, outputs, timing, and status of each step in an agent workflow. Obeverfy addresses this by capturing structured traces of agent execution and presenting them as a live hierarchical view.

### Target Users

Developers and Teams building function-based Python AI agents who need visibility into agent execution for debugging, testing, and monitoring.

---

## Architecture

### Architecture Diagram

No rendered diagram asset has been created for this submission. As a text overview:

```
Demo Agent (Python, demo_app/)                     Dashboard (React, dashboard/)
  handle_claim()
    |                                                 Trace list -> Waterfall -> Span detail
    | @traced (obeverfy/tracing.py)                          ^
    v                                                        | Supabase Realtime
  classify_claim -> retrieve_policy ->                        | (postgres_changes on `spans`)
  retrieve_claim_history -> decide -> act                     |
    |                                                        |
    | span start/end events                                  |
    v                                                        |
  SupabaseReporter (obeverfy/client.py)  ---- insert/upsert --+
    |
    v
  Supabase (Postgres + Realtime)
  tables: spans, policies, claims
```

The demo agent and the dashboard never talk to each other directly — Supabase is the only shared state, both for telemetry (`spans`) and the demo's own domain data (`policies`, `claims`).

### Technology Stack

Backend / SDK: Python 3.12, supabase-py, python-dotenv
Testing: pytest
Database / Infrastructure: Supabase Postgres, Row Level Security, Supabase Realtime
Frontend: React 18, Vite, @supabase/supabase-js, CSS
AI: OpenAI Responses API
Observability SDK: custom Obeverfy Python SDK using decorators and contextvars

### AI Tool Inventory

- **OpenAI Responses API** — powers the demo insurance-claims agent's classification and decision-making steps.
- **Claude Code (Anthropic)** — used as an AI coding assistant during development. See **AI Disclosure** at the end of this README.

### AI Usage Disclosure

See **AI Disclosure** at the end of this README.

---

## Running the Project

### Working Demo

**Live Demo:** No hosted demo is available. Follow the setup instructions below to reproduce the project locally.

### Prerequisites

- Python 3.12+
- Node.js and npm
- A Supabase project (Postgres + Realtime)
- An OpenAI API key

### Setup

1. `pip install -r requirements.txt`
2. Run `supabase/schema.sql` in your Supabase project's SQL Editor (creates the `spans`, `policies`, and `claims` tables, enables RLS, and adds `spans` to the Realtime publication).
3. `cp .env.example .env` and fill in real values.
4. `cp dashboard/.env.example dashboard/.env` and fill in real values.
5. `cd dashboard && npm install`

### Running Locally

```bash
# Seed demo policies/claims
python -m demo_app.seed_data

# Run a single demo claim through the agent
python -m demo_app.scenarios.run_claim

# Batch-process the sample claims
python -m demo_app.scenarios.process_claims demo_app/sample_claims

# Start the dashboard (separate terminal)
cd dashboard && npm run dev
```

### Configuration and Environment Variables

Root `.env` (server-side, never shared with the browser):

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `OPENAI_RESPONSES_URL`

`dashboard/.env` (browser-safe):

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

No real values are included in this repository; `.env` files are git-ignored.

---

## Repository

**GitHub Repository:** https://github.com/MLPK-1/DevOps-for-GenAI---Ottawa-2026---Team-08

### Repository Structure

- `obeverfy/` — the tracing SDK (`@traced` decorator, `SupabaseReporter`)
- `demo_app/` — the insurance-claims demo agent (Supabase-backed data, OpenAI calls, tools, the `handle_claim` pipeline, batch/file claim processing)
- `dashboard/` — the Vite + React live trace viewer
- `supabase/schema.sql` — the Postgres schema (`spans`, `policies`, `claims`)
- `tests/` — pytest suite for `obeverfy`/`demo_app`
- `docs/plans/` — the implementation plans this project was built from
- `backend/`, `sdk/` — an earlier, superseded design (Express backend, OpenAI stub), left in place rather than removed

---

## Security

### Threat Model

**Key assets:** the `SUPABASE_SECRET_KEY` and `OPENAI_API_KEY` (full read/write DB access and paid API access respectively); the `spans`/`policies`/`claims` data itself, which may reflect real-looking claim details.

**Trust boundaries:** the browser (dashboard) is untrusted and only ever holds the publishable key; the Python agent/SDK runs server-side (a developer's machine, for this hackathon) and is the only thing that holds the secret key.

**Potential threat actors:** anyone who obtains the publishable key (low risk — it's designed to be public and RLS-gated) versus anyone who obtains the secret key (high risk — bypasses RLS entirely).

**Major attack vectors:** accidental commit of `.env`; overly permissive RLS policies; the dashboard's anon/publishable-key access being read-only but unauthenticated (anyone with the URL and key can read all traces and claims).

**Security controls and mitigations:** Row Level Security enabled on all three tables; the publishable key can only `select`, never write; all writes require the secret key, which never leaves the Python side; `.env` and `dashboard/.env` are git-ignored; Supabase's newer `sb_publishable_`/`sb_secret_` key format is used rather than the legacy `anon`/`service_role` JWTs.

**Remaining risks:** the dashboard has no authentication of its own — anyone with the publishable key and project URL can view all traces and claim data; this is an intentional simplification for a hackathon demo, not a production-ready posture. There is no rate limiting, tenant isolation, or PII redaction on captured span input/output.

### Security and Adversarial Testing

No formal security or adversarial testing (e.g., prompt-injection red-teaming, fuzzing, penetration testing) has been performed for this submission. This is called out explicitly as a known limitation rather than left unaddressed.

### Secrets and Repository Hygiene

No automated secrets-scanning tool was run. Hygiene practices followed manually throughout development: `.env` files are git-ignored and were never committed; the repository's history was checked before pushes; Supabase's newer secret-key format (`sb_secret_...`) is used and confirmed to carry `BYPASSRLS` only server-side; no credentials appear in code, tests, or documentation.

---

## AI Governance

### AI System Card

**Purpose and intended use:** a demo insurance-claims agent (`demo_app/agent.py`) that classifies a claim, retrieves the applicable coverage policy and claim history, and decides whether to approve or escalate it — built to exercise and demonstrate the Obeverfy tracing SDK, not as a production claims system.

**Model(s) or AI services used:** OpenAI's Responses API (model configurable, see `demo_app/llm.py`).

**Inputs and outputs:** input is a free-text claim description plus a category and amount; output is a classification, a tool call (`approve_claim` or `escalate_claim`), or no action if the model doesn't select a tool.

**Known risks:** the model could misclassify a claim category, miscalculate whether a claim exceeds the approval threshold, or select the wrong tool; there is no independent verification of the model's decision before it's executed.

**Safeguards:** the approval threshold (claims over $10,000 require escalation) is encoded as instructions the model must follow, not as code-level enforcement — this is a deliberate demonstration of the exact failure mode Obeverfy's tracing exists to make visible, not a claim that the safeguard is unbypassable.

**Human oversight:** the escalation path (`escalate_claim`) is itself the human-in-the-loop safeguard — high-value claims are intentionally routed to a human adjuster rather than auto-approved.

**Limitations:** no evaluation dataset or accuracy benchmarking has been performed against this agent; it is a demonstration built for one hackathon scenario (insurance claims), not a general-purpose or production system.

---

## DevOps

### CI/CD Pipeline

No CI/CD pipeline has been configured for this project. Tests are run manually (`pytest` for the Python suite, `npm test` for the dashboard) before merging.

### Testing

- **Python suite:** 40/40 tests passing (`pytest`), covering the tracing SDK, the demo agent pipeline, claim-file loading/validation, and batch processing. All tests mock the Supabase and OpenAI network boundaries — no live credentials are required to run the suite.
- **Dashboard suite:** 10/10 tests passing (`npm test`, Node's built-in test runner), covering config validation, formatters, and span/trace reconciliation logic.
- No end-to-end, security, or AI/model evaluation tests have been written.

### Observability

This is the project's core deliverable, not an afterthought:

- The `@traced` decorator (`obeverfy/tracing.py`) wraps any Python function and automatically nests parent/child spans from the plain call stack via `contextvars` — no manual span-ID wiring.
- Each span (`start` and `end`) is written to Supabase's `spans` table via `SupabaseReporter` (`obeverfy/client.py`), capturing name, kind, input, output, status, error, and duration.
- The dashboard subscribes to Supabase Realtime's `postgres_changes` on `spans` and renders a live-updating trace list and waterfall view — spans appear as "running" and fill in as they complete, without polling.

### SBOM and Dependency Inventory

No automated SBOM tool was used. Dependencies are tracked manually via `requirements.txt` (Python) and `dashboard/package.json`/`package-lock.json` (JavaScript).

---

## Known Limitations

Instrumentation requires adding @traced to functions; it does not automatically instrument existing agent frameworks; only synchronous function-based tracing appears to be covered by the current implementation; telemetry currently captures function inputs/outputs without configurable redaction; the dashboard's anonymous access model is intentionally simplified for the hackathon; and the insurance agent is a demonstration rather than a production claims system.

## Future Roadmap

Async-function support, configurable sensitive-data redaction, authentication/access control for dashboards, framework integrations such as LangChain/CrewAI, filtering/searching traces, metrics/aggregation, retention policies, and additional exporters/backends.

---

## Team

| Team Member     | Role / Contribution |
| --------------- | ------------------- |
| Armando Malpica | Project Lead        |
| Caelen Roberge  | Backend Expert      |
| Yassine Amraoi  | Tracability Expert  |
| Joseph Coakeley | Thought Leader      |

---

## Submission Checklist

- [Y] Project name and selected theme
- [Y] Elevator pitch
- [Y] Problem statement and target users
- [Y] Architecture diagram
- [Y] Working demo / URL or reproducible run
- [Y] GitHub repository
- [Y] Technology and AI-tool inventory
- [Y] AI usage disclosure
- [Y] Security threat model
- [ ] Security/adversarial test evidence
- [Y] Governance / AI system card
- [ ] CI/CD pipeline evidence
- [Y] Testing evidence
- [Y] Observability evidence
- [Y] SBOM/dependency inventory where applicable
- [Y] Secrets scan / repository hygiene evidence
- [Y] Runbook / setup instructions
- [Y] Known limitations and future roadmap
- [Y] Team member list

---

## AI Disclosure

Claude Code (Anthropic) was utilized to generate code for this project.
