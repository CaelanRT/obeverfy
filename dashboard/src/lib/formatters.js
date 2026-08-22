const traceTimestampFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function formatDuration(durationMs) {
  if (durationMs == null) return 'Running';

  const numericDuration = Number(durationMs);
  if (!Number.isFinite(numericDuration) || numericDuration < 0) return 'Unknown duration';
  if (numericDuration < 1000) return `${Math.round(numericDuration)} ms`;

  const seconds = numericDuration / 1000;
  return `${seconds >= 10 ? seconds.toFixed(1) : seconds.toFixed(2)} s`;
}

export function formatTimestamp(value) {
  if (!value) return 'Unknown start time';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown start time';

  return traceTimestampFormatter.format(date);
}

export function formatJson(value) {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return 'This value could not be formatted as JSON.';
  }
}
