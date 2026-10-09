# Security Pass, Round 1 (2026-10-09 UTC)

## 1. Scans (OBSERVED)

- Tracked-secret scan: no live keys in git. `opencode.json` (live key)
  is untracked + gitignored; tracked `.bak` files hold only
  `{env:...}` placeholders (left untouched — stale backups).
- `dangerouslySetInnerHTML` / `eval` / `new Function`: zero hits.
- `shell=True` / `os.system` / pickle / yaml: one hit —
  `backend/app/ai/agent/tools.py::run_command` (see §2).

## 2. Removed: dead agentic toolset with shell RCE shape

`backend/app/ai/agent/tools.py` defined a full file-write + shell toolset
(`read/write/edit/delete/glob/grep/run_command` with `shell=True`).
Traced end to end: `ServiceAgent` (`core.py`) only calls the chat
provider; `get_tool_definitions` has zero importers and zero tests —
dead code, unreachable at runtime. Deleted outright (`git rm`):
eliminates the future-wiring risk instead of gating code nobody calls.
`tests/test_agent.py`: 3 passed after removal.

## 3. Dependencies

- `axios` 1.19.0 → 1.20.0 + `npm audit fix`: 12 → 10 vulns
  (brace-expansion DoS fixed; axios advisories cleared).
- Remaining (deferred, documented): react-router v6 advisories need the
  **v7 major** (breaking — router migration + full e2e required);
  `uuid` buffer-bounds is transitive with no non-breaking fix and minimal
  browser reachability.
- Backend pins (`python-jose` 3.3.0 latest, explicit `algorithms=[...]`
  on every decode — no `none`-alg confusion) reviewed, no change.

## 4. Not changed (deliberately)

- No auth/cookie/CSP/rate-limit tuning: current controls reviewed and
  adequate for this round (HttpOnly path-scoped refresh, origin gate,
  30/60s auth throttle, CSP with narrow allowlists).
- No breaking upgrades; no backend dep changes.

## 5. Verification

- Backend `test_agent.py` 3 passed; frontend vitest 175 passed;
  `tsc` on touched areas clean (repo-wide `tsc` still blocked by the
  unrelated untracked `VideoNoteRecorder.tsx` — parallel work).
