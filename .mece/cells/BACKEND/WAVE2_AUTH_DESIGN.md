# WAVE 2A — Auth/Session Redesign (DESIGN ONLY, 2026-10-06 UTC)

> No application code, schema, or frontend behavior was changed to produce
> this document. All file:line references are to HEAD `7420744` (Wave 1 tip).

## 1. Current architecture

| Piece | Implementation | Evidence |
|---|---|---|
| Access token | HS256 JWT, claims `{sub, username, exp}`, **TTL 7 days**, no `iss`/`aud`/`jti` | `backend/app/auth/security.py:15-19`, `backend/app/database/config.py:23-25` |
| Issue points | signup, `verify-login` code redeem, login fail-open (no mail backend), Google/Firebase OAuth | `backend/app/api/auth.py:152-175,229,444+,397+` |
| Request auth | `get_current_user`: `HTTPBearer` → `decode_token` → `sub→int` → `is_active` check. No revocation, no session lookup | `backend/app/auth/dependencies.py:10-29` |
| Logout | Flips `is_online/last_seen` only; token stays valid to `exp` | `backend/app/api/auth.py:238-245` |
| Sessions table | `user_sessions`: informational device rows (`device_info/browser/ip/is_current`); `logout-others`/delete remove **rows**, never invalidate tokens | `backend/app/models/session.py`, `backend/app/api/sessions.py:37-52` |
| Frontend storage | `kb_token` + `kb_user` in **`localStorage`**; axios request interceptor injects `Bearer`; 401 interceptor wipes storage + store + redirects `/login` | `frontend/src/store/auth.ts:20-34`, `frontend/src/services/api.ts:28-58` |
| WS auth | `?token=` query param, validated once at connect (`1008` on bad); never re-validated mid-connection | `backend/app/websocket/chat.py:31-56`, `frontend/src/services/websocket.ts` |
| Login factor | Password **plus** 6-digit inbox code every sign-in (fail-open to password-only when no mail backend) | `backend/app/api/auth.py:118-143` |
| Brute force | Only generic write rate-limit (`/api/auth` 30/min, in-memory, writes-only) | `backend/app/main.py:369-376,428-452` |

## 2. Current weaknesses (mapped to §5 threat model rows)

1. 7-day bearer token, no revocation → theft = week-long impersonation; logout is theater.
2. Token in `localStorage` → any XSS = session theft; no `HttpOnly` option.
3. Token in WS URL + logs/history.
4. No `jti`/`sid` → tokens unlinkable to devices; per-device logout impossible.
5. `user_sessions` rows and tokens are disconnected systems.
6. Fail-open code step when mail unconfigured (dev convenience, prod risk).
7. In-memory rate limiter; no login lockout; user enumeration via `/users/search`.

## 3. Options comparison

Scored against this repo (170 routes behind `get_current_user`, axios+401
interceptor already central, `user_sessions` + sessions API exists, WS uses
query tokens, Capacitor native client, single Render instance today).

| Criterion | A. Long-lived JWT only (status quo) | B. Short JWT + stateless refresh JWT | C. Server-side opaque sessions | D. Hybrid: short JWT access + server-side refresh sessions |
|---|---|---|---|---|
| Security | ❌ no revocation, 7-day window | ⚠️ refresh JWT also unrevocable unless blocklisted (then it's D with extra steps) | ✅ instant revoke, minimal exposure | ✅ instant revoke; access theft window 15 min |
| Impl. complexity | zero (now) | low (second secret/TTL) | medium (session lookup per request on all 170 routes) | low-medium (lookup only on refresh; per-request stays stateless + one indexed `sid` check) |
| DB requirements | none | none (or blocklist) | session row per device + per-request read | one row per device; reads only on refresh/connect |
| Frontend complexity | none | refresh queue in interceptor | cookie handling + CSRF | same refresh queue as B; cookie only for refresh |
| WS compat | ✅ (as now) | ✅ | ⚠️ opaque token over WS needs lookup per connect + mapping | ✅ short JWT in `?token=` unchanged |
| Horizontal scaling | ✅ stateless | ✅ stateless | needs shared store/DB read per request | ✅ DB-backed, no stickiness |
| Logout/revocation | ❌ | ❌ (or blocklist) | ✅ | ✅ revoke row (+ family on reuse) |
| Theft recovery | ❌ wait 7 days | ⚠️ wait refresh TTL | ✅ revoke now | ✅ reuse detection kills family |
| Migration difficulty | — | easy, but solves nothing structural | hard (every route + WS + native) | incremental (old tokens valid till cutoff) |

**Scores: A 1/5 · B 2/5 · C 4/5 · D 5/5 for this codebase.**

## 4. Recommended architecture: D (hybrid)

- **Access token**: 15-minute HS256 JWT, claims `{sub, sid, jti, iat, exp}` (+ `username` kept for display compat — no sensitive data). Sent as `Bearer`, validated exactly as today plus an `sid→active-session` check.
- **Refresh token**: 256-bit opaque random, **SHA-256 hash stored**, delivered in `HttpOnly; Secure; SameSite=Lax` cookie (`kb_refresh`, path `/api/auth`) on web; response-body + app storage on Capacitor native. **Rotated on every use**; 30-day sliding TTL; reuse outside a 30 s grace window **revokes the whole family**.
- **Why D, in repo terms**: (1) per-request path stays stateless — all 170 routes keep calling `get_current_user`, which gains one indexed row check instead of a rewrite; (2) the axios 401 interceptor is already the single choke point, so refresh-on-401 queueing fits without touching call sites; (3) WS keeps `?token=` short JWTs — no protocol change; (4) `user_sessions` + sessions endpoints give us the display/API shape to evolve, not invent; (5) DB-backed sessions survive Render restarts and need no Redis (Wave 4 may add caching later, purely as an optimization).

### Answers to the 20 design questions

1. Access TTL: **15 min** (assumption, tunable 5–30; §15 OD-1).
2. Refresh tokens: **yes**, opaque + rotated.
3. Stored: **HttpOnly/Secure/SameSite cookie** (web); **response body → app storage** (native).
4. Rotated: **every successful `/refresh`**; old hash marked `used`, 30 s grace.
5. Revoked: `status='revoked'` on the session row (+ family on reuse); checked on refresh, WS connect, and (cheap indexed) per-request `sid` check.
6. Logout: revoke current session row; clear cookie; access token dies within ≤15 min; WS socket closed by sweep (see §11).
7. Theft detection: **reuse detection** — presenting a used/rotated refresh token outside grace ⇒ revoke entire `family_id`, log, force re-login on all family devices.
8. Expired access: client refresh-queue gets a new pair and **retries once**; else redirect `/login` (existing 401 path).
9. Reused refresh: grace (≤30 s, same device retry) → re-issue same pair idempotently; otherwise **revoke family → 401 `invalid_grant`**.
10. Multi-device: **one row per device** (`family_id` groups a device's rotation chain, not the user's devices).
11. Per-device logout: `DELETE /auth/sessions/{id}` revokes that row only.
12. Password change: **revoke all other sessions**, keep current (matches "change it everywhere except here" expectation); already have the current-session identity at the handler.
13. Password reset: **revoke ALL sessions** (reset proves inbox ownership but the password may have been changed by an attacker flow; conservative default).
14. Account deletion/deactivation: all sessions revoked (cascade or status update in the same transaction; `is_active=False` already fails `get_current_user` — belt and suspenders).
15. In DB: session rows (status, hashes, metadata, expiry). Stateless: access-token validation except the `sid`-active check.
16. (see 15).
17. `get_current_user`: signature unchanged; internally also enforces `sid` active for new tokens, accepts legacy no-`sid` tokens until cutoff (see §9).
18. Frontend eventually: stop persisting access token in `localStorage` (memory only), add refresh queue + rotation-safe retry, cookie handles web refresh, native stores refresh in app storage (see §10).
19. WS: unchanged transport (`?token=` short JWT); connect-time `sid` check; revoked-session socket sweep; client re-`connect()` after refresh (see §11).
20. Migration/rollback: §12/§13.

## 5. Token design

**Access JWT**: format `header.payload.sig` (existing lib `python-jose`); TTL 15 min;
claims `sub:int-str, sid:uuid-str, jti:uuid-str, username:str, iat, exp`;
`iss="kryzen-api"`, `aud="kryzen-clients"` (new; validated on decode);
alg HS256 (keep; key rotation is OD-2, not this design's blocker); keys via
`JWT_SECRET` (≥32 random bytes; boot **fails** in production if default — replaces
today's warn-only `main.py:186-196`).
Validation: sig → exp → iss/aud → `sub` int → user exists+active → `sid` row
`status='active'` (legacy: no `sid` → accept iff issued before cutoff timestamp).

**Refresh token**: `secrets.token_bytes(32)` (256-bit), base64url, transported
once; **only `sha256` stored**, column unique; TTL 30 d sliding (`expires_at`
bumped? No — fixed 30 d from issue, rotation re-issues new 30 d; absolute cap
90 d is OD-3); rotation links `rotated_from_hash`; reuse detection per §4.7/§4.9;
revocation = row status; no PII inside (it's random).

## 6. Session model

One device = one **family** (`family_id` groups its rotation chain). Lifecycle:
`active → (rotated: old row used, new row active, same family) | revoked |
expired` (lazy on access + nightly purge job, reusing the lifespan pattern in
`main.py:32-57`). Concurrent refresh: first writer wins (unique new-hash insert;
loser sees used-hash → grace ? same-pair : reuse ⇒ family revoke). Multi-tab:
tabs share cookie; in-flight 401s serialize in the frontend refresh queue
(single refresh, all retried). Compromised device: user revokes that row from
another device; family-revoke on any reuse signal.

## 7. Database model (minimum: ONE new table)

`auth_sessions` (new; `user_sessions` left untouched until Phase 5):

| Column | Type | Null | Index/UQ | Purpose / security |
|---|---|---|---|---|
| `id` | UUID str(36) PK | NO | PK | stable `sid` for JWT claim + DELETE API |
| `user_id` | int FK `users.id CASCADE` | NO | idx | owner; cascade wipes on account delete (§4.14) |
| `family_id` | UUID str(36) | NO | idx | rotation chain; reuse ⇒ revoke all in family |
| `refresh_hash` | char(64) sha256 | NO | **UNIQUE** | lookup key; hash-not-token (DB leak ≠ session theft) |
| `status` | enum str `active/used/revoked` | NO, default `active` | idx(status, expires_at) | revocation + rotation state |
| `rotated_from_hash` | char(64) | YES | — | grace + forensics |
| `used_at` / `revoked_at` / `revoke_reason` | timestamptz / str(32) | YES | — | grace math, audit (`logout/reuse/admin/password-change/reset`) |
| `device_info / browser_info / ip_address` | str(200/200/45) | YES | — | sessions UI; ip also abuse signal |
| `created_at / last_used_at / expires_at` | timestamptz | NO | idx(expires_at) | TTL, purge, "last active" UI |
| `is_current` | — | — | — | **NOT stored**; derived per request from calling `sid` |

Why not reuse `user_sessions`: legacy rows lack hashes/status; mixing nullable-hash
rows weakens the UNIQUE invariant and complicates the Phase-1 backfill. Phase 2
writes both (legacy display row as today + auth row); Phase 5 unifies the list
endpoint onto `auth_sessions` and stops legacy writes. Retention: purge
`expired`/`revoked` rows older than 90 d (nightly job; counts stay small).

## 8. API design (endpoints are DESIGNED, not implemented)

All under `/api/auth`, envelope `{success,data,message}` unchanged.

- `POST /api/auth/login` (existing, extended): same request; on success also
  creates `auth_sessions` row + `Set-Cookie kb_refresh` (web) or returns
  `refresh_token` in body (native, `x-client: native` or capability flag —
  exact signal is OD-4). Response keeps `access_token` (+ now 15-min) and `user`.
  Failures unchanged (401/400/403) + login-code step unchanged.
- `POST /api/auth/refresh`: auth = refresh cookie (web) or body token (native).
  Success 200: new access (body) + rotated refresh (cookie/body). Failures:
  missing → 401 `invalid_grant`; expired → 401; reused-in-grace → 200 same pair;
  reused-outside-grace → **family revoked → 401**, `{"revoked":true}` hint.
  Rate-limit: strict (e.g. 10/min/IP + per-account) — new limiter entry.
- `POST /api/auth/logout`: auth = access JWT. Revokes **current `sid`**,
  clears cookie. 200 always (idempotent).
- `GET /api/auth/sessions`: lists caller's `active` auth_sessions
  (`id/device/last_used/created/is_current`). Legacy `GET /api/sessions`
  kept as deprecated alias (same shape as today) until Phase 5.
- `DELETE /api/auth/sessions/{id}`: revokes that row (404 unknown/other-user;
  400 if `id == current sid` → "use logout"; mirrors `sessions.py:48-49` rule).
- Unchanged: signup/verify/me/password/forgot/reset (reset additionally revokes
  all families — server-side, no contract change).

## 9. `get_current_user` migration

- Phase 1–2: **byte-identical behavior** (new table written, never read).
- Phase 3: add `sid` check — `sid` present ⇒ row must be `active`; absent ⇒
  accept iff `iat` < cutoff (env `LEGACY_TOKEN_CUTOFF`, default = deploy time).
  New dependency `get_current_session() -> (User, session|None)` for handlers
  needing device identity (logout, sessions, password change); existing
  routes/services keep `get_current_user` untouched.
- Phase 5: cutoff passes; absent-`sid` rejected; legacy branch deleted.
- WS `_get_user` (`websocket/chat.py:18-28`) reuses the same predicate (shared
  helper in `auth/dependencies.py`, no duplication).

## 10. Frontend storage strategy

| Option | XSS | CSRF | Native fit | Verdict |
|---|---|---|---|---|
| `localStorage` (today) | ❌ any XSS steals 7-day token | n/a (Bearer) | ✅ | **remove for tokens** |
| `sessionStorage` | ❌ same XSS, per-tab | n/a | ✅ | no gain |
| HttpOnly+Secure+SameSite cookie (refresh) | ✅ JS can't read | ⚠️ needs `SameSite=Lax` + state-changing POSTs + no cookie-authenticated GETs | ⚠️ WebView cookies work over https but `SameSite` + custom-scheme quirks | **refresh on web** |
| In-memory access token | ✅ survives XSS read (not exfil-proof, but window-scoped) | n/a | ✅ | **access everywhere** |
| Hybrid (recommended) | ✅ refresh unreadable; access short-lived + memory-only | mitigated: refresh endpoint POST-only, `SameSite=Lax`, Origin check | native uses body-token → app storage (sandboxed, no web XSS class) | **adopt** |

Tradeoff stated plainly: cookies trade XSS-read for CSRF-write; we neutralize
CSRF by (a) refresh endpoint POST-only with no cookie-read GETs, (b)
`SameSite=Lax`, (c) Origin/Referer check on `/refresh`, (d) rotation (stolen
cookie use kills the family loudly). `kb_user` profile JSON may stay in
`localStorage` (not a credential). Access token lives in Zustand/memory only;
on reload the app calls `/refresh` (cookie) before `me()` — `init()` already
has exactly this shape (`auth.ts:36-59`).

## 11. WebSocket strategy (design, not implemented)

- Connect: `?token=<15-min access JWT>` (unchanged transport); server runs the
  shared predicate (`sub`+`sid` active) → `1008` reject as today.
- Mid-life: sockets carry `sid`; a revocation sweep (on logout/reuse/password
  events via `manager.spawn`, same pattern as message fan-out) closes affected
  sockets with code `4401` + client treats it like 1008-but-refresh-first.
- Expiry: client on abnormal close runs `refresh→connect` (backoff preserved in
  `websocket.ts`); server 60 s receive-timeout unchanged.
- Multi-device: each device holds its own family; killing one row never touches
  others' sockets. Revoked-session reconnect ⇒ `1008`, client drops to login.

## 12. Migration plan

- **Phase 1 — persistence**: add `auth_sessions` (+ indexes) via the existing
  `_ensure_missing_columns`-style additive migration (nullable-safe, no
  backfill needed — new table). Deploy: harmless, nothing reads it. (Impl wave.)
- **Phase 2 — issue + refresh + logout**: login/signup/verify also mint
  families; add `/refresh`, revoke-on-logout, sessions read from new table
  (dual-write legacy rows). Old 7-day tokens still accepted (no `sid` branch).
- **Phase 3 — frontend**: memory access token + refresh queue + cookie/native
  handling; `init()` refresh-before-`me()`. Web keeps working with old tokens
  during rollout (mixed-version safe: old clients ignore cookies, new clients
  refresh old tokens once).
- **Phase 4 — WS + enforcement**: connect-time `sid` check, revocation sweep,
  `get_current_session` adoption in session-aware handlers; `LEGACY_TOKEN_CUTOFF`
  set.
- **Phase 5 — cleanup**: reject no-`sid` tokens, unify sessions list, stop legacy
  writes, fail boot on default `JWT_SECRET`, rotate to `iss/aud` enforcement
  errors (already validated from Phase 2).

## 13. Rollback plan

- Phase 1: drop table / ignore — zero readers.
- Phase 2: feature-flag `SESSION_ISSUE_ENABLED`; rollback = flag off + redeploy;
  new rows ignored, old tokens unaffected. Refresh endpoint 404s → clients fall
  back to current login flow (client try-refresh-once, else login redirect —
  same as today's 401 path).
- Phase 3: frontend flag `USE_REFRESH_MIGRATION`; rollback = previous SPA build
  (served `dist` is versioned per deploy; old SPA + new backend stays compatible
  because legacy tokens are accepted until Phase 5).
- Phase 4: `LEGACY_TOKEN_CUTOFF` far-future = instant re-accept; sweep is
  additive (never blocks connects when flag off).
- Phase 5: point-in-time DB restore only if migration corrupted data (additive
  table ⇒ low risk); cutoff rollback re-accepts legacy tokens within their 7 d.
- Ordering rule: **backend-before-frontend, additive-before-enforcing**; never
  deploy Phase 4+5 together.

## 14. Test plan (to be written at implementation; none written now)

- Unit: rotation chain, grace math, reuse→family-revoke, hash-not-plaintext,
  expiry boundaries, `MISSING`-style sentinel n/a (no payload shape change).
- Integration/API: login→refresh→use→logout→use-fails; per-device logout leaves
  sibling valid; password-change keeps-current-kills-others; reset kills all;
  legacy-token accept/reject across cutoff; cookie flags asserted
  (`HttpOnly/Secure/SameSite/Path`); native body-token flow.
- Security: reused-refresh revocation, replay of used access after logout
  (≤15 min window documented), CSRF POST without Origin blocked, brute-force
  429 on login+refresh, enumeration-neutral error strings.
- Concurrency: 10 parallel refreshes, one winner + 9 graceful (grace→same-pair
  or reuse-revoke exactly once); multi-tab single-flight via queue.
- WS: connect with revoked/expired `sid` → 1008; mid-connection revoke → 4401
  sweep; reconnect-after-refresh succeeds.
- Frontend auth tests: memory-only access token (assert no `kb_token` write),
  401→refresh→retry-once, refresh-fail→login redirect, reload→silent refresh.

## 15. Open decisions (require approval)

- OD-1: access TTL 15 min (range 5–30) and refresh 30 d / absolute cap 90 d.
- OD-2: stay HS256 vs move to RS256/rotating keys (current `JWT_SECRET` ops ok).
- OD-3: absolute refresh cap + "re-auth with password every N days" policy.
- OD-4: native refresh transport signal (header vs body flag) + storage API.
- OD-5: `LEGACY_TOKEN_CUTOFF` value and Phase-5 date; fail-boot on default secret.
- OD-6: keep every-login inbox code under the new regime (recommend keep — it
  is a second factor in practice — but confirm product intent).
- OD-7: purge retention (proposed 90 d) and audit-log destination for
  reuse/revoke events (logs now are `print()` — needs a home).
