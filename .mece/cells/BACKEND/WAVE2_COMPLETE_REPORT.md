# WAVE 2 COMPLETE REPORT — auth/session migration (2026-10-06 UTC)

## 1. Executive summary

Wave 2 is complete: the application runs on **15-minute sid-bound access
JWTs + rotating opaque refresh sessions + server-side revocation**, enforced
in `get_current_user`, the frontend (memory token + single-flight refresh
queue), WebSockets (connect validation + per-message liveness + 4401
sweeps), and password events (change keeps-current/kills-others, reset kills
all). Legacy 7-day JWTs remain **accepted** (cutoff OD-5 open — no silent
lockout). Backend **134 passed / 0 failed**, frontend vitest **25/25**, tsc
clean, vite build green.

## 2. Starting baseline

`5034657` (2B-2 API): 117 backend tests green, flag default off, frontend/WS
legacy, signup legacy. All Wave 2A design docs read first; no architecture
substitutions.

## 3. Commits created (on top of `5034657`)

| Commit | Phase | Content |
|---|---|---|
| `47af971` | 1 | session-aware `get_current_user` + `is_access_session_valid` + 6 tests |
| `28ec56d` | 2 (be) | signup issuance + `SESSION_ISSUE_ENABLED` default true + test isolation fixes |
| `ef074ab` | 2 (fe) | memory token, refresh queue, auth-store rework, 4 touch-point updates, 12 frontend tests |
| `6efd83f` | 3 | WS sid tracking/validation/sweep + client revive + 7 WS tests |
| `49eaa85` | 4–5 | password change/reset revocation + 4 tests + list-hygiene check |
| (this) | 9 | this report |

## 4. Backend session architecture

Unchanged from 2B-1/2B-2 (`auth_sessions` table + service) plus one fix:
`used_at` stamps on **first** rotation only (replay cannot extend grace).
`SESSION_ISSUE_ENABLED` default flipped **false→true** (env-overridable;
explicit reversible rollout — legacy tokens still accepted either way).

## 5. get_current_user enforcement

`dependencies.py`: after existing sub/user/active checks, sid-bearing tokens
require `is_access_session_valid` (row exists + owned by sub + not revoked +
not expired). `used` rows authorize (rotation must not kill in-flight
access). Failures: expired → `Session expired`, else `Session revoked`
(401, enumeration-neutral). Legacy no-sid tokens byte-identical behavior.
Mandatory proofs in `test_session_enforcement.py`: logout-kills-token,
A-revoked/B-alive, rotation-survives, expired/unknown/foreign-sid 401,
legacy accepted, inactive denied. One test expectation updated honestly:
repeat-logout with a revoked token now 401s fail-closed at the dependency
instead of 200 (client logout path ignores status either way).

## 6. Frontend token architecture

Access JWT in `services/session.ts` memory only (asserted: `kb_token` never
written; LoginPage/SignupPage/Firebase flows untouched — all go through the
store). `kb_user` profile cache persists (not a credential). Boot:
silent refresh → session; else one-time legacy-bridge adoption (validated,
then deleted from disk); else logged-out. Cross-tab logout broadcast
(`kb_logged_out_at` storage event; no self-loop). `withCredentials: true`
on API clients for the cookie.

## 7. Refresh queue architecture

Single-flight shared promise in `session.ts` (concurrent 401s → one POST);
retry exactly once with fresh `Authorization`; refresh endpoint + all
login-family paths excluded from interception (no recursion); silent mode
for boot/WS-revive (no bounce on public pages); generation counter drops
stale completions (logout-during-refresh can never resurrect). Tested:
shared fetch ×1, fail-once-then-retry, silent-no-logout, stale-drop,
rejection→logout-once.

## 8. WebSocket authentication

Connect: `_get_user` returns `(user, sid)`, session-validated (legacy
accepted); reject → existing 1008. Mid-connection: per-message `sid` check
(indexed PK read; clients ping every 30s ⇒ ≤~60 s bound, no polling loop);
dead → 4401. Client: fresh-token-per-dial via provider, 4401/1008 → one
silent refresh + redial (no loop), provider wired in `setToken`.

## 9. WebSocket revocation

`sids↔sockets` maps in manager; `close_session_sockets(sid)` /
`close_user_sockets(uid)` spawned on logout, device-delete, reuse-family
kill, password change/reset. Caveat (test-harness only): `manager.spawn`
needs the lifespan loop; bare `TestClient` (no lifespan) drops sweeps with a
logged error — prod uvicorn always runs lifespan. Integration tests prove the
validation backstop deterministically; sweep units prove scoping.

## 10. Password-change/reset behavior (approved policy)

Change (`services/users.py`, keeps `keep_sid`): others revoked, current
survives on both transports; failure (400) revokes nothing (raises before
mutation). Reset (`auth.py`): all families revoked, post-commit, failure-safe
(password change itself never undone). Both sweep all user sockets when
flagged (revived sessions reconnect; dead ones fail closed). A/B/C device
matrix tested incl. WS 4401 + current-session revive.

## 11. Session management (Phase 5 verification)

List: own `active` rows only, `last_used_at` desc (deterministic), safe
metadata (raw-body asserted free of hashes/tokens), `is_current` derived,
revoked rows absent (asserted post-change). Delete: own 200 (repeat 200),
current 400, unknown/other-user identical 404. Metadata: UA + IP only (abuse
signal + device label; no fingerprinting).

## 12. Legacy compatibility

Accepted everywhere: no-sid JWTs (API + WS), legacy login shape, old
`/api/sessions` endpoints, `?token=` file auth, signup/login failure
semantics. Legacy-bridge adopts pre-migration `kb_token` once. Flag-off mode
re-verified by the 2B-2 suite (defaults now on; per-test monkeypatch covers off).

## 13. Legacy cleanup (Phase 6 outcome: inventory only, zero deletions)

Categorized: (A) retained-compat — `kb_token` bridge/cleanup lines,
`create_access_token` legacy fallbacks (auth.py:70/198/412), uploads
`?token=`, old sessions endpoints; (B) migrated — `get_current_user`,
WS auth, interceptors, stores; (D) test fixtures/docs. **Blocker: OD-5
legacy cutoff undecided → cleanup STOPPED per instructions, no user lockout.**

## 14. Security threat-model results

XSS: persistent credential theft eliminated (memory 15-min token), live-page
XSS still rides the session — documented honestly, not claimed safe. CSRF:
POST-only + SameSite=Lax + Origin allowlist on cookie path, tested
(evil→403, allowlisted→200, originless native→200); body tokens non-ambient.
Replay/reuse: rotation + supersede + family-kill verified (API + service +
concurrency). Revocation: logout/device/family/password/reset all verified
across HTTP + WS. Enumeration: identical 404s, neutral 401s. Logging: no
tokens/hashes/secrets in logs or errors (service logs nothing; reset-token
dev print is pre-existing and out of scope).

## 15. Tests

New: `test_session_enforcement` (6), `test_ws_sessions` (7),
`test_password_sessions` (4), frontend `session.test` (6) +
`auth.session.test` (6). Total backend **134/134**, frontend **25/25**.

## 16. Browser verification

Not performed — no browser automation available in this environment.
Covered instead: full backend suite, vitest (incl. store-level login/
init/logout/reload-restore paths), tsc, production vite build. Stated
plainly, not claimed.

## 17. Exact test counts

Backend: 134 passed / 0 failed (baseline 117 + 17). Frontend: 25 passed
(baseline 13 + 12). Auth/WS/session/password scopes: 43 backend tests.

## 18. Build results

`npx tsc --noEmit` exit 0 · `npm run build` success (~35 s, pre-existing
chunk-size warnings) · backend `python -m pytest tests/ -q` 134 passed
(~145 s). Final validation rerun after last code change: see §15/§17
(full suite green post-Phase-4; Phases 5–6 added no code).

## 19. Remaining open decisions (unchanged, still need approval)

OD-1 TTLs (15m/30d/90d provisional) · OD-2 HS256 vs RS256 · OD-3 absolute
refresh cap · OD-4 native transport signal · OD-5 LEGACY CUTOFF (blocks
cleanup) · OD-6 keep inbox code step · OD-7 audit-log home for reuse/revoke.

## 20. Remaining risks

1. Cutoff indecision leaves 7-day tokens valid indefinitely (accepted risk).
2. Reload during total outage lands on login (no verifiable session while
   offline) — cookie restores on next boot.
3. Sweeps need lifespan loop (prod ✓, bare-TestClient ✗ — validation
   backstop covers).
4. `is_active=False` keeps ≤15-min access tail (refresh blocked at once).
5. No reuse/revoke audit sink (OD-7).

## 21. Recommended Wave 3

Per audit roadmap: FK/`ondelete` migration wave (8 owner FKs + JSON
membership + attachment orphans) on a staging DB copy first — auth work does
not depend on it and vice versa. Then Wave 4 distribution (limiter/WS/reset
store, export/status caps). OD-5 cutoff decision unlocks the deferred
legacy deletion (list in §13).
