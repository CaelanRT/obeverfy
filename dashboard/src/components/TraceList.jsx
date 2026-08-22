// Recent traces list, backed directly by Supabase (no custom backend).
// Implemented in Task 8 of docs/plans/obeverfy-implementation-plan.md,
// realtime wiring added in Task 10.

import { useCallback, useEffect, useRef, useState } from 'react';
import { reconcileTraceSummaries } from '../lib/spans';
import { formatDuration, formatTimestamp } from '../lib/formatters';
import { formatSupabaseError, supabase } from '../supabaseClient';
import { RealtimeIndicator } from './RealtimeIndicator';

const STATUS_LABELS = {
  error: 'Failed',
  ok: 'Completed',
  running: 'Running',
};

function TraceListSkeleton() {
  return (
    <div
      className="trace-list-skeleton"
      role="status"
      aria-label="Loading recent traces"
      aria-live="polite"
    >
      {[0, 1, 2, 3].map((item) => (
        <div className="trace-skeleton-row" key={item} aria-hidden="true">
          <span className="trace-skeleton-dot" />
          <span className="trace-skeleton-lines">
            <span />
            <span />
          </span>
        </div>
      ))}
    </div>
  );
}

function TraceListEmpty() {
  return (
    <div className="trace-list-message">
      <h3>No traces yet</h3>
      <p>Run the demo agent to see its first execution appear here.</p>
    </div>
  );
}

function TraceListError({ message, isRetrying, onRetry }) {
  return (
    <div className="trace-list-message trace-list-error" role="alert">
      <h3>Traces could not be loaded</h3>
      <p>{message}</p>
      <button
        className="secondary-button"
        type="button"
        onClick={onRetry}
        disabled={isRetrying}
      >
        {isRetrying ? 'Retrying…' : 'Try again'}
      </button>
    </div>
  );
}

function normalizeStatus(status) {
  return Object.hasOwn(STATUS_LABELS, status) ? status : 'unknown';
}

export function TraceList({ selectedTraceId, onSelectTrace }) {
  const [traces, setTraces] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('connecting');
  const requestId = useRef(0);
  const realtimeVersion = useRef(0);
  const realtimeChanges = useRef([]);

  const loadTraces = useCallback(async () => {
    const activeRequest = requestId.current + 1;
    const versionAtRequestStart = realtimeVersion.current;
    requestId.current = activeRequest;
    setIsLoading(true);

    const { data, error } = await supabase
      .from('spans')
      .select('span_id, trace_id, parent_span_id, name, status, started_at, duration_ms')
      .is('parent_span_id', null)
      .order('started_at', { ascending: false })
      .limit(20);

    if (requestId.current !== activeRequest) return;

    if (error) {
      setErrorMessage(formatSupabaseError(error, 'Check the Supabase connection and try again.'));
      setIsLoading(false);
      return;
    }

    const changesDuringRequest = realtimeChanges.current.filter(
      (change) => change.version > versionAtRequestStart,
    );
    const reconciledTraces = changesDuringRequest.reduce(
      (currentTraces, change) => reconcileTraceSummaries(currentTraces, change.payload),
      data ?? [],
    );

    setTraces(reconciledTraces);
    setErrorMessage('');
    setIsLoading(false);
  }, []);

  useEffect(() => {
    let disposed = false;
    setConnectionStatus('connecting');

    const channel = supabase
      .channel(`spans-roots-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'spans' },
        (payload) => {
          if (disposed) return;

          realtimeVersion.current += 1;
          realtimeChanges.current = [
            ...realtimeChanges.current.slice(-1999),
            { version: realtimeVersion.current, payload },
          ];
          setTraces((currentTraces) => reconcileTraceSummaries(currentTraces, payload));
        },
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === 'SUBSCRIBED') {
          setConnectionStatus('live');
          loadTraces();
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('reconnecting');
        } else if (status === 'CLOSED') {
          setConnectionStatus('offline');
        }
      });

    loadTraces();

    return () => {
      disposed = true;
      requestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [loadTraces]);

  let content;

  if (isLoading && traces.length === 0 && !errorMessage) {
    content = <TraceListSkeleton />;
  } else if (errorMessage) {
    content = (
      <TraceListError
        message={errorMessage}
        isRetrying={isLoading}
        onRetry={loadTraces}
      />
    );
  } else if (traces.length === 0) {
    content = <TraceListEmpty />;
  } else {
    content = (
      <ul className="trace-list" aria-label="Recent traces">
        {traces.map((trace) => {
          const status = normalizeStatus(trace.status);
          const statusLabel = STATUS_LABELS[status] ?? 'Unknown status';
          const isSelected = trace.trace_id === selectedTraceId;

          return (
            <li key={trace.trace_id}>
              <button
                className="trace-list-item"
                type="button"
                aria-current={isSelected ? 'true' : undefined}
                onClick={() => onSelectTrace(trace.trace_id)}
              >
                <span className={`status-dot status-${status}`} aria-hidden="true" />
                <span className="trace-summary">
                  <span className="trace-title-row">
                    <span className="trace-name">{trace.name || 'Unnamed trace'}</span>
                    <span className={`trace-status status-text-${status}`}>{statusLabel}</span>
                  </span>
                  <span className="trace-meta">
                    <time dateTime={trace.started_at}>{formatTimestamp(trace.started_at)}</time>
                    <span aria-hidden="true">·</span>
                    <span>{formatDuration(trace.duration_ms)}</span>
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    );
  }

  return (
    <div className="trace-list-container" aria-busy={isLoading}>
      <div className="trace-list-connection">
        <RealtimeIndicator status={connectionStatus} />
      </div>
      {content}
    </div>
  );
}
