"""Tests for obeverfy.client: SupabaseReporter upserts on start/end.

Implemented in Task 3 of docs/plans/obeverfy-implementation-plan.md.
"""
import time
from unittest.mock import MagicMock

from obeverfy.client import SupabaseReporter
from obeverfy.tracing import Span


def _make_span() -> Span:
    return Span(
        span_id="s1",
        trace_id="t1",
        parent_span_id=None,
        name="step",
        kind="tool",
        input={"a": 1},
    )


def test_on_span_start_upserts_a_running_row():
    mock_client = MagicMock()
    reporter = SupabaseReporter(client=mock_client)

    reporter.on_span_start(_make_span())

    mock_client.table.assert_called_with("spans")
    payload = mock_client.table.return_value.upsert.call_args[0][0]
    assert payload["span_id"] == "s1"
    assert payload["status"] == "running"
    assert payload["ended_at"] is None


def test_on_span_end_upserts_output_status_and_duration():
    mock_client = MagicMock()
    reporter = SupabaseReporter(client=mock_client)

    span = _make_span()
    span.output = {"result": "done"}
    span.status = "ok"
    span.ended_at = span.started_at + 0.25

    reporter.on_span_end(span)

    payload = mock_client.table.return_value.upsert.call_args[0][0]
    assert payload["status"] == "ok"
    assert payload["output"] == {"result": "done"}
    assert payload["duration_ms"] == 250


def test_on_span_end_captures_the_error_message_on_failure():
    mock_client = MagicMock()
    reporter = SupabaseReporter(client=mock_client)

    span = _make_span()
    span.status = "error"
    span.error = "kaboom"
    span.ended_at = span.started_at + 0.01

    reporter.on_span_end(span)

    payload = mock_client.table.return_value.upsert.call_args[0][0]
    assert payload["status"] == "error"
    assert payload["error"] == "kaboom"
