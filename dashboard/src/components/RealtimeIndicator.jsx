const STATUS_LABELS = {
  connecting: 'Connecting',
  idle: 'Idle',
  live: 'Live',
  offline: 'Offline',
  reconnecting: 'Reconnecting',
};

export function RealtimeIndicator({ status }) {
  const normalizedStatus = Object.hasOwn(STATUS_LABELS, status) ? status : 'offline';

  return (
    <span
      className={`realtime-indicator realtime-${normalizedStatus}`}
      role="status"
      aria-live="polite"
    >
      <span className="realtime-dot" aria-hidden="true" />
      {STATUS_LABELS[normalizedStatus]}
    </span>
  );
}
