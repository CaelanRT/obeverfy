"""The multi-step claim-handling pipeline: handle_claim()."""
from __future__ import annotations

from .llm import call_llm, extract_text
from .tools import TOOL_DEFINITIONS, TOOL_IMPLEMENTATIONS, retrieve_claim_history, retrieve_policy
from obeverfy.tracing import traced


@traced(kind="llm")
def classify_claim(message: str) -> str:
    response = call_llm(
        [
            {
                "role": "system",
                "content": "Classify the insurance claim category as 'auto' or 'water'. Reply with just the category word.",
            },
            {"role": "user", "content": message},
        ]
    )
    return extract_text(response["raw"]).strip().lower()


@traced(kind="llm")
def decide(message: str, policy: dict, history: list[dict]) -> dict:
    return call_llm(
        messages=[
            {"role": "system", "content": policy["policy_text"]},
            {"role": "user", "content": f"Claim history: {history}\n\nClaim: {message}"},
        ],
        tools=TOOL_DEFINITIONS,
    )


@traced(kind="chain", name="handle_claim")
def handle_claim(claim_id: str, message: str) -> dict:
    category = classify_claim(message)
    policy = retrieve_policy(category)
    history = retrieve_claim_history(category)
    response = decide(message, policy, history)

    tool_call = response.get("tool_call")
    if not tool_call:
        return {"status": "no_action"}

    tool_name = tool_call["name"]
    args = {**tool_call["args"], "claim_id": claim_id}
    result = TOOL_IMPLEMENTATIONS[tool_name](**args)
    return {"status": "ok", "tool_name": tool_name, "result": result}
