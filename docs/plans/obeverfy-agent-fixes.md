# Agent Batch Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed bugs from the code review of `demo_app/scenarios/process_claims.py` and `demo_app/claim_files.py`.

**Architecture:** No structural changes — these are targeted correctness fixes to code that already exists and is already tested. Each task adds new test cases proving the bug is fixed, alongside the existing passing suite.

**Spec:** The review findings below (from `/code-review fa40e79..c312cac`, reported to the user and confirmed) are the binding requirements for each task.

## Global Constraints

- Run Python commands from the repo root; `.venv` already exists there (`.venv/bin/pytest`, `.venv/bin/python`).
- Do not touch `obeverfy/tracing.py` or `obeverfy/client.py` (SDK, owned by another contributor) — findings about those files are informational only, not part of this plan.
- Keep the existing public function signatures in `demo_app/claim_files.py` and `demo_app/scenarios/process_claims.py` unchanged (`load_claim_file(path)`, `build_message(claim)`, `find_claim_files(paths)`, `process_claim_file(path)`) — other code already imports and calls these.
- All new/changed behavior must be covered by tests in `tests/test_claim_files.py` or `tests/test_process_claims.py`; run the full suite (`.venv/bin/pytest -v`) before considering a task done, not just the new tests.
- `InvalidClaimFileError` (already defined in `demo_app/claim_files.py`, subclass of `ValueError`) is the exception type for all claim-file validation failures — reuse it, don't invent a new exception type.

---

## Task 1: Wire tracing + add per-file error handling in `process_claims.py`

**Files:**
- Modify: `demo_app/scenarios/process_claims.py`
- Modify: `tests/test_process_claims.py`

**Interfaces:**
- Consumes: `obeverfy.tracing.configure`, `obeverfy.client.SupabaseReporter` (both already implemented and merged) — `demo_app/scenarios/run_claim.py` already calls `configure(SupabaseReporter())` in its `main()`; use the identical pattern here.
- Produces: `main(argv)` becomes resilient to a single bad file failing, and reports a pass/fail summary at the end. `process_claim_file(path)`'s signature and return shape are unchanged.

**Confirmed bugs to fix:**

1. **Missing tracing setup.** `process_claims.py`'s `main()` never calls `configure(SupabaseReporter())`, unlike `run_claim.py`. Result: every `@traced` span from a batch run silently no-ops (`obeverfy.tracing`'s module-level `_reporter` stays `None`), so nothing is ever written to the `spans` table for batch-processed claims. Fix: call `configure(SupabaseReporter())` at the top of `main()`, exactly as `run_claim.py` does (import `from obeverfy.client import SupabaseReporter` and `from obeverfy.tracing import configure`).

2. **No error handling in the batch loop.** `main()`'s `for path in files:` loop calls `process_claim_file(path)` with no `try`/`except`. One malformed file (bad JSON, missing field, a DB or LLM error) raises out of the loop and kills the entire batch — files after the failing one are never attempted, and there's no summary of what succeeded vs. failed. Fix: wrap the call to `process_claim_file(path)` in a `try`/`except Exception`, print a clear per-file error (include the filename and the exception message) on failure, continue the loop, and change the final summary line to report both counts, e.g. `Processed 2 claim(s), 1 failed.` (omit the failed count when it's zero, e.g. `Processed 3 claim(s).` as today).

**Required new tests (add to `tests/test_process_claims.py`):**
- A test that `main()` calls `configure(...)` with a `SupabaseReporter` instance (patch `demo_app.scenarios.process_claims.configure` and `demo_app.scenarios.process_claims.SupabaseReporter`, assert `configure` was called once with the `SupabaseReporter` instance).
- A test with three files where one raises (mock `process_claim_file` — or the lower-level `handle_claim`/`get_client` — so the middle file's processing raises `InvalidClaimFileError` or a generic `Exception`) and assert: the other two files still get processed (their results appear in whatever `main()` returns/collects), and the run does not crash.
- A test that the failure count appears in the final printed summary when at least one file fails (capture stdout via `capsys` and assert the failure count is mentioned).

- [ ] **Step 1: Write the failing tests** for the three behaviors above in `tests/test_process_claims.py`, alongside the existing test.
- [ ] **Step 2: Run `.venv/bin/pytest tests/test_process_claims.py -v`** to confirm they fail against the current code.
- [ ] **Step 3: Implement** the `configure(SupabaseReporter())` call and the per-file try/except + summary line in `demo_app/scenarios/process_claims.py`.
- [ ] **Step 4: Run `.venv/bin/pytest tests/test_process_claims.py -v`** to confirm they pass.
- [ ] **Step 5: Run `.venv/bin/pytest -v`** (full suite) to confirm nothing else broke.
- [ ] **Step 6: Commit.**

---

## Task 2: Harden claim-file validation in `claim_files.py`

**Files:**
- Modify: `demo_app/claim_files.py`
- Modify: `tests/test_claim_files.py`

**Interfaces:**
- Produces: `load_claim_file(path)` now raises `InvalidClaimFileError` (never an unhandled `TypeError`/other exception) for every malformed-input case below. `find_claim_files(paths)` now rejects non-`.json` individual file arguments the same way it already filters directories to `*.json`. `build_message(claim)` now raises `InvalidClaimFileError` instead of silently passing through a non-string `message`.

**Confirmed bugs to fix:**

1. **`load_claim_file` assumes the parsed JSON is a `dict`.** A file whose top-level JSON value is a scalar or list (e.g. `42` or `[1,2,3]`) parses successfully, then the `field not in data` required-field check raises an unhandled `TypeError` instead of `InvalidClaimFileError`. Fix: after `json.loads`, check `isinstance(data, dict)` before the required-fields check; if not, raise `InvalidClaimFileError(f"{path}: claim file must contain a JSON object, got {type(data).__name__}")`.

2. **No type validation on `amount`.** A claim file with `"amount": "a lot"` passes `load_claim_file`'s validation (the field is present, its type is never checked), then fails deep inside the Postgres upsert (`claims.amount` is `numeric`) with an unhandled, confusing error far from the actual bad input. Fix: after the required-fields check, validate `isinstance(data["amount"], (int, float)) and not isinstance(data["amount"], bool)` (exclude `bool`, since `bool` is a subclass of `int` in Python and `True`/`False` are not valid claim amounts); if invalid, raise `InvalidClaimFileError(f"{path}: 'amount' must be a number, got {type(data['amount']).__name__}")`.

3. **`find_claim_files` is inconsistent between directories and individual files.** A directory argument is filtered to `*.json` via `glob`; an individual file argument is accepted regardless of extension or content (e.g. `process_claims.py some_readme.md` is silently accepted, then fails deep inside `load_claim_file` with a raw `JSONDecodeError`-derived message far from the actual mistake). Fix: when `p.is_file()`, additionally check `p.suffix == ".json"`; if not, raise `InvalidClaimFileError(f"{p}: not a .json file")`.

4. **`build_message` doesn't validate that `message` is a string.** `claim.get("message")` is truthy-checked and returned as-is; a claim file with `"message": 12345` (a truthy non-string) is returned unchanged and passed straight into an LLM call's message content. Fix: if `claim.get("message")` is truthy, additionally check `isinstance(claim["message"], str)`; if it's present but not a string, raise `InvalidClaimFileError(f"'message' must be a string, got {type(claim['message']).__name__}")`. (If `message` is absent or falsy, fall through to the existing synthesis logic unchanged.)

**Required new tests (add to `tests/test_claim_files.py`):**
- `load_claim_file` raises `InvalidClaimFileError` when the JSON top level is a list (e.g. `"[1, 2, 3]"`) and when it's a scalar (e.g. `"42"`).
- `load_claim_file` raises `InvalidClaimFileError` when `amount` is a string (e.g. `"a lot"`).
- `load_claim_file` accepts an integer `amount` and a float `amount` (two small tests, or one parametrized) — confirm the fix doesn't reject valid numeric input.
- `find_claim_files` raises `InvalidClaimFileError` when given an individual file path that doesn't end in `.json` (e.g. a `.txt` file, using `tmp_path`).
- `build_message` raises `InvalidClaimFileError` when `message` is present but not a string (e.g. `{"category": "auto", "amount": 5000, "message": 12345}`).

- [ ] **Step 1: Write the failing tests** for the five behaviors above in `tests/test_claim_files.py`, alongside the existing tests.
- [ ] **Step 2: Run `.venv/bin/pytest tests/test_claim_files.py -v`** to confirm they fail against the current code.
- [ ] **Step 3: Implement** the four validation fixes in `demo_app/claim_files.py`.
- [ ] **Step 4: Run `.venv/bin/pytest tests/test_claim_files.py -v`** to confirm they pass.
- [ ] **Step 5: Run `.venv/bin/pytest -v`** (full suite) to confirm nothing else broke, including `tests/test_process_claims.py` (Task 1's new tests exercise `process_claim_file`, which calls into `load_claim_file`/`build_message` — a stricter validation here must not break Task 1's fixtures, which use valid claim shapes).
- [ ] **Step 6: Commit.**
