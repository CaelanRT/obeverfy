"""Tests for demo_app.claim_files: loading, validating, and finding claim files."""
import json

import pytest

from demo_app.claim_files import (
    InvalidClaimFileError,
    build_message,
    find_claim_files,
    load_claim_file,
)


def test_load_claim_file_reads_valid_json(tmp_path):
    path = tmp_path / "claim.json"
    path.write_text(json.dumps({"claim_id": "C-1", "category": "water", "amount": 5000}))

    claim = load_claim_file(path)

    assert claim == {"claim_id": "C-1", "category": "water", "amount": 5000}


def test_load_claim_file_rejects_invalid_json(tmp_path):
    path = tmp_path / "claim.json"
    path.write_text("{not valid json")

    with pytest.raises(InvalidClaimFileError):
        load_claim_file(path)


def test_load_claim_file_rejects_missing_required_fields(tmp_path):
    path = tmp_path / "claim.json"
    path.write_text(json.dumps({"claim_id": "C-1"}))

    with pytest.raises(InvalidClaimFileError, match="category"):
        load_claim_file(path)


def test_build_message_uses_explicit_message_if_present():
    claim = {"category": "auto", "amount": 5000, "message": "custom message here"}
    assert build_message(claim) == "custom message here"


def test_build_message_synthesizes_from_category_and_amount():
    claim = {"category": "water", "amount": 5000}
    message = build_message(claim)
    assert "water" in message
    assert "5000" in message


def test_build_message_includes_description_when_present():
    claim = {"category": "auto", "amount": 5000, "description": "fender bender"}
    message = build_message(claim)
    assert "fender bender" in message


def test_find_claim_files_expands_a_directory(tmp_path):
    (tmp_path / "a.json").write_text("{}")
    (tmp_path / "b.json").write_text("{}")
    (tmp_path / "c.txt").write_text("not json")

    files = find_claim_files([str(tmp_path)])

    assert sorted(f.name for f in files) == ["a.json", "b.json"]


def test_find_claim_files_accepts_individual_files(tmp_path):
    path = tmp_path / "claim.json"
    path.write_text("{}")

    files = find_claim_files([str(path)])

    assert files == [path]


def test_find_claim_files_rejects_a_path_that_does_not_exist(tmp_path):
    with pytest.raises(InvalidClaimFileError):
        find_claim_files([str(tmp_path / "nope.json")])


# New tests for bug fixes

def test_load_claim_file_rejects_json_array(tmp_path):
    """Reject claim files with JSON array at top level."""
    path = tmp_path / "claim.json"
    path.write_text("[1, 2, 3]")

    with pytest.raises(InvalidClaimFileError, match="must contain a JSON object"):
        load_claim_file(path)


def test_load_claim_file_rejects_json_scalar(tmp_path):
    """Reject claim files with JSON scalar at top level."""
    path = tmp_path / "claim.json"
    path.write_text("42")

    with pytest.raises(InvalidClaimFileError, match="must contain a JSON object"):
        load_claim_file(path)


def test_load_claim_file_rejects_non_numeric_amount(tmp_path):
    """Reject claim files with string amount."""
    path = tmp_path / "claim.json"
    path.write_text(json.dumps({"claim_id": "C-1", "category": "auto", "amount": "a lot"}))

    with pytest.raises(InvalidClaimFileError, match="'amount' must be a number"):
        load_claim_file(path)


def test_load_claim_file_accepts_integer_amount(tmp_path):
    """Confirm integer amounts are accepted."""
    path = tmp_path / "claim.json"
    path.write_text(json.dumps({"claim_id": "C-1", "category": "auto", "amount": 5000}))

    claim = load_claim_file(path)

    assert claim["amount"] == 5000


def test_load_claim_file_accepts_float_amount(tmp_path):
    """Confirm float amounts are accepted."""
    path = tmp_path / "claim.json"
    path.write_text(json.dumps({"claim_id": "C-1", "category": "auto", "amount": 5000.50}))

    claim = load_claim_file(path)

    assert claim["amount"] == 5000.50


def test_find_claim_files_rejects_non_json_file(tmp_path):
    """Reject individual non-.json file arguments."""
    path = tmp_path / "readme.txt"
    path.write_text("some content")

    with pytest.raises(InvalidClaimFileError, match="not a .json file"):
        find_claim_files([str(path)])


def test_load_claim_file_rejects_boolean_amount(tmp_path):
    """Reject claim files with boolean amount (true/false are not valid numbers)."""
    path = tmp_path / "claim.json"
    path.write_text(json.dumps({"claim_id": "C-1", "category": "auto", "amount": True}))

    with pytest.raises(InvalidClaimFileError, match="'amount' must be a number"):
        load_claim_file(path)


def test_build_message_rejects_non_string_message(tmp_path):
    """Reject claim files with non-string message."""
    claim = {"category": "auto", "amount": 5000, "message": 12345}

    with pytest.raises(InvalidClaimFileError, match="'message' must be a string"):
        build_message(claim)
