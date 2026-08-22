"""SupabaseReporter: wires the @traced decorator's spans into Supabase.

Implemented in Task 3 of docs/plans/obeverfy-implementation-plan.md.
"""
from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Optional

from supabase import Client, create_client

from .tracing import Span


def _iso(ts: Optional[float]) -> Optional[str]:
    if ts is None:
        return None
    return datetime.fromtimestamp(ts, tz=timezone.utc).isoformat()


class SupabaseReporter:
    def __init__(self, client: Optional[Client] = None):
        self.client = client or create_client(
            os.environ["SUPABASE_URL"],
            os.environ["SUPABASE_SECRET_KEY"],
        )

    def _row(self, span: Span) -> dict:
        return {
            "span_id": span.span_id,
            "trace_id": span.trace_id,
            "parent_span_id": span.parent_span_id,
            "name": span.name,
            "kind": span.kind,
            "input": span.input,
            "output": span.output,
            "status": span.status,
            "error": span.error,
            "started_at": _iso(span.started_at),
            "ended_at": _iso(span.ended_at),
            "duration_ms": span.duration_ms(),
        }

    def on_span_start(self, span: Span) -> None:
        self.client.table("spans").upsert(self._row(span)).execute()

    def on_span_end(self, span: Span) -> None:
        self.client.table("spans").upsert(self._row(span)).execute()
