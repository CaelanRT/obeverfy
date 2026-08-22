function timestampValue(value) {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? Number.POSITIVE_INFINITY : timestamp;
}

export function sortSpansByStart(spans) {
  return [...spans].sort((left, right) => {
    const leftTimestamp = timestampValue(left.started_at);
    const rightTimestamp = timestampValue(right.started_at);
    if (leftTimestamp !== rightTimestamp) return leftTimestamp - rightTimestamp;

    return String(left.span_id).localeCompare(String(right.span_id));
  });
}

export function upsertSpan(spans, nextSpan) {
  if (!nextSpan?.span_id) return sortSpansByStart(spans);

  const existingIndex = spans.findIndex((span) => span.span_id === nextSpan.span_id);
  if (existingIndex === -1) return sortSpansByStart([...spans, nextSpan]);

  const nextSpans = [...spans];
  nextSpans[existingIndex] = nextSpan;
  return sortSpansByStart(nextSpans);
}

export function applySpanRealtimeEvent(spans, payload) {
  if (payload?.eventType === 'DELETE') {
    const deletedSpanId = payload.old?.span_id;
    return deletedSpanId
      ? sortSpansByStart(spans.filter((span) => span.span_id !== deletedSpanId))
      : sortSpansByStart(spans);
  }

  return upsertSpan(spans, payload?.new);
}

function sortTraceSummaries(traces) {
  return [...traces].sort((left, right) => {
    const leftTimestamp = timestampValue(left.started_at);
    const rightTimestamp = timestampValue(right.started_at);
    if (leftTimestamp !== rightTimestamp) return rightTimestamp - leftTimestamp;

    return String(left.trace_id).localeCompare(String(right.trace_id));
  });
}

export function reconcileTraceSummaries(traces, payload, limit = 20) {
  const previous = payload?.old;
  const next = payload?.new;

  if (payload?.eventType === 'DELETE') {
    return sortTraceSummaries(
      traces.filter((trace) => trace.span_id !== previous?.span_id),
    ).slice(0, limit);
  }

  if (!next?.span_id) return sortTraceSummaries(traces).slice(0, limit);

  const withoutCurrentSpan = traces.filter((trace) => trace.span_id !== next.span_id);

  if (next.parent_span_id !== null) {
    return sortTraceSummaries(withoutCurrentSpan).slice(0, limit);
  }

  const withoutCurrentTrace = withoutCurrentSpan.filter(
    (trace) => trace.trace_id !== next.trace_id,
  );

  return sortTraceSummaries([
    ...withoutCurrentTrace,
    {
      span_id: next.span_id,
      trace_id: next.trace_id,
      parent_span_id: next.parent_span_id,
      name: next.name,
      status: next.status,
      started_at: next.started_at,
      duration_ms: next.duration_ms,
    },
  ]).slice(0, limit);
}

function hasAncestryCycle(span, spansById) {
  const visited = new Set([span.span_id]);
  let parentId = span.parent_span_id;

  while (parentId && spansById.has(parentId)) {
    if (visited.has(parentId)) return true;

    visited.add(parentId);
    parentId = spansById.get(parentId).parent_span_id;
  }

  return false;
}

export function buildSpanTree(spans) {
  const sortedSpans = sortSpansByStart(spans);
  const spansById = new Map(
    sortedSpans.map((span) => [span.span_id, { ...span, children: [] }]),
  );
  const roots = [];

  for (const span of spansById.values()) {
    const parent = span.parent_span_id ? spansById.get(span.parent_span_id) : null;

    if (parent && !hasAncestryCycle(span, spansById)) {
      parent.children.push(span);
    } else {
      roots.push(span);
    }
  }

  for (const span of spansById.values()) {
    span.children = sortSpansByStart(span.children);
  }

  return sortSpansByStart(roots);
}
