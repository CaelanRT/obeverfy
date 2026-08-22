import { useCallback, useEffect, useRef, useState } from 'react';
import { applySpanRealtimeEvent, sortSpansByStart } from '../lib/spans';
import { formatSupabaseError, supabase } from '../supabaseClient';

export function useTraceSpans(traceId) {
  const [spans, setSpans] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [connectionStatus, setConnectionStatus] = useState('idle');
  const requestId = useRef(0);
  const realtimeVersion = useRef(0);
  const realtimeChanges = useRef([]);

  const loadSpans = useCallback(async (activeTraceId) => {
    if (!activeTraceId) {
      setSpans([]);
      setErrorMessage('');
      setIsLoading(false);
      return;
    }

    const activeRequest = requestId.current + 1;
    const versionAtRequestStart = realtimeVersion.current;
    requestId.current = activeRequest;
    setErrorMessage('');
    setIsLoading(true);

    const { data, error } = await supabase
      .from('spans')
      .select('*')
      .eq('trace_id', activeTraceId)
      .order('started_at', { ascending: true });

    if (requestId.current !== activeRequest) return;

    if (error) {
      setErrorMessage(formatSupabaseError(error, 'Check the Supabase connection and try again.'));
      setIsLoading(false);
      return;
    }

    const changesDuringRequest = realtimeChanges.current.filter(
      (change) => change.version > versionAtRequestStart,
    );
    const reconciledSpans = changesDuringRequest.reduce(
      (currentSpans, change) => applySpanRealtimeEvent(currentSpans, change.payload),
      sortSpansByStart(data ?? []),
    );

    setSpans(reconciledSpans);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    requestId.current += 1;
    realtimeVersion.current = 0;
    realtimeChanges.current = [];
    setSpans([]);
    setErrorMessage('');

    if (!traceId) {
      setIsLoading(false);
      setConnectionStatus('idle');
      return undefined;
    }

    let disposed = false;
    setIsLoading(true);
    setConnectionStatus('connecting');

    const channel = supabase
      .channel(`spans-trace-${traceId}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'spans',
          filter: `trace_id=eq.${traceId}`,
        },
        (payload) => {
          if (disposed) return;

          const changedTraceId = payload.new?.trace_id;
          if (changedTraceId && changedTraceId !== traceId) return;

          realtimeVersion.current += 1;
          realtimeChanges.current = [
            ...realtimeChanges.current.slice(-1999),
            { version: realtimeVersion.current, payload },
          ];
          setSpans((currentSpans) => applySpanRealtimeEvent(currentSpans, payload));
        },
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === 'SUBSCRIBED') {
          setConnectionStatus('live');
          loadSpans(traceId);
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          setConnectionStatus('reconnecting');
        } else if (status === 'CLOSED') {
          setConnectionStatus('offline');
        }
      });

    loadSpans(traceId);

    return () => {
      disposed = true;
      requestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [loadSpans, traceId]);

  return {
    spans,
    isLoading,
    errorMessage,
    connectionStatus,
    reload: () => loadSpans(traceId),
  };
}
