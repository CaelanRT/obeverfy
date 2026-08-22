// Input/output detail panel for a selected span.
// Implemented in Task 9 of docs/plans/obeverfy-implementation-plan.md.

import { formatDuration, formatJson, formatTimestamp } from '../lib/formatters';

const KIND_LABELS = {
  chain: 'Chain',
  llm: 'LLM',
  tool: 'Tool',
};

const STATUS_LABELS = {
  error: 'Failed',
  ok: 'Completed',
  running: 'Running',
};

function JsonSection({ title, value }) {
  return (
    <section className="json-section">
      <h3>{title}</h3>
      {value == null ? (
        <p className="json-empty">No {title.toLowerCase()} was recorded.</p>
      ) : (
        <pre>
          <code>{formatJson(value)}</code>
        </pre>
      )}
    </section>
  );
}

export function SpanDetail({ span }) {
  if (!span) {
    return (
      <div className="span-detail-empty">
        <h3>Select a span</h3>
        <p>Choose an operation in the trace tree to inspect its execution data.</p>
      </div>
    );
  }

  const kind = Object.hasOwn(KIND_LABELS, span.kind) ? span.kind : 'unknown';
  const status = Object.hasOwn(STATUS_LABELS, span.status) ? span.status : 'unknown';

  return (
    <article className="span-detail" aria-labelledby="span-detail-title">
      <header className="span-detail-header">
        <div className="span-detail-badges">
          <span className={`kind-badge kind-${kind}`}>{KIND_LABELS[kind] ?? 'Other'}</span>
          <span className={`detail-status status-text-${status}`} aria-live="polite">
            <span className={`status-dot status-${status}`} aria-hidden="true" />
            {STATUS_LABELS[status] ?? 'Unknown'}
          </span>
        </div>
        <h2 id="span-detail-title">{span.name || 'Unnamed span'}</h2>
      </header>

      {span.error ? (
        <section className="span-error" aria-labelledby="span-error-title" role="alert">
          <h3 id="span-error-title">Execution error</h3>
          <p>{span.error}</p>
        </section>
      ) : null}

      <dl className="span-metadata">
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(span.duration_ms)}</dd>
        </div>
        <div>
          <dt>Started</dt>
          <dd>{formatTimestamp(span.started_at)}</dd>
        </div>
        <div>
          <dt>Ended</dt>
          <dd>{span.ended_at ? formatTimestamp(span.ended_at) : 'Still running'}</dd>
        </div>
        <div>
          <dt>Span ID</dt>
          <dd><code>{span.span_id}</code></dd>
        </div>
        <div>
          <dt>Parent span</dt>
          <dd>
            {span.parent_span_id ? <code>{span.parent_span_id}</code> : 'Root span'}
          </dd>
        </div>
        <div>
          <dt>Trace ID</dt>
          <dd><code>{span.trace_id}</code></dd>
        </div>
      </dl>

      <div className="span-payloads">
        <JsonSection title="Input" value={span.input} />
        <JsonSection title="Output" value={span.output} />
      </div>
    </article>
  );
}
