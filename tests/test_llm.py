"""Tests for demo_app.llm.call_llm, with mocked urlopen."""
import json
from unittest.mock import MagicMock, patch

from demo_app.llm import call_llm


def _mock_urlopen_returning(response_json: dict):
    mock_response = MagicMock()
    mock_response.__enter__.return_value = mock_response
    mock_response.read.return_value = json.dumps(response_json).encode("utf-8")
    return mock_response


@patch.dict("os.environ", {"OPENAI_API_KEY": "test-key", "OPENAI_RESPONSES_URL": "http://example.invalid/responses"})
@patch("demo_app.llm.urlopen")
def test_call_llm_parses_a_function_call(mock_urlopen):
    mock_urlopen.return_value = _mock_urlopen_returning({
        "output": [{"type": "function_call", "name": "approve_claim", "arguments": '{"claim_id": "C-1", "amount": 5000}'}]
    })

    result = call_llm([{"role": "user", "content": "hi"}])

    assert result["tool_call"] == {"name": "approve_claim", "args": {"claim_id": "C-1", "amount": 5000}}


@patch.dict("os.environ", {"OPENAI_API_KEY": "test-key", "OPENAI_RESPONSES_URL": "http://example.invalid/responses"})
@patch("demo_app.llm.urlopen")
def test_call_llm_returns_none_tool_call_for_a_plain_reply(mock_urlopen):
    mock_urlopen.return_value = _mock_urlopen_returning({
        "output": [{"type": "message", "content": [{"type": "output_text", "text": "water"}]}]
    })

    result = call_llm([{"role": "user", "content": "hi"}])

    assert result["tool_call"] is None
