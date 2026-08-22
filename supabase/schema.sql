-- Obeverfy schema. Run this in the Supabase project's SQL Editor.
-- See docs/plans/obeverfy-implementation-plan.md, Task 1.

create table if not exists spans (
  span_id text primary key,
  trace_id text not null,
  parent_span_id text references spans(span_id),
  name text not null,
  kind text not null check (kind in ('chain', 'llm', 'tool')),
  input jsonb,
  output jsonb,
  status text not null default 'running' check (status in ('running', 'ok', 'error')),
  error text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_ms integer
);

create index if not exists spans_trace_id_idx on spans (trace_id);
create index if not exists spans_parent_span_id_idx on spans (parent_span_id);

create table if not exists policies (
  category text primary key,
  policy_text text not null,
  threshold_amount numeric not null
);

create table if not exists claims (
  claim_id text primary key,
  category text not null,
  description text,
  amount numeric,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

alter table spans enable row level security;
alter table policies enable row level security;
alter table claims enable row level security;

-- Hackathon-scope policy: the anon key (used by the dashboard, in the
-- browser) can only read. All writes go through the Python SDK/demo app
-- using the service_role key, which bypasses RLS entirely.
create policy "anon can read spans" on spans for select using (true);
create policy "anon can read policies" on policies for select using (true);
create policy "anon can read claims" on claims for select using (true);

-- Required for the dashboard to receive live postgres_changes events.
alter publication supabase_realtime add table spans;
