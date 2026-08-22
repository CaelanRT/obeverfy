"""Claim tools: retrieve_policy, retrieve_claim_history, approve_claim, escalate_claim,
plus the OpenAI tool-calling schema (TOOL_DEFINITIONS)."""
from __future__ import annotations

from typing import Any

from .db import get_client
from obeverfy.tracing import traced

TOOL_DEFINITIONS: list[dict[str, Any]] = [
    {
        "type": "function",
        "name": "approve_claim",
        "description": "Approve an insurance claim for payout.",
        "parameters": {
            "type": "object",
            "properties": {"claim_id": {"type": "string"}, "amount": {"type": "number"}},
            "required": ["claim_id", "amount"],
        },
    },
    {
        "type": "function",
        "name": "escalate_claim",
        "description": "Escalate an insurance claim to a human adjuster for review.",
        "parameters": {
            "type": "object",
            "properties": {
                "claim_id": {"type": "string"},
                "amount": {"type": "number"},
                "reason": {"type": "string"},
            },
            "required": ["claim_id", "amount", "reason"],
        },
    },
]


@traced(kind="tool")
def retrieve_policy(category: str) -> dict:
    client = get_client()
    result = client.table("policies").select("*").eq("category", category).single().execute()
    return result.data


@traced(kind="tool")
def retrieve_claim_history(category: str, limit: int = 3) -> list[dict]:
    client = get_client()
    result = (
        client.table("claims")
        .select("*")
        .eq("category", category)
        .order("created_at", desc=True)
        .limit(limit)
        .execute()
    )
    return result.data


@traced(kind="tool")
def approve_claim(claim_id: str, amount: float) -> dict:
    client = get_client()
    result = client.table("claims").update({"status": "approved", "amount": amount}).eq("claim_id", claim_id).execute()
    return result.data[0] if result.data else {}


@traced(kind="tool")
def escalate_claim(claim_id: str, amount: float, reason: str) -> dict:
    client = get_client()
    result = client.table("claims").update({"status": "escalated", "amount": amount}).eq("claim_id", claim_id).execute()
    return result.data[0] if result.data else {}


TOOL_IMPLEMENTATIONS = {"approve_claim": approve_claim, "escalate_claim": escalate_claim}
