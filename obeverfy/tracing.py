"""Span model, Reporter protocol, and the @traced decorator.

Implemented in Task 2 of docs/plans/obeverfy-implementation-plan.md.
"""
from __future__ import annotations

import contextvars
import functools
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Literal, Optional, Protocol

SpanKind = Literal["chain", "llm", "tool"]

_current_span_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_span_id", default=None
)
_current_trace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_trace_id", default=None
)


@dataclass
class Span:
    span_id: str
    trace_id: str
    parent_span_id: Optional[str]
    name: str
    kind: SpanKind
    input: Any
    output: Any = None
    status: str = "running"
    error: Optional[str] = None
    started_at: float = field(default_factory=time.time)
    ended_at: Optional[float] = None

    def duration_ms(self) -> Optional[int]:
        if self.ended_at is None:
            return None
        return round((self.ended_at - self.started_at) * 1000)


class Reporter(Protocol):
    def on_span_start(self, span: Span) -> None: ...
    def on_span_end(self, span: Span) -> None: ...


_reporter: Optional[Reporter] = None


def configure(reporter: Optional[Reporter]) -> None:
    global _reporter
    _reporter = reporter


def new_trace_id() -> str:
    return str(uuid.uuid4())


def _safe_repr(value: Any) -> Any:
    """Best-effort JSON-safe conversion for span input/output capture."""
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    if isinstance(value, (list, tuple)):
        return [_safe_repr(v) for v in value]
    if isinstance(value, dict):
        return {str(k): _safe_repr(v) for k, v in value.items()}
    return repr(value)


def traced(name: Optional[str] = None, kind: SpanKind = "chain") -> Callable:
    def decorator(fn: Callable) -> Callable:
        span_name = name or fn.__name__

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            trace_id = _current_trace_id.get()
            if trace_id is None:
                trace_id = new_trace_id()

            parent_span_id = _current_span_id.get()
            span_id = str(uuid.uuid4())

            span = Span(
                span_id=span_id,
                trace_id=trace_id,
                parent_span_id=parent_span_id,
                name=span_name,
                kind=kind,
                input={"args": _safe_repr(args), "kwargs": _safe_repr(kwargs)},
            )
            if _reporter:
                _reporter.on_span_start(span)

            trace_token = _current_trace_id.set(trace_id)
            span_token = _current_span_id.set(span_id)
            try:
                result = fn(*args, **kwargs)
                span.output = _safe_repr(result)
                span.status = "ok"
                return result
            except Exception as exc:
                span.status = "error"
                span.error = str(exc)
                raise
            finally:
                span.ended_at = time.time()
                if _reporter:
                    _reporter.on_span_end(span)
                _current_span_id.reset(span_token)
                _current_trace_id.reset(trace_token)

        return wrapper

    return decorator
