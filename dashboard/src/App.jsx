// Trace list + waterfall + span detail, wired together across Tasks 8-10 of
// docs/plans/obeverfy-implementation-plan.md.

import { useMemo, useState } from 'react';
import { SpanDetail } from './components/SpanDetail';
import { RealtimeIndicator } from './components/RealtimeIndicator';
import { TraceList } from './components/TraceList';
import { TraceWaterfall } from './components/TraceWaterfall';
import { useTraceSpans } from './hooks/useTraceSpans';
import { supabaseConfiguration } from './supabaseClient';

function ConfigurationError({ issues }) {
  return (
    <main className="setup-state" aria-labelledby="configuration-error-title">
      <section className="setup-panel" role="alert">
        <p className="setup-product">Obeverfy</p>
        <h1 id="configuration-error-title">Dashboard setup required</h1>
        <p>
          Update <code>dashboard/.env</code> and restart the Vite development server.
        </p>
        <ul>
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
        <p className="setup-note">
          Use only the browser-safe Supabase publishable key. Never add the secret
          key to this file.
        </p>
      </section>
    </main>
  );
}

export function App() {
  const [selection, setSelection] = useState({ traceId: null, spanId: null });
  const { spans, isLoading, errorMessage, connectionStatus, reload } = useTraceSpans(
    selection.traceId,
  );
  const selectedSpan = useMemo(
    () => spans.find((span) => span.span_id === selection.spanId) ?? null,
    [selection.spanId, spans],
  );

  function selectTrace(traceId) {
    setSelection({ traceId, spanId: null });
  }

  function selectSpan(spanId) {
    setSelection((current) => ({ ...current, spanId }));
  }

  if (!supabaseConfiguration.isValid) {
    return <ConfigurationError issues={supabaseConfiguration.issues} />;
  }

  return (
    <>
      <a className="skip-link" href="#trace-workspace">Skip to trace workspace</a>
      <div className="app-shell">
        <aside className="trace-sidebar" aria-labelledby="recent-traces-title">
        <header className="sidebar-header">
          <div className="product-mark" aria-hidden="true">O</div>
          <div>
            <p className="product-name">Obeverfy</p>
            <p className="product-description">Agent observability</p>
          </div>
        </header>

        <div className="trace-list-heading">
          <h1 id="recent-traces-title">Recent traces</h1>
          <p>The latest agent executions from Supabase.</p>
        </div>

        <nav className="trace-list-region" aria-label="Trace history">
          <TraceList
            selectedTraceId={selection.traceId}
            onSelectTrace={selectTrace}
          />
        </nav>
        </aside>

        <main
          id="trace-workspace"
          className={`trace-workspace ${selection.traceId ? 'trace-workspace-active' : ''}`}
          tabIndex={-1}
        >
        {selection.traceId ? (
          <section className="trace-explorer" aria-labelledby="selected-trace-title">
            <header className="trace-explorer-header">
              <div>
                <h2 id="selected-trace-title">Execution trace</h2>
                <p><code>{selection.traceId}</code></p>
              </div>
              <div className="trace-explorer-status">
                <RealtimeIndicator status={connectionStatus} />
                <p className="trace-span-count" aria-live="polite">
                  {isLoading
                    ? 'Loading spans…'
                    : `${spans.length} ${spans.length === 1 ? 'span' : 'spans'}`}
                </p>
              </div>
            </header>

            <div className="trace-explorer-body">
              <section
                className="trace-tree-panel"
                aria-labelledby="trace-tree-title"
                aria-busy={isLoading}
              >
                <header className="panel-heading">
                  <h2 id="trace-tree-title">Span hierarchy</h2>
                  <p>Operations are ordered by start time.</p>
                </header>
                <div className="trace-tree-content">
                  <TraceWaterfall
                    spans={spans}
                    isLoading={isLoading}
                    errorMessage={errorMessage}
                    selectedSpanId={selection.spanId}
                    onSelectSpan={selectSpan}
                    onRetry={reload}
                  />
                </div>
              </section>

              <section className="span-inspector-panel" aria-label="Selected span inspector">
                <SpanDetail span={selectedSpan} />
              </section>
            </div>
          </section>
        ) : (
          <section className="workspace-state" aria-labelledby="empty-workspace-title">
            <div className="workspace-symbol" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <h2 id="empty-workspace-title">Select a trace</h2>
            <p>Choose a recent execution to inspect its spans, timing, input, and output.</p>
          </section>
        )}
        </main>
      </div>
    </>
  );
}
