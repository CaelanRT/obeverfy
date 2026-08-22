"""OpenAI Responses API helper (call_llm, extract_text)."""
from __future__ import annotations

import json
import os
from typing import Any, Optional
from urllib.request import Request, urlopen

from obeverfy.tracing import traced


def _parse_tool_call(response_json: dict) -> Optional[dict]:
    for item in response_json.get("output", []):
        if item.get("type") == "function_call":
            return {"name": item["name"], "args": json.loads(item.get("arguments") or "{}")}
    return None


def extract_text(response_json: dict) -> str:
    for item in response_json.get("output", []):
        if item.get("type") == "message":
            for content in item.get("content", []):
                if content.get("type") in ("output_text", "text"):
                    return content.get("text", "")
    return ""


@traced(kind="llm")
def call_llm(messages: list[dict], model: str = "gpt-5.6", tools: Optional[list] = None) -> dict:
    api_key = os.environ["OPENAI_API_KEY"]
    responses_url = os.environ["OPENAI_RESPONSES_URL"]

    body: dict[str, Any] = {"model": model, "input": messages}
    if tools:
        body["tools"] = tools

    request = Request(
        responses_url,
        data=json.dumps(body).encode("utf-8"),
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request) as response:
        response_json = json.load(response)

    return {"tool_call": _parse_tool_call(response_json), "raw": response_json}
