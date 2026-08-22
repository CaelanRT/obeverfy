import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applySpanRealtimeEvent,
  buildSpanTree,
  reconcileTraceSummaries,
  sortSpansByStart,
} from '../src/lib/spans.js';

const root = {
  span_id: 'root',
  trace_id: 'trace-1',
  parent_span_id: null,
  name: 'handle_claim',
  status: 'running',
  started_at: '2026-01-01T00:00:00Z',
  duration_ms: null,
};

const child = {
  ...root,
  span_id: 'child',
  parent_span_id: 'root',
  name: 'retrieve_policy',
  started_at: '2026-01-01T00:00:01Z',
};

test('sorts spans chronologically with deterministic invalid-date ordering', () => {
  const sorted = sortSpansByStart([
    { ...child, span_id: 'invalid-b', started_at: 'invalid' },
    child,
    root,
    { ...child, span_id: 'invalid-a', started_at: 'invalid' },
  ]);

  assert.deepEqual(sorted.map((span) => span.span_id), [
    'root',
    'child',
    'invalid-a',
    'invalid-b',
  ]);
});

test('builds a tree while keeping orphaned and cyclic spans visible', () => {
  const orphan = { ...child, span_id: 'orphan', parent_span_id: 'missing' };
  const cycleA = { ...child, span_id: 'cycle-a', parent_span_id: 'cycle-b' };
  const cycleB = { ...child, span_id: 'cycle-b', parent_span_id: 'cycle-a' };
  const tree = buildSpanTree([child, cycleB, root, orphan, cycleA]);

  assert.equal(tree.find((span) => span.span_id === 'root').children[0].span_id, 'child');
  assert.ok(tree.some((span) => span.span_id === 'orphan'));
  assert.ok(tree.some((span) => span.span_id === 'cycle-a'));
  assert.ok(tree.some((span) => span.span_id === 'cycle-b'));
});

test('reconciles span inserts, updates, and deletes without duplicates', () => {
  let spans = applySpanRealtimeEvent([], { eventType: 'INSERT', new: child, old: {} });
  spans = applySpanRealtimeEvent(spans, {
    eventType: 'UPDATE',
    new: { ...child, status: 'ok', duration_ms: 90 },
    old: { span_id: child.span_id },
  });

  assert.equal(spans.length, 1);
  assert.equal(spans[0].status, 'ok');

  spans = applySpanRealtimeEvent(spans, {
    eventType: 'DELETE',
    new: {},
    old: { span_id: child.span_id },
  });
  assert.deepEqual(spans, []);
});

test('keeps a root trace when its child changes and updates the root in place', () => {
  let traces = reconcileTraceSummaries([], {
    eventType: 'INSERT',
    new: root,
    old: {},
  });
  traces = reconcileTraceSummaries(traces, {
    eventType: 'INSERT',
    new: child,
    old: {},
  });

  assert.equal(traces.length, 1);
  assert.equal(traces[0].span_id, root.span_id);

  traces = reconcileTraceSummaries(traces, {
    eventType: 'UPDATE',
    new: { ...root, status: 'ok', duration_ms: 200 },
    old: { span_id: root.span_id },
  });

  assert.equal(traces.length, 1);
  assert.equal(traces[0].duration_ms, 200);
});
