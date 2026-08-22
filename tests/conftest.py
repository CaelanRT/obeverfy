"""FakeReporter fixture for tracing tests, so tests never need real Supabase.

Implemented in Task 2 of docs/plans/obeverfy-implementation-plan.md.
"""
import pytest

from obeverfy import tracing


class FakeReporter:
    def __init__(self):
        self.started = []
        self.ended = []

    def on_span_start(self, span):
        self.started.append(span)

    def on_span_end(self, span):
        self.ended.append(span)


@pytest.fixture
def fake_reporter():
    reporter = FakeReporter()
    tracing.configure(reporter)
    yield reporter
    tracing.configure(None)
