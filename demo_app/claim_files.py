"""Loading and validating claim files for batch processing."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

REQUIRED_FIELDS = ("claim_id", "category", "amount")


class InvalidClaimFileError(ValueError):
    pass


def load_claim_file(path: Path) -> dict[str, Any]:
    try:
        data = json.loads(Path(path).read_text())
    except json.JSONDecodeError as exc:
        raise InvalidClaimFileError(f"{path}: not valid JSON ({exc})") from exc

    # Bug fix 1: Check that parsed JSON is a dict, not a scalar or list
    if not isinstance(data, dict):
        raise InvalidClaimFileError(f"{path}: claim file must contain a JSON object, got {type(data).__name__}")

    missing = [field for field in REQUIRED_FIELDS if field not in data]
    if missing:
        raise InvalidClaimFileError(f"{path}: missing required field(s): {', '.join(missing)}")

    # Bug fix 2: Validate that amount is numeric (int or float, excluding bool)
    if not (isinstance(data["amount"], (int, float)) and not isinstance(data["amount"], bool)):
        raise InvalidClaimFileError(f"{path}: 'amount' must be a number, got {type(data['amount']).__name__}")

    return data


def build_message(claim: dict[str, Any]) -> str:
    if claim.get("message"):
        # Bug fix 4: Validate that message is a string
        if not isinstance(claim["message"], str):
            raise InvalidClaimFileError(f"'message' must be a string, got {type(claim['message']).__name__}")
        return claim["message"]

    description = claim.get("description")
    detail = f" ({description})" if description else ""
    return f"I'd like to file a {claim['category']} damage claim for ${claim['amount']}{detail}."


def find_claim_files(paths: list[str]) -> list[Path]:
    """Expand a list of file/directory arguments into a sorted list of .json claim files."""
    files: list[Path] = []
    for raw in paths:
        p = Path(raw)
        if p.is_dir():
            files.extend(sorted(p.glob("*.json")))
        elif p.is_file():
            # Bug fix 3: Check that individual files have .json extension
            if p.suffix != ".json":
                raise InvalidClaimFileError(f"{p}: not a .json file")
            files.append(p)
        else:
            raise InvalidClaimFileError(f"{p}: not a file or directory")
    return files
