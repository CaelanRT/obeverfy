"""Seeds the policies and claims tables with demo rows."""
from __future__ import annotations

from dotenv import load_dotenv

load_dotenv()

from .db import get_client  # noqa: E402  (must follow load_dotenv())

POLICIES = [
    {
        "category": "auto",
        "policy_text": (
            "Auto policy: claims over $10,000 require adjuster review. "
            "Pre-existing damage documented at policy start is excluded."
        ),
        "threshold_amount": 10000,
    },
    {
        "category": "water",
        "policy_text": (
            "Water damage policy: claims over $10,000 require adjuster review. "
            "Sudden pipe failure is covered; gradual leaks are excluded."
        ),
        "threshold_amount": 10000,
    },
]

CLAIMS = [
    {"claim_id": "C-1001", "category": "water", "description": "Pipe burst under sink", "amount": 4200, "status": "approved"},
    {"claim_id": "C-1002", "category": "auto", "description": "Rear-end collision", "amount": 8500, "status": "approved"},
]


def main() -> None:
    client = get_client()
    client.table("policies").upsert(POLICIES).execute()
    client.table("claims").upsert(CLAIMS).execute()
    print(f"Seeded {len(POLICIES)} policies and {len(CLAIMS)} claims.")


if __name__ == "__main__":
    main()
