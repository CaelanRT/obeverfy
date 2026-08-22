"""Tests for demo_app.tools, with a mocked Supabase client."""
from unittest.mock import MagicMock, patch

from demo_app.tools import TOOL_IMPLEMENTATIONS, retrieve_claim_history, retrieve_policy


@patch("demo_app.tools.get_client")
def test_retrieve_policy_queries_by_category_and_returns_the_row(mock_get_client):
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = {
        "category": "water",
        "policy_text": "over $10k needs review",
        "threshold_amount": 10000,
    }
    mock_get_client.return_value = client

    result = retrieve_policy("water")

    client.table.assert_called_with("policies")
    assert result["policy_text"] == "over $10k needs review"


@patch("demo_app.tools.get_client")
def test_retrieve_claim_history_returns_a_list(mock_get_client):
    client = MagicMock()
    client.table.return_value.select.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [
        {"claim_id": "C-1001", "amount": 4200}
    ]
    mock_get_client.return_value = client

    result = retrieve_claim_history("water")

    client.table.assert_called_with("claims")
    assert result == [{"claim_id": "C-1001", "amount": 4200}]


@patch("demo_app.tools.get_client")
def test_approve_claim_updates_status_to_approved(mock_get_client):
    client = MagicMock()
    client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"claim_id": "C-1", "status": "approved", "amount": 5000}
    ]
    mock_get_client.return_value = client

    result = TOOL_IMPLEMENTATIONS["approve_claim"](claim_id="C-1", amount=5000)

    client.table.return_value.update.assert_called_with({"status": "approved", "amount": 5000})
    assert result["status"] == "approved"


@patch("demo_app.tools.get_client")
def test_escalate_claim_updates_status_to_escalated(mock_get_client):
    client = MagicMock()
    client.table.return_value.update.return_value.eq.return_value.execute.return_value.data = [
        {"claim_id": "C-2", "status": "escalated", "amount": 15000}
    ]
    mock_get_client.return_value = client

    result = TOOL_IMPLEMENTATIONS["escalate_claim"](claim_id="C-2", amount=15000, reason="over threshold")

    client.table.return_value.update.assert_called_with({"status": "escalated", "amount": 15000})
    assert result["status"] == "escalated"
