import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDuration, formatJson, formatTimestamp } from '../src/lib/formatters.js';

test('formats running, millisecond, second, and invalid durations', () => {
  assert.equal(formatDuration(null), 'Running');
  assert.equal(formatDuration(250), '250 ms');
  assert.equal(formatDuration(1250), '1.25 s');
  assert.equal(formatDuration(-1), 'Unknown duration');
});

test('handles missing and invalid timestamps', () => {
  assert.equal(formatTimestamp(null), 'Unknown start time');
  assert.equal(formatTimestamp('not-a-date'), 'Unknown start time');
});

test('formats JSON and safely handles circular values', () => {
  assert.equal(formatJson({ status: 'ok' }), '{\n  "status": "ok"\n}');

  const circular = {};
  circular.self = circular;
  assert.equal(formatJson(circular), 'This value could not be formatted as JSON.');
});
