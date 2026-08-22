"""Tests for obeverfy.tracing: root/nested spans, sibling parenting, error status.

Implemented in Task 2 of docs/plans/obeverfy-implementation-plan.md.
"""
import pytest

from obeverfy.tracing import traced


def test_traced_function_returns_its_normal_result(fake_reporter):
    @traced(kind="tool")
    def add(a, b):
        return a + b

    assert add(2, 3) == 5


def test_root_span_has_no_parent_and_gets_a_trace_id(fake_reporter):
    @traced(kind="chain", name="root")
    def root():
        return "done"

    root()

    assert len(fake_reporter.ended) == 1
    span = fake_reporter.ended[0]
    assert span.parent_span_id is None
    assert span.trace_id is not None
    assert span.status == "ok"


def test_nested_traced_calls_share_a_trace_id_and_link_parent_child(fake_reporter):
    @traced(kind="tool", name="child")
    def child():
        return "child-result"

    @traced(kind="chain", name="parent")
    def parent():
        return child()

    parent()

    assert len(fake_reporter.ended) == 2
    child_span = next(s for s in fake_reporter.ended if s.name == "child")
    parent_span = next(s for s in fake_reporter.ended if s.name == "parent")
    assert child_span.trace_id == parent_span.trace_id
    assert child_span.parent_span_id == parent_span.span_id


def test_sibling_calls_after_a_nested_call_return_to_the_correct_parent(fake_reporter):
    """Regression guard for the contextvar stack: if reset() were wrong,
    step_b would incorrectly end up parented under step_a instead of root."""

    @traced(kind="tool", name="step_a")
    def step_a():
        return "a"

    @traced(kind="tool", name="step_b")
    def step_b():
        return "b"

    @traced(kind="chain", name="root")
    def root():
        step_a()
        step_b()

    root()

    root_span = next(s for s in fake_reporter.ended if s.name == "root")
    step_a_span = next(s for s in fake_reporter.ended if s.name == "step_a")
    step_b_span = next(s for s in fake_reporter.ended if s.name == "step_b")
    assert step_a_span.parent_span_id == root_span.span_id
    assert step_b_span.parent_span_id == root_span.span_id


def test_an_exception_marks_the_span_as_error_and_still_propagates(fake_reporter):
    @traced(kind="tool", name="boom")
    def boom():
        raise ValueError("kaboom")

    with pytest.raises(ValueError):
        boom()

    span = fake_reporter.ended[0]
    assert span.status == "error"
    assert "kaboom" in span.error


def test_span_start_is_reported_before_the_function_returns(fake_reporter):
    @traced(kind="tool", name="slow_step")
    def slow_step():
        assert len(fake_reporter.started) == 1
        assert len(fake_reporter.ended) == 0
        return "ok"

    slow_step()
