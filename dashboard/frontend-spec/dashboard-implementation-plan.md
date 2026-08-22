# Obeverfy Dashboard Implementation Plan

## Purpose

Build the live trace-monitoring dashboard described in Tasks 8–10 of
`docs/plans/obeverfy-implementation-plan.md`.

The dashboard is a Vite and React 18 application that reads the `spans` table
directly through the browser-safe Supabase publishable key. It does not use the
legacy Express backend. Supabase Realtime provides live inserts and updates
without polling.

## Current State

- The Vite, React, and Supabase dependencies are installed.
- `package.json`, `vite.config.js`, `index.html`, `main.jsx`, and
  `supabaseClient.js` are scaffolded.
- The Phase 1–5 configuration boundary, application shell, recent trace list,
  trace hierarchy, span inspector, Realtime reconciliation, accessibility, and
  production-hardening work are implemented.
- `index.css` contains the dashboard tokens, configuration states, responsive
  shell, trace-list states, trace hierarchy, and inspector layout.
- `dashboard/package-lock.json` is currently untracked and should be committed
  with the implementation.
- The Supabase SQL schema exists locally, including RLS policies and Realtime
  publication configuration, but the remote project configuration still needs
  to be confirmed.
- The Python tracing SDK, demo agent, and Python tests are currently stubs.
  Dashboard work can proceed independently, but the documented end-to-end
  scenario depends on Tasks 2–7 being completed.
- The working Git branch is `dashboard`, although the repository README still
  refers to the `obeverfy` branch.

## Scope

### In scope

- Recent root-trace list
- Selected trace tree/waterfall
- Span input, output, error, and metadata inspector
- Supabase initial queries
- Supabase Realtime subscriptions
- Loading, empty, error, running, and disconnected states
- Keyboard accessibility and responsive behavior
- Production build and end-to-end verification

### Out of scope

- The old Express backend and SDK directories
- Writing data to Supabase from the browser
- Authentication or user management
- Uploading claim files or triggering the Python agent from the dashboard
- Automatic integration with third-party agent frameworks
- A state-management library or CSS framework

File upload is identified as a future feature in the main implementation plan
and requires a separate design pass.

## Data Contract

The dashboard consumes rows from the Supabase `spans` table:

| Field | Purpose |
| --- | --- |
| `span_id` | Unique span identifier and reconciliation key |
| `trace_id` | Groups all spans in one execution |
| `parent_span_id` | Defines parent/child nesting |
| `name` | Human-readable operation name |
| `kind` | One of `chain`, `llm`, or `tool` |
| `input` | JSON input payload |
| `output` | JSON output payload |
| `status` | One of `running`, `ok`, or `error` |
| `error` | Error message when execution fails |
| `started_at` | Start time and chronological sort key |
| `ended_at` | Completion time |
| `duration_ms` | Completed duration, or `null` while running |

Root traces are spans whose `parent_span_id` is `null`. One root span is
expected per `trace_id`.

## Immediate Prerequisites

- [x] Rename `SUPABASE_URL` in `dashboard/.env` to
      `VITE_SUPABASE_URL`.
- [x] Keep `VITE_SUPABASE_PUBLISHABLE_KEY` as the browser credential.
- [x] Never place `SUPABASE_SECRET_KEY` in the dashboard environment.
- [x] Confirm `supabase/schema.sql` has been run against the remote project.
- [ ] Confirm the `spans` table belongs to the `supabase_realtime`
      publication.
- [ ] Confirm the anonymous/publishable role can select, but cannot insert,
      update, or delete spans.

Vite only exposes environment variables prefixed with `VITE_`. The dashboard
now uses the required prefix so the Supabase URL is available to browser code.

## Implementation Phases

### Phase 1: Stabilize the Supabase Boundary

Status: Complete

Files:

- `src/supabaseClient.js`
- `src/App.jsx`

Tasks:

- [x] Validate `VITE_SUPABASE_URL` and
      `VITE_SUPABASE_PUBLISHABLE_KEY` before creating the client.
- [x] Present a useful configuration error when either value is absent.
- [x] Keep all browser access read-only.
- [x] Establish small, consistent helpers for formatting Supabase errors.

Acceptance criteria:

- Correct configuration creates the Supabase client normally.
- Missing configuration displays actionable setup guidance rather than an
  opaque runtime exception or blank page.
- No secret key is bundled into browser code.

### Phase 2: Application Shell and Recent Trace List

Status: Complete

Files:

- `src/App.jsx`
- `src/components/TraceList.jsx`
- `src/index.css`

Tasks:

- [x] Create a two-pane desktop shell with recent traces on the left and the
      selected trace workspace on the right.
- [x] Query the newest 20 root spans from Supabase.
- [x] Order root traces by `started_at` descending.
- [x] Display trace name, start time, status, and duration.
- [x] Show `running` when `duration_ms` is `null`.
- [x] Use semantic `<button>` controls for selectable rows instead of
      click-only list elements.
- [x] Implement hover, focus, active, and selected states.
- [x] Implement loading skeletons, a useful empty state, a query-error state,
      and a retry action.
- [x] Reset span selection when the selected trace changes.
- [x] Stack or otherwise restructure the list and detail areas on narrow
      screens.

Acceptance criteria:

- A populated database displays the newest root traces first.
- Selecting a trace updates the main workspace.
- The trace list remains usable with a keyboard.
- Loading, empty, and error cases do not produce a blank interface.
- The layout works at desktop and mobile viewport widths.

### Phase 3: Trace Tree and Span Inspector

Status: Complete

Files:

- `src/components/TraceWaterfall.jsx`
- `src/components/SpanDetail.jsx`
- `src/App.jsx`
- `src/index.css`
- `src/lib/spans.js`
- `src/lib/formatters.js`

Tasks:

- [x] Fetch all spans for the selected `trace_id`.
- [x] Convert the flat span collection into a tree using `parent_span_id`.
- [x] Treat spans with missing parents as roots so partial live data remains
      visible.
- [x] Sort roots and children by `started_at`.
- [x] Render each span with nesting depth, kind, name, status, duration, and
      error indication.
- [x] Use keyboard-selectable semantic controls for span rows.
- [x] Store the selected `span_id`, not a copied span object.
- [x] Derive the selected span from the latest span collection so its detail
      panel stays synchronized with Realtime updates.
- [x] Display status, kind, identifiers, timestamps, duration, and error text
      in the inspector.
- [x] Display formatted input and output JSON with safe horizontal overflow.
- [x] Give `null` input/output values a clear empty presentation.
- [x] Handle long names, large JSON values, deep nesting, and failed spans.

Acceptance criteria:

- The expected `handle_claim` root and children appear at the correct depths.
- Children remain chronologically ordered regardless of query or event order.
- Selecting a span displays its complete details.
- When a selected running span completes, the inspector updates without
  requiring another click.

The first release may use the implementation document's indented tree. A
proportional timeline bar is a valuable visual enhancement, but is not required
for the initial functional delivery.

### Phase 4: Realtime Reconciliation

Status: Complete

Files:

- `src/components/TraceList.jsx`
- `src/components/RealtimeIndicator.jsx`
- `src/hooks/useTraceSpans.js`
- `src/lib/spans.js`

Tasks:

- [x] Subscribe to root span inserts and updates for the recent trace list.
- [x] Subscribe to changes filtered by the active `trace_id` for the trace
      tree.
- [x] Reconcile changes by `span_id` through an upsert helper rather than
      blindly appending events.
- [x] Handle INSERT, UPDATE, and DELETE event payloads safely.
- [x] Sort spans again after reconciliation.
- [x] Avoid losing an event between initial loading and subscription setup.
- [x] Remove old channels whenever the selected trace changes.
- [x] Ensure subscriptions are safe under React Strict Mode's development
      remount behavior.
- [x] Ignore late events belonging to a previously selected trace.
- [x] Surface a restrained live, reconnecting, or offline indicator.

Acceptance criteria:

- A root trace appears in the list shortly after it begins.
- Child spans appear progressively in the selected trace.
- Running spans become successful or failed without a page refresh.
- Duplicate events do not create duplicate rows.
- Switching traces does not leak events or subscriptions from the prior trace.

Implementation verification covers deterministic INSERT, UPDATE, DELETE,
deduplication, child-event, ordering, and cleanup behavior. The live browser
acceptance flow remains part of the full end-to-end verification below because
it requires a running trace producer and a browser WebSocket connection.

### Phase 5: UI Hardening and Polish

Status: Complete

Files:

- `src/index.css`
- All interactive dashboard components

Tasks:

- [x] Define reusable tokens for surfaces, text, borders, accent, semantic
      states, spacing, radii, typography, focus rings, and z-index levels.
- [x] Use a restrained product palette: accent for selection and actions,
      semantic colors for running, success, and error.
- [x] Pair colored status indicators with visible text or accessible labels.
- [x] Ensure normal text meets a 4.5:1 contrast ratio.
- [x] Add visible `:focus-visible` styles to every interactive element.
- [x] Keep interaction transitions within approximately 150–250 ms.
- [x] Respect `prefers-reduced-motion` for any animated running indicator.
- [x] Provide touch-friendly targets on small screens.
- [x] Preserve readable JSON and metadata at narrow widths.
- [x] Confirm all interactive components cover default, hover, focus, active,
      selected, loading, disabled, and error states where applicable.

Acceptance criteria:

- The UI is usable without a mouse.
- Information is understandable without relying on color alone.
- No text or JSON breaks its container at supported viewport widths.
- Responsive behavior changes the structure rather than merely shrinking type.

## Suggested Source Structure

```text
dashboard/src/
├── App.jsx
├── main.jsx
├── supabaseClient.js
├── index.css
├── hooks/
│   └── useTraceSpans.js
├── components/
│   ├── AppErrorBoundary.jsx
│   ├── RealtimeIndicator.jsx
│   ├── TraceList.jsx
│   ├── TraceWaterfall.jsx
│   └── SpanDetail.jsx
└── lib/
    ├── config.js
    ├── spans.js
    └── formatters.js
```

`spans.js` should contain pure functions such as tree construction, sorting,
and event reconciliation. `formatters.js` should contain timestamp, duration,
and display-value formatting. Keeping these operations pure makes them easier
to verify without introducing a state-management library.

## Verification Plan

### Local static verification

- [x] Verify the missing-environment configuration state.
- [x] Run `npm run build` from `dashboard/`.
- [x] Confirm the production build completes without warnings or errors.
- [ ] Run the dashboard against an empty `spans` table.
- [ ] Verify manually inserted or fixture spans while the Python producer is
      unfinished.
- [ ] Verify successful, running, and failed traces.
- [x] Verify orphan spans and out-of-order rows.
- [ ] Verify keyboard navigation through trace and span rows.
- [ ] Verify representative desktop and mobile viewport widths.
- [ ] Verify reduced-motion behavior.

### Full end-to-end verification

This stage depends on the Python SDK and demo-agent Tasks 2–7.

1. Start the dashboard and leave the trace list open.
2. Run `.venv/bin/python -m demo_app.scenarios.run_claim` from the repository
   root.
3. Confirm the root trace appears while its status is `running`.
4. Select the trace and confirm child spans appear progressively.
5. Confirm durations and final statuses update without refreshing.
6. Confirm span input and output data appears in the inspector.
7. Confirm the final action span and root trace complete successfully.
8. Repeat with a failing span and confirm errors are surfaced correctly.

## Known Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| The dashboard cannot perform a full live demo because Python producers are stubs | Use manually inserted fixture rows for frontend development and schedule final integration after Tasks 2–7 |
| Remote Supabase schema or Realtime publication has not been applied | Confirm schema, RLS, and publication before diagnosing frontend subscriptions |
| Initial fetch races with the first Realtime event | Establish a safe subscription/load sequence and reconcile all rows by `span_id` |
| Realtime UPDATE events create duplicate span rows | Centralize idempotent upsert logic |
| Selected span details become stale | Store `selectedSpanId` and derive the object from current span state |
| Events arrive out of chronological order | Sort roots and children by `started_at` after every reconciliation |
| Strict Mode creates duplicate development subscriptions | Make effect setup and cleanup symmetrical and verify active channels |
| Large input/output JSON degrades the layout | Constrain the inspector, preserve whitespace, and provide controlled overflow |
| Status is communicated only by color | Include text labels and accessible names |

## Delivery Order

1. Fix environment configuration and validate the Supabase client.
2. Build the static application shell and recent trace list.
3. Build the trace tree and synchronized span inspector.
4. Add robust Realtime subscriptions and reconciliation.
5. Complete accessibility, responsive, and visual-quality passes.
6. Run local static verification.
7. Run the full demo when the Python producer is available.
8. Commit the implementation and `dashboard/package-lock.json`.

## Definition of Done

- [x] The dashboard builds successfully with `npm run build`.
- [x] Browser code uses only the Supabase publishable key.
- [x] The newest 20 root traces load directly from Supabase.
- [ ] Trace and span selections are keyboard accessible.
- [x] The selected trace renders as an ordered parent/child tree.
- [x] The selected span inspector shows current metadata, input, output, and
      errors.
- [ ] Realtime inserts and updates appear without refreshing.
- [x] Subscriptions are cleaned up correctly.
- [x] Loading, empty, configuration-error, query-error, running, success,
      error, reconnecting, and offline states have clear presentations.
- [ ] The layout works on desktop and mobile screens.
- [x] Status is not communicated by color alone.
- [ ] The end-to-end demo passes after the Python implementation is available.
- [ ] `dashboard/package-lock.json` is committed.
