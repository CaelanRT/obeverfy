"""Runnable demo scenario: seeds one new claim and runs it through handle_claim()."""
from __future__ import annotations

import json

from dotenv import load_dotenv

load_dotenv()

from demo_app.agent import handle_claim  # noqa: E402
from demo_app.db import get_client  # noqa: E402
from obeverfy.client import SupabaseReporter  # noqa: E402
from obeverfy.tracing import configure  # noqa: E402

NEW_CLAIM = {"claim_id": "C-2001", "category": "water", "amount": 15000}


def main() -> None:
    configure(SupabaseReporter())
    client = get_client()
    client.table("claims").upsert(
        {
            "claim_id": NEW_CLAIM["claim_id"],
            "category": NEW_CLAIM["category"],
            "description": "New claim for demo run",
            "amount": NEW_CLAIM["amount"],
            "status": "pending",
        }
    ).execute()

    message = f"I'd like to file a {NEW_CLAIM['category']} damage claim for ${NEW_CLAIM['amount']}."
    result = handle_claim(NEW_CLAIM["claim_id"], message)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
