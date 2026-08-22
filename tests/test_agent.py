"""Tests for demo_app.agent.handle_claim: tool dispatch on classify -> retrieve -> decide -> act."""
from unittest.mock import MagicMock, patch

from demo_app.agent import handle_claim


def _mock_supabase_client():
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "policy_text": "over $10k needs review",
        "threshold_amount": 10000,
    }
    client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []
    return client


def _fake_call_llm(messages, tools=None, **kwargs):
    if tools:
        return {
            "tool_call": {"name": "escalate_claim", "args": {"amount": 15000, "reason": "over threshold"}},
            "raw": {},
        }
    return {
        "tool_call": None,
        "raw": {"output": [{"type": "message", "content": [{"type": "output_text", "text": "water"}]}]},
    }


@patch("demo_app.agent.TOOL_IMPLEMENTATIONS", {"escalate_claim": lambda **kw: {"status": "escalated", **kw}})
@patch("demo_app.agent.call_llm", side_effect=_fake_call_llm)
@patch("demo_app.tools.get_client")
def test_handle_claim_escalates_a_high_value_claim(mock_get_client, mock_call_llm):
    mock_get_client.return_value = _mock_supabase_client()

    result = handle_claim("C-1", "water damage claim for $15000")

    assert result == {
        "status": "ok",
        "tool_name": "escalate_claim",
        "result": {"status": "escalated", "amount": 15000, "reason": "over threshold", "claim_id": "C-1"},
    }


@patch("demo_app.agent.TOOL_IMPLEMENTATIONS", {})
@patch("demo_app.agent.call_llm")
@patch("demo_app.tools.get_client")
def test_handle_claim_with_no_tool_call_returns_no_action(mock_get_client, mock_call_llm):
    mock_get_client.return_value = _mock_supabase_client()
    mock_call_llm.side_effect = lambda messages, tools=None, **kwargs: (
        {"tool_call": None, "raw": {"output": [{"type": "message", "content": [{"type": "output_text", "text": "auto"}]}]}}
    )

    result = handle_claim("C-2", "just checking in on my claim")

    assert result == {"status": "no_action"}
