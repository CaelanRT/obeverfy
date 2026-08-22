# Obeverfy Hosted Multi-Tenant Architecture

**Status:** Draft for review  
**Date:** 2026-08-22  
**Scope:** Hosted MVP rearchitecture  
**Primary stack:** React, JavaScript/Express, Supabase Auth, Supabase Postgres, Supabase Realtime

## 1. Summary

Obeverfy is currently a decorator-based Python tracing SDK and a React dashboard connected directly to one Supabase project. Instrumented applications write spans with a Supabase secret key, and the browser anonymously reads and subscribes to the global `spans` table.

The hosted MVP will replace that shared-secret architecture with a multi-tenant platform:

1. Users register with email and password.
2. Every user belongs to a workspace; workspaces support teams from the first release.
3. A workspace contains projects, and a project contains explicitly created agents.
4. Users create revocable, project-scoped ingestion API keys.
5. The Python SDK sends span batches to an authenticated Express ingestion API rather than to Supabase.
6. The backend validates the API key, assigns tenant ownership, and writes traces and spans to Supabase Postgres.
7. The React dashboard uses the signed-in Supabase user session to read and subscribe only to data permitted by Row Level Security (RLS).

Supabase remains the managed database, identity provider, and realtime transport. Express becomes the trusted control plane and telemetry ingestion boundary.

## 2. Problem Statement

The prototype cannot safely support multiple customers because:

- Every instrumented application needs the platform's Supabase secret key.
- The dashboard's anonymous Supabase role can read every trace.
- Spans have no workspace, project, agent, or environment ownership.
- There is no user authentication, team membership, API-key lifecycle, or tenant authorization.
- The SDK performs synchronous network writes at span start and completion, allowing telemetry delivery to delay or disrupt the host application.
- Captured input and output have no configurable redaction or size limits.
- The current `backend/` directory is only an Express health-route skeleton and does not participate in the working data path.

## 3. Goals

The MVP must allow a new user to:

1. Register with email and password and verify their email.
2. Create or enter a workspace.
3. Invite teammates and assign workspace roles.
4. Create a project and one or more agents.
5. Generate a project-scoped ingestion API key and see its secret once.
6. Configure the Obeverfy Python SDK with the API key, agent ID, environment, and hosted endpoint.
7. Run an instrumented agent application without exposing Supabase credentials.
8. See its traces appear live in the dashboard.
9. See only traces belonging to workspaces of which the signed-in user is a member.
10. Revoke an ingestion key and prevent further ingestion with it.

The hosted system must also preserve the existing nested trace model: trace ID, span ID, parent span ID, name, kind, input, output, status, error, timestamps, and duration.

## 4. Non-Goals

The following are outside the first hosted release:

- Billing, subscriptions, paid plans, and enforced usage quotas
- Per-project user membership; all active workspace members can see all workspace projects
- Social login, magic links, SSO, and SCIM
- Custom workspace roles or field-level permissions
- Framework-native automatic instrumentation for LangChain, CrewAI, or other agent frameworks
- Automatic interception of arbitrary HTTP or tool calls
- Guaranteed offline delivery backed by a durable on-disk SDK queue
- User-configurable retention periods
- Trace export
- Metrics aggregation, alerting, evaluations, and long-term analytics
- Replacing Supabase Realtime with a custom WebSocket or Server-Sent Events service
- Migrating the insurance demo's `claims` and `policies` domain data into the Obeverfy platform model

The SDK continues to trace explicitly decorated functions. Product language must not claim automatic tracing of calls that have not been decorated or instrumented by an integration.

## 5. Approved Product Decisions

| Area | MVP decision |
| --- | --- |
| Tenancy | Team workspaces from day one |
| Project access | All active workspace members can view all projects in that workspace |
| Roles | `owner`, `admin`, `member` |
| Project model | A workspace has projects; a project has multiple explicitly created agents |
| Environments | Free-form string; SDK default is `development` |
| Ingestion credentials | Revocable project-scoped API keys |
| User authentication | Supabase Auth email/password with email verification |
| Browser session | Supabase user session and access JWT |
| Backend authorization | Express validates the Supabase access JWT for management operations |
| Telemetry ingestion | SDK sends authenticated HTTP batches to Express |
| Trace reads | Authenticated browser queries Supabase directly under RLS |
| Live updates | Authenticated Supabase Realtime subscriptions under RLS |
| Retention | Trace and span telemetry retained for 30 days |
| Backend language | JavaScript with Express |
| Deployment | Host-neutral specification |

## 6. System Architecture

```text
                                      Supabase Auth
                                    email + password
                                           |
                                           v
+------------------+                +-------------------+
| React dashboard  |--------------->| Supabase session  |
|                  |                +-------------------+
| management calls |--- JWT ------> Express management API
| trace queries    |--- JWT ------> Supabase Postgres + RLS
| live updates     |--- JWT ------> Supabase Realtime + RLS
+------------------+

+---------------------------+
| Customer agent application|
| @traced Python functions   |
+---------------------------+
             |
             | project API key + agent ID + environment
             | batched HTTPS span events
             v
+---------------------------+
| Express ingestion API     |
| key verification          |
| validation + rate limits  |
| tenant attribution        |
+---------------------------+
             |
             | trusted database write
             v
+---------------------------+
| Supabase Postgres         |
| workspaces and membership |
| projects, agents, keys    |
| traces and spans          |
+---------------------------+
```

### 6.1 Trust boundaries

- The customer agent application is untrusted. Its project API key permits telemetry ingestion only and cannot read data or call management endpoints.
- The browser is untrusted. It receives a Supabase user session but never a Supabase secret/service credential or ingestion-key hash.
- Express is trusted. It may use a server-only Supabase credential for validated management and ingestion writes.
- Supabase RLS is a required defense boundary for all browser-readable tenant data.
- The database is the source of truth for workspace membership and authorization.

### 6.2 Why the MVP is hybrid

Keeping authenticated trace reads and live updates on Supabase preserves the current realtime behavior without requiring Obeverfy to operate its own connection fan-out service. Express still provides the essential hosted-product boundary: privileged resource management, API-key lifecycle, tenant-safe ingestion, and validation.

Frontend data access must be isolated behind repository modules or hooks so trace queries can move behind Express later without rewriting visual components.

## 7. Tenant and Authorization Model

### 7.1 Ownership hierarchy

```text
Supabase auth user
  -> workspace_membership
      -> workspace
          -> project
              -> agent
              -> project API key
              -> trace
                  -> span
```

A trace belongs to exactly one workspace, project, and agent. A span belongs to exactly one trace and repeats `workspace_id`, `project_id`, and `agent_id` for efficient RLS checks, filtering, retention, and realtime subscriptions. The backend, not the SDK, derives workspace and project ownership from the API key.

### 7.2 Roles

| Capability | Owner | Admin | Member |
| --- | ---: | ---: | ---: |
| View projects, agents, traces, and spans | Yes | Yes | Yes |
| Create/update projects and agents | Yes | Yes | No |
| Generate/revoke API keys | Yes | Yes | No |
| Invite/remove members | Yes | Yes | No |
| Change member roles | Yes | Yes, except owner | No |
| Transfer ownership | Yes | No | No |
| Delete workspace | Yes | No | No |

Rules:

- Every workspace must always have at least one owner.
- A user cannot remove or demote the final owner.
- All project data is visible to every active member of the containing workspace in the MVP.
- Suspended or removed memberships immediately lose management, query, and realtime access.

### 7.3 Invitations

- Owners and admins can invite an email address as `admin` or `member`.
- Invitation tokens are random, single-use, stored only as hashes, and expire after seven days.
- Accepting an invitation requires a verified account whose normalized email matches the invitation email.
- Re-sending an invitation invalidates the older pending token.

## 8. Data Model

All platform-owned IDs use UUIDs unless an existing span or trace ID is supplied by the SDK. Timestamps use UTC `timestamptz`.

### 8.1 `workspaces`

| Column | Notes |
| --- | --- |
| `id` | Primary key |
| `name` | Display name |
| `slug` | Unique URL-safe slug |
| `created_by` | References `auth.users` |
| `created_at`, `updated_at` | Audit timestamps |

### 8.2 `workspace_members`

| Column | Notes |
| --- | --- |
| `workspace_id` | References `workspaces`, cascade delete |
| `user_id` | References `auth.users`, cascade delete |
| `role` | `owner`, `admin`, or `member` |
| `created_at`, `updated_at` | Audit timestamps |

Primary key: `(workspace_id, user_id)`.

### 8.3 `workspace_invitations`

Includes `id`, `workspace_id`, normalized `email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`, and timestamps. Only unexpired, unaccepted invitations are actionable.

### 8.4 `projects`

Includes `id`, `workspace_id`, `name`, workspace-unique `slug`, optional `description`, `retention_days` defaulting to `30`, and timestamps.

The API does not allow changing `retention_days` in the MVP.

### 8.5 `agents`

Includes `id`, `workspace_id`, `project_id`, `name`, project-unique `slug`, optional `description`, `archived_at`, and timestamps.

Agents are created explicitly. An unknown `agent_id` in an ingestion request is rejected; ingestion never silently creates an agent.

### 8.6 `project_api_keys`

| Column | Notes |
| --- | --- |
| `id` | Internal primary key |
| `workspace_id`, `project_id` | Tenant scope |
| `name` | User-provided key label |
| `key_prefix` | Non-secret identifier shown in the UI and used for lookup |
| `key_hash` | HMAC-SHA-256 of the secret using a server-only pepper |
| `created_by` | User who generated the key |
| `last_used_at` | Throttled activity timestamp |
| `expires_at` | Nullable; supported by the model even if UI defaults to no expiry |
| `revoked_at`, `revoked_by` | Revocation audit fields |
| `created_at` | Creation timestamp |

The plaintext key is returned once. Logs and error messages must never contain it. Example presentation format: `obv_<prefix>_<secret>`.

### 8.7 `traces`

Includes:

- `trace_id` supplied by the SDK and used as the primary identifier
- `workspace_id`, `project_id`, `agent_id`
- `environment`
- `name`
- `status`: `running`, `ok`, or `error`
- `root_span_id`, nullable until known
- `started_at`, `ended_at`, `duration_ms`
- `sdk_name`, `sdk_version`, `schema_version`
- `attributes jsonb`
- `received_at`, `updated_at`

Uniqueness must prevent a trace ID from being reused across different tenant ownership. Ingestion that attempts to change the project or agent of an existing trace is rejected.

### 8.8 `spans`

The existing span contract is retained and extended with:

- `workspace_id`, `project_id`, `agent_id`
- `environment`
- `attributes jsonb`
- `received_at`, `updated_at`

`trace_id` references `traces`. `parent_span_id` remains nullable. A span ID is idempotent within its trace and cannot be reassigned to another trace or tenant.

Recommended indexes:

- `traces(project_id, started_at desc)`
- `traces(agent_id, environment, started_at desc)`
- `spans(trace_id, started_at)`
- `spans(project_id, received_at desc)`
- `workspace_members(user_id, workspace_id)`
- `project_api_keys(key_prefix)` where `revoked_at is null`

## 9. Authentication and Browser Sessions

1. The React application signs users up and in with Supabase Auth email/password APIs.
2. Email verification is required before workspace and project operations.
3. The browser maintains the Supabase session and refreshes access tokens through the supported Supabase client behavior.
4. Management API requests send `Authorization: Bearer <Supabase access token>`.
5. Express verifies token signature, issuer, audience, expiry, and user identity before loading workspace membership.
6. The browser supplies the authenticated Supabase session to Postgres queries and Realtime subscriptions.
7. Sign-out clears the browser session, active trace state, cached tenant data, and subscriptions.

The MVP does not introduce a separate Express cookie session. Running two independent session systems would add complexity without improving the approved hybrid architecture.

## 10. Row Level Security

RLS is enabled on every browser-readable platform table.

Minimum policies:

- Active workspace members can select their workspace, membership, projects, agents, traces, and spans.
- Users can select invitations addressed to their verified normalized email.
- Browser users cannot insert, update, or delete traces, spans, or API keys directly.
- Project and workspace mutation occurs through authenticated Express endpoints.
- API-key hashes are never selectable through browser policies.
- Anonymous users cannot read any platform table.

RLS tests must include:

- Member can read a trace in their workspace.
- Member cannot read a trace in another workspace, even with its UUID.
- Removed member immediately loses trace-query and Realtime access.
- Anonymous user cannot read traces or spans.
- Browser session cannot insert or update telemetry.
- Project filters do not weaken workspace authorization.

Application authorization checks in Express do not replace these policies.

## 11. Express API

All JSON endpoints are versioned under `/v1`. Errors use a stable envelope:

```json
{
  "error": {
    "code": "forbidden",
    "message": "You do not have access to this workspace.",
    "request_id": "uuid"
  }
}
```

Validation failures return field-level details without echoing secrets.

### 11.1 Health

- `GET /health/live` — process is running
- `GET /health/ready` — required configuration and database connectivity are available

### 11.2 Workspace and membership management

- `POST /v1/workspaces`
- `GET /v1/workspaces`
- `GET /v1/workspaces/:workspaceId`
- `PATCH /v1/workspaces/:workspaceId`
- `DELETE /v1/workspaces/:workspaceId`
- `GET /v1/workspaces/:workspaceId/members`
- `PATCH /v1/workspaces/:workspaceId/members/:userId`
- `DELETE /v1/workspaces/:workspaceId/members/:userId`
- `POST /v1/workspaces/:workspaceId/invitations`
- `GET /v1/workspaces/:workspaceId/invitations`
- `DELETE /v1/workspaces/:workspaceId/invitations/:invitationId`
- `POST /v1/invitations/:token/accept`

### 11.3 Project and agent management

- `POST /v1/workspaces/:workspaceId/projects`
- `GET /v1/workspaces/:workspaceId/projects`
- `GET /v1/projects/:projectId`
- `PATCH /v1/projects/:projectId`
- `DELETE /v1/projects/:projectId`
- `POST /v1/projects/:projectId/agents`
- `GET /v1/projects/:projectId/agents`
- `GET /v1/agents/:agentId`
- `PATCH /v1/agents/:agentId`
- `DELETE /v1/agents/:agentId`

Agent deletion should archive by default when telemetry exists. Project deletion is an explicitly confirmed destructive action and cascades through keys and telemetry.

### 11.4 API-key management

- `POST /v1/projects/:projectId/api-keys`
- `GET /v1/projects/:projectId/api-keys` — metadata and prefix only
- `DELETE /v1/projects/:projectId/api-keys/:keyId` — revoke; never restore

The creation response contains the plaintext secret exactly once. Subsequent reads return only key ID, name, prefix, creator, timestamps, last use, expiry, and revocation state.

## 12. Telemetry Ingestion Contract

### 12.1 Endpoint

`POST /v1/ingest/spans`

Authentication:

```http
Authorization: Bearer obv_<prefix>_<secret>
```

The key resolves the workspace and project. The request cannot override either value.

### 12.2 Request

```json
{
  "schema_version": "1",
  "sdk": {
    "name": "obeverfy-python",
    "version": "0.2.0"
  },
  "agent_id": "uuid",
  "environment": "development",
  "sent_at": "2026-08-22T22:00:00Z",
  "events": [
    {
      "span_id": "uuid",
      "trace_id": "uuid",
      "parent_span_id": null,
      "name": "handle_claim",
      "kind": "chain",
      "status": "running",
      "input": {"args": [], "kwargs": {}},
      "output": null,
      "error": null,
      "started_at": "2026-08-22T21:59:59.900Z",
      "ended_at": null,
      "duration_ms": null,
      "attributes": {}
    }
  ]
}
```

### 12.3 Validation and semantics

- HTTPS is mandatory outside local development.
- The referenced agent must exist, be active, and belong to the key's project.
- Environment is required after SDK defaulting and is limited to a normalized, bounded string.
- A request contains at most 100 events and at most 1 MiB of uncompressed JSON.
- Event timestamps, identifier lengths, names, kinds, statuses, attributes, and JSON field sizes are bounded.
- A `running` event inserts or updates the current span state.
- A terminal `ok` or `error` event updates the same span idempotently.
- Re-delivery of the same state succeeds without duplication.
- An older event cannot overwrite a newer terminal state.
- Tenant, project, agent, and trace reassignment is rejected.
- The backend upserts the corresponding trace summary from the root span and terminal events.
- The response is successful only after Postgres accepts the batch in the MVP.

Success response:

```json
{
  "accepted": 12,
  "rejected": 0,
  "request_id": "uuid"
}
```

The API may return per-event validation errors for a partially invalid batch, but authentication, ownership, or malformed-envelope errors reject the entire request.

### 12.4 Operational controls

- Rate-limit by key prefix and project.
- Apply global request body limits before JSON processing.
- Use constant-time secret comparison.
- Throttle `last_used_at` writes rather than updating on every batch.
- Log request ID, project ID, agent ID, counts, latency, and status; never log the key or unredacted payload.
- Return `401` for missing/invalid/revoked keys, `403` for valid keys without access to the supplied agent, `413` for oversized payloads, `422` for validation errors, and `429` for rate limits.

## 13. Python SDK Changes

### 13.1 Public configuration

The SDK gains a hosted reporter configured conceptually as:

```python
import os
import obeverfy

obeverfy.init(
    api_key=os.environ["OBEVERFY_API_KEY"],
    agent_id=os.environ["OBEVERFY_AGENT_ID"],
    environment=os.getenv("OBEVERFY_ENVIRONMENT", "development"),
    endpoint=os.getenv("OBEVERFY_ENDPOINT", "https://api.obeverfy.com"),
)
```

The existing low-level reporter protocol can remain an extension point, but application developers should not need to construct a Supabase client or reporter.

### 13.2 MVP delivery behavior

- Decorated function execution remains synchronous, but telemetry network delivery occurs on a bounded background queue.
- Queueing and delivery are fail-open by default: telemetry failures do not change the decorated function's return value or exception.
- The queue is bounded; overflow drops telemetry with a local diagnostic rather than consuming unbounded memory.
- Batches contain up to 100 events and flush on size or a short time interval.
- Network calls use short connect/read timeouts and bounded exponential backoff with jitter.
- `flush(timeout=...)` allows CLI scripts, tests, and serverless handlers to wait for queued events.
- A best-effort process-exit flush is registered, but callers must not rely on it for abrupt termination.
- SDK diagnostics never include the API key or captured input/output.
- Configuration supports disabling tracing without removing decorators.

Durable disk buffering and delivery guarantees across process crashes are post-MVP enhancements.

### 13.3 Capture safety

- Apply configurable redaction before events enter the queue.
- Redact common sensitive keys by default, including authorization, cookie, password, secret, token, and API-key variants.
- Allow users to add key patterns or provide a redaction callback.
- Bound recursion depth, collection length, string length, and encoded input/output size.
- Replace truncated values with an explicit marker.
- Never call arbitrary expensive serialization hooks when a safe representation is available.

### 13.4 Compatibility

- Preserve `@traced(name=..., kind=...)` for existing applications.
- Preserve trace and parent propagation through `contextvars`.
- Keep the reporter protocol for testing and custom exporters.
- Mark `SupabaseReporter` as deprecated before removal; it must not be the documented hosted configuration.
- Async-decorator support is a separately scoped SDK enhancement unless promoted before implementation begins.

## 14. Dashboard Changes

### 14.1 New authenticated flow

1. Unauthenticated users see sign-up, sign-in, verification, and password-recovery screens.
2. A newly verified user creates a workspace during onboarding.
3. The user creates a project, explicitly creates an agent, and generates a key.
4. The dashboard displays copy-once SDK setup instructions.
5. Workspace, project, agent, and environment selectors scope trace queries.
6. The existing trace list, waterfall, and span inspector render tenant-authorized data.

### 14.2 Data access

- Management mutations call Express with the Supabase access JWT.
- Trace and span reads use authenticated Supabase queries.
- Realtime subscriptions use the authenticated Supabase session and project or trace filters.
- All query/subscription logic remains behind hooks or data-access modules.
- A workspace switch removes old subscriptions and clears trace state before loading another tenant.
- Unauthorized, expired-session, empty, loading, disconnected, and revoked-membership states are explicit.

### 14.3 API-key UX

- The secret is displayed once after creation with copy and acknowledgment actions.
- Returning to the page shows only prefix and metadata.
- Revocation requires confirmation and clearly states that deployed SDKs using the key will stop sending data.
- The UI must never place secrets in URLs, analytics, or persistent browser storage beyond the immediate creation response.

## 15. Realtime Behavior

- The trace list subscribes to changes for the selected project, additionally filtered by agent/environment when selected.
- The waterfall subscribes to spans for the selected trace.
- RLS remains authoritative even if a user guesses a project or trace ID.
- Membership removal must prevent new events from reaching the removed user's session. The client also clears active subscriptions when authorization errors occur.
- Existing reconciliation by span ID remains useful and should be retained.
- Realtime channel cleanup must continue to be safe under React Strict Mode.

If authenticated RLS behavior cannot satisfy isolation or operational requirements during verification, the fallback is an Express SSE layer. That fallback is not part of the planned MVP unless the Supabase approach fails acceptance tests.

## 16. Retention and Deletion

- Traces and spans are retained for 30 days from trace start time.
- A scheduled daily job deletes expired traces; span deletion cascades from the trace.
- The job records counts, duration, and failures without logging telemetry payloads.
- Deleting a project requires explicit confirmation and permanently deletes its agents, keys, traces, and spans.
- Deleting a workspace requires owner confirmation and cascades through all contained resources.
- Revoking an API key is immediate and permanent but does not delete existing telemetry.
- Trace export and configurable retention are deferred.

## 17. Security Requirements

- No Supabase secret credential is shipped in the Python SDK, customer application configuration, or browser bundle.
- API secrets are generated from a cryptographically secure random source and displayed once.
- Stored API-key material is one-way protected with HMAC-SHA-256 and a server-only pepper.
- Express applies secure headers, strict CORS configuration, request body limits, and production-safe error handling.
- Management and ingestion endpoints have separate authentication middleware.
- Every management action checks workspace membership and role server-side.
- Destructive and credential operations produce audit events containing actor, workspace, target, action, and timestamp.
- Logs exclude access tokens, API keys, passwords, cookies, captured inputs, and captured outputs.
- Database migrations remove the anonymous read policies from the existing schema before hosted access is enabled.
- Dependency and secret scanning are added to CI before public deployment.
- RLS and cross-tenant authorization tests are deployment blockers.

## 18. Demo Application Separation

The current insurance demo uses the same Supabase project for both Obeverfy telemetry and its own `claims` and `policies` data. Those are separate trust domains.

For the hosted architecture:

- The demo configures the Obeverfy SDK with an ingestion API key for telemetry.
- Its claim and policy storage remains demo-owned and is not accessed through the Obeverfy API.
- Hosted platform migrations do not treat `claims` or `policies` as tenant telemetry tables.
- Demo credentials and platform service credentials remain separate.

## 19. Migration Strategy

### Phase 1: Additive schema

1. Add workspace, membership, invitation, project, agent, API-key, and trace tables.
2. Add tenant columns to spans as nullable during migration.
3. Create a migration-only legacy workspace, project, and agent if prototype spans must be preserved.
4. Backfill existing spans and derive trace summaries.
5. Make tenant columns non-null after validation.
6. Add indexes, foreign keys, and uniqueness constraints.

If prototype telemetry does not need preservation, delete it and skip legacy backfill.

### Phase 2: Secure boundaries

1. Add Supabase Auth configuration and verified-email flow.
2. Add RLS policies and cross-tenant tests.
3. Remove anonymous trace and span read policies.
4. Implement Express JWT verification and authorization middleware.
5. Implement project API-key creation, hashing, lookup, and revocation.

### Phase 3: Ingestion and SDK

1. Implement validated idempotent batch ingestion.
2. Implement the HTTP reporter, background queue, retries, redaction, and `flush()`.
3. Migrate the demo from `SupabaseReporter` to the hosted SDK configuration.
4. Verify start and terminal updates appear correctly through Realtime.

### Phase 4: Authenticated dashboard

1. Add authentication and onboarding UI.
2. Add workspace, member, invitation, project, agent, and API-key management.
3. Scope trace queries and subscriptions to selected tenant resources.
4. Add session expiry, authorization failure, and workspace-switch behavior.

### Phase 5: Production hardening

1. Add scheduled retention.
2. Add rate limits, audit logs, request correlation, and operational metrics.
3. Add CI for backend, SDK, dashboard, migrations, RLS, dependency scanning, and secret scanning.
4. Deploy a staging environment and complete the end-to-end acceptance flow.

## 20. Testing Strategy

### Backend

- Unit tests for API-key parsing, hashing, revocation, JWT middleware, role checks, validation, and error envelopes
- Integration tests for management endpoints and database constraints
- Idempotency tests for repeated and out-of-order span events
- Cross-project agent rejection tests
- Batch size, payload size, rate-limit, and revoked-key tests

### Database and RLS

- Migration tests from an empty database and the prototype schema
- Positive and negative workspace membership tests
- Anonymous-access denial tests
- Realtime tenant-isolation tests with two independent users/workspaces
- Retention and cascade-deletion tests

### SDK

- Existing trace-parenting and exception behavior tests
- Background queue and batching tests with no real network
- Timeout, retry, overflow, shutdown, and `flush()` tests
- Fail-open tests proving delivery errors do not alter application behavior
- Default and custom redaction tests
- Payload truncation and serialization-edge-case tests

### Dashboard

- Authentication and email-verification states
- Workspace/project/agent selection and switching
- Key creation copy-once and revocation flows
- Tenant-scoped trace queries and subscription cleanup
- Expired session and removed-membership behavior
- Existing trace hierarchy and realtime reconciliation tests

### End-to-end release test

1. User A signs up, verifies email, and creates Workspace A.
2. User A invites User B; User B accepts and sees Workspace A.
3. User A creates a project and two agents.
4. User A creates a project API key.
5. The demo application configures the SDK with that key and one agent ID.
6. Running the demo creates a live trace visible to both members.
7. User C in Workspace C cannot query or subscribe to that trace.
8. Revoking the key causes subsequent ingestion to return `401` without breaking the demo's decorated function.
9. A replacement key restores ingestion.

## 21. Acceptance Criteria

The hosted MVP is complete when:

- No customer or browser requires a Supabase secret credential.
- Email/password registration, verification, sign-in, refresh, and sign-out work.
- Workspaces support owners, admins, members, and email invitations.
- Users can create projects, explicitly create multiple agents, and use free-form environments.
- Owners/admins can create and revoke project-scoped ingestion keys.
- The SDK sends fail-open telemetry batches through Express.
- Express validates keys, rejects cross-project agents, and writes idempotent trace/span state.
- Authenticated members see their workspace's live traces in the existing dashboard.
- Users cannot read or subscribe to another workspace's telemetry.
- Anonymous access to telemetry is disabled.
- Inputs and outputs are bounded and receive default configurable redaction.
- Thirty-day retention and confirmed project/workspace deletion are implemented.
- The complete end-to-end release test passes in staging.

## 22. Proposed Linear Work Breakdown

The existing issues `OBE-5` through `OBE-8` should not be implemented as currently written. They should be replaced or rewritten around verifiable product slices.

### Foundation

1. **Define and migrate the multi-tenant observability schema**
   - Workspaces, memberships, invitations, projects, agents, keys, traces, tenant-aware spans, indexes, and constraints
2. **Configure Supabase email/password authentication**
   - Verification, redirect configuration, session behavior, and local/staging environments
3. **Implement and test tenant RLS policies**
   - Browser reads, anonymous denial, cross-tenant denial, and Realtime verification

### Express control plane

4. **Create Express application foundation and operational middleware**
   - Configuration, request IDs, validation, errors, logging, CORS, headers, health checks, and tests
5. **Implement Supabase JWT authentication and workspace role authorization**
6. **Implement workspace membership and invitation APIs**
7. **Implement project and agent management APIs**
8. **Implement project API-key creation, hashing, listing, and revocation**
9. **Implement idempotent batch span ingestion**
10. **Add ingestion limits, rate limiting, and audit/operational logging**

### Python SDK

11. **Replace direct Supabase delivery with hosted HTTP configuration**
12. **Add bounded background batching, retry, fail-open behavior, and `flush()`**
13. **Add configurable redaction and payload limits**
14. **Migrate the demo application to project-key ingestion**

### Dashboard

15. **Add email/password authentication and verified-user routing**
16. **Add workspace onboarding, switching, member, and invitation UI**
17. **Add project, agent, and API-key management UI**
18. **Scope trace queries and Realtime subscriptions by authenticated tenant context**
19. **Add authorization/session edge states and cross-tenant frontend tests**

### Operations and release

20. **Implement 30-day telemetry retention and cascade deletion**
21. **Add CI security, migration, SDK, backend, dashboard, and RLS checks**
22. **Deploy staging and complete the multi-user end-to-end release test**

Dependencies should follow the delivery phases in Section 19. Ticket descriptions should link to this specification and carry endpoint- or feature-specific acceptance criteria from the relevant sections.

## 23. Deferred Decisions

The following decisions do not block the MVP specification:

- Production host for Express and React
- Custom domain names
- Paid-plan retention tiers and quotas
- Per-project membership
- Social authentication and enterprise identity
- Durable SDK disk queue
- Async-function decorator support
- Custom realtime service
- Trace export and deletion of individual traces

They should be revisited only when a concrete release or customer requirement needs them.
