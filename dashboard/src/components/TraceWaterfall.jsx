// Nested span tree/waterfall for one trace.
// Implemented in Task 9 of docs/plans/obeverfy-implementation-plan.md,
// realtime wiring added in Task 10.

import { useMemo } from 'react';
import { formatDuration } from '../lib/formatters';
import { buildSpanTree } from '../lib/spans';

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

function normalizeValue(value, knownValues) {
  return Object.hasOwn(knownValues, value) ? value : 'unknown';
}

function SpanBranch({ span, selectedSpanId, onSelectSpan }) {
  const kind = normalizeValue(span.kind, KIND_LABELS);
  const status = normalizeValue(span.status, STATUS_LABELS);
  const kindLabel = KIND_LABELS[kind] ?? 'Other';
  const statusLabel = STATUS_LABELS[status] ?? 'Unknown';

  return (
    <li className="span-branch">
      <button
        className="span-row"
        type="button"
        aria-current={span.span_id === selectedSpanId ? 'true' : undefined}
        aria-label={`${span.name || 'Unnamed span'}, ${kindLabel}, ${statusLabel}`}
        title={span.name || 'Unnamed span'}
        onClick={() => onSelectSpan(span.span_id)}
      >
        <span className={`kind-badge kind-${kind}`}>{kindLabel}</span>
        <span className="span-summary">
          <span className="span-name">{span.name || 'Unnamed span'}</span>
          <span className="span-row-meta">
            <span className={`span-row-status status-text-${status}`}>{statusLabel}</span>
            {span.error ? <span className="span-error-label">Error details available</span> : null}
          </span>
        </span>
        <span className="span-duration">{formatDuration(span.duration_ms)}</span>
      </button>

      {span.children.length > 0 ? (
        <ul
          className="span-children"
          aria-label={`Child spans of ${span.name || 'unnamed span'}`}
        >
          {span.children.map((child) => (
            <SpanBranch
              key={child.span_id}
              span={child}
              selectedSpanId={selectedSpanId}
              onSelectSpan={onSelectSpan}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function WaterfallSkeleton() {
  return (
    <div className="waterfall-skeleton" role="status" aria-label="Loading trace spans">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="span-skeleton-row" key={item} aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

export function TraceWaterfall({
  spans,
  isLoading,
  errorMessage,
  selectedSpanId,
  onSelectSpan,
  onRetry,
}) {
  const tree = useMemo(() => buildSpanTree(spans), [spans]);

  if (isLoading) return <WaterfallSkeleton />;

  if (errorMessage) {
    return (
      <div className="waterfall-message waterfall-error" role="alert">
        <h3>Trace could not be loaded</h3>
        <p>{errorMessage}</p>
        <button className="secondary-button" type="button" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div className="waterfall-message">
        <h3>No spans found</h3>
        <p>This trace does not contain any visible spans yet.</p>
      </div>
    );
  }

  return (
    <ul className="span-tree" aria-label="Trace span hierarchy">
      {tree.map((root) => (
        <SpanBranch
          key={root.span_id}
          span={root}
          selectedSpanId={selectedSpanId}
          onSelectSpan={onSelectSpan}
        />
      ))}
    </ul>
  );
}
