# WAVE PE-2J — Refresh-Endpoint Failure Handling (2026-10-09 UTC)

## 1. Reported symptom (OBSERVED)

Playwright console on `http://localhost:5173/` showed
`POST /api/auth/refresh → 500` with an absent session. Frontend
`fetchRefresh` (`frontend/src/services/api.ts:75-83`) catches every error
to `null` and the route is in `NO_REFRESH_PREFIXES`, so the UI degraded
silently to logged-out — no loop, no bounce.

## 2. Root cause (OBSERVED, reproduced)

Two distinct 500 vectors, neither in the no-session path:

1. **Test-environment (the Playwright 500).** With a fresh browser profile
   there is no `kb_refresh` cookie, and the backend provably answers 401
   for every no-cookie shape (empty body, `{}`, text/plain junk, null/list
   bodies — all reproduced at 401). A backend-alone 500 is impossible
   without a presented token, so the observed 500 was the Vite dev proxy's
   response with the backend unreachable (proxy errors surface as 500),
   not an application bug.
2. **Real backend gap (fixed here).** With a token presented, any session-
   store failure (`OperationalError`: missing `auth_sessions` table,
   locked SQLite, unreachable DB) propagated uncaught from
   `sessions.refresh_session` / the user lookup as a bare Starlette 500
   (`Internal Server Error`, plain text). Reproduced by dropping the table:
   `POST /api/auth/refresh {"refresh_token": "garbage"}` → 500.

Not a bug: missing/expired/revoked/invalid sessions already return the
intentional 401 (`test_session_auth.py`, 16 tests), origin mismatch 403.

## 3. Fix (backend/app/api/session_auth.py, +20/-1)

`refresh_token` now catches `SQLAlchemyError` (only) around the rotation
call and the user lookup: server-side `logger.exception` (token never
logged) + `HTTPException(503, "Authentication service temporarily
unavailable")`. Preserved: 15-min sid-bound JWT, rotating opaque cookie
(HttpOnly, `Path=/api/auth`, Lax), `ServiceError`→401 mapping, reuse
family-kill + socket sweep, CSRF origin gate, cookie attributes,
single-flight frontend behavior (axios rejects identically on 500/503).
A store outage can no longer masquerade as 401 (would hide the outage)
and can never mint a session (no token/cookie on failure paths).

## 4. Regression coverage (tests/test_refresh_failures.py, 6 tests)

1. no cookie/session → 401 + `detail` shape, nothing issued
2. malformed/invalid (garbage cookie, empty value, garbage/null/list/
   number/object body tokens, binary body) → 401 each, nothing issued
3. expired + revoked → 401 each, nothing issued
4. valid session → 200 success envelope (`access_token`, `bearer`, 900s,
   user) + `HttpOnly` cookie; rotation retires the old sid
5. past-grace replay → 401, whole family dead (both tokens), nothing issued
6. dropped `auth_sessions` table → presented token 503 + shape, nothing
   issued; no-cookie path still short-circuits to 401; tables restored in
   `finally`, endpoint serves again

Shape-only assertions (status + `detail` presence + absence of
`access_token`/`kb_refresh`); no message-text dependence. PE-2H temp DB;
`backend/kbchat.db` mtime/size verified identical before/after the suite.

## 5. Verification (OBSERVED)

- New file: 6 passed.
- Session/auth focused: `test_refresh_failures` + `test_session_auth` +
  `test_auth_sessions` + `test_session_enforcement` +
  `test_password_sessions` + `test_ws_sessions` → 55 passed.
- Full backend suite: **170 passed, 11 skipped** (skips are
  `test_fk_postgres.py`, gated on live Postgres — environment limitation,
  pre-existing). `git diff --check` clean.
- Frontend untouched (no contract change: success envelope identical;
  error path still rejects the promise to `null`), so no tsc/build rerun
  attributable to this fix; last landing build/tests state unchanged.
- Pre-existing, out of scope: `close_session_sockets` never-awaited
  `RuntimeWarning` under TestClient (`manager.spawn` with no loop);
  server-side it schedules correctly.
