# WAVE 2B-2 REPORT — session auth API (2026-10-06 UTC)

## 1. Files changed

| Action | File |
|---|---|
| EDIT | `backend/app/database/config.py` (+`SESSION_ISSUE_ENABLED: bool = False`) |
| CREATE | `backend/app/api/session_auth.py` (`POST /refresh`, `GET /sessions`, `DELETE /sessions/{id}` + transport/CSRF/device helpers) |
| EDIT | `backend/app/api/auth.py` (login/verify-login/firebase/google issue sessions when flagged; logout revokes `sid` + clears cookie; `Request`/`Response` params added — no path/schema changes) |
| EDIT | `backend/app/main.py` (register `session_auth_router`; 1 import + 1 include) |
| EDIT | `backend/app/services/auth_sessions.py` (grace fix: `used_at` stamped on first rotation only, so replay cannot extend the window) |
| CREATE | `tests/test_session_auth.py` (16 tests) |
| CREATE | `.mece/cells/BACKEND/WAVE2B2_REPORT.md` (this file) |

NOT changed: `frontend/**` (diff empty), `backend/app/websocket/**`,
`get_current_user`, password-change/reset handlers, `user_sessions`, signup flow.

## 2. API endpoints added/changed

- Added `POST /api/auth/refresh` (cookie `kb_refresh`, provisional body
  `refresh_token` for native/OD-4) · `GET /api/auth/sessions` (own active
  sessions, safe metadata) · `DELETE /api/auth/sessions/{id}` (own only).
- Changed: login/verify-login/firebase/google responses gain a session-backed
  short JWT + `expires_in: 900` + `Set-Cookie` **only when flagged**; logout
  revokes the calling `sid` (when present) + clears the cookie, else legacy.
- Route probe: 14 `/api/auth/*` paths, zero duplicates/conflicts.

## 3. Feature flag behavior

Single flag `SESSION_ISSUE_ENABLED` (default False). OFF: login emits legacy
7-day JWT with no `sid`/`jti`, no `Set-Cookie`; `/refresh` 401s (no
accidental breakage — legacy clients never call it); `/sessions` returns
`[]`; logout is presence-flip + harmless cookie clear. ON: issuance, rotation,
revocation, listing all live. Verified by dedicated tests in both modes.

## 4. Login lifecycle

Password(/code/OAuth) validation byte-identical → `maybe_issue_session`
creates family row (device UA + XFF-aware IP) → `Set-Cookie` → access JWT
`{sub, username, sid, jti, exp≈15m}`. Failure paths (401/400/403) untouched.
Signup intentionally still legacy (documented follow-up; registration ≠ login).

## 5. Refresh lifecycle

Cookie (Origin-gated) or body token → `refresh_session` (unknown/expired/
revoked/reused-past-grace → 401; in-grace → rotate-again + supersede) →
new access JWT (new `sid`) + rotated cookie. Response body carries access
token + `expires_in` + user; **refresh plaintext never appears in bodies**
(asserted) or logs (service logs nothing).

## 6. Logout lifecycle

Bearer `sid` extraction (no new dependency) → `revoke_session(logout)`,
unknown `sid` ignored → clear cookie → 200 always. Legacy tokens unaffected
(no `sid` → presence-only, as before). Repeat logout 200. Sibling sessions
verified alive after logout.

## 7. Session list/revocation behavior

List: caller's `active` rows only, ordered by recency, fields
`id/device/browser/ip/is_current/last_used/created/expires` — no hashes,
tokens, or secrets (asserted on raw body). Delete: own → 200 (repeat 200);
current `sid` → 400 ("use logout", mirrors legacy sessions rule); unknown or
other-user → identical 404 (no enumeration).

## 8. Cookie/transport security

`kb_refresh`: `HttpOnly`, `Path=/api/auth`, `SameSite=Lax`,
`Max-Age=30d`; `Secure` **iff `APP_ENV==production`** (explicit, tested both
branches) so local HTTP dev keeps working. Native body-token path exists as
provisional OD-4 (no cookies required); no JS-readable token storage added.

## 9. CSRF decision

Refresh is POST-only with no cookie-read GETs. When `Origin`/`Referer` is
present (always, for browser cross-site POSTs) its host must be in
CORS-allowlist hosts or the request host, else 403 (tested: evil → 403,
allowlisted → 200). Absent origin (native/curl) → allowed, because body
tokens are not ambient credentials — CSRF without a cookie is meaningless,
and known-token presentation is theft (handled by rotation/reuse), not CSRF.
No CSRF-token framework: rotation + SameSite + Origin check is proportionate.

## 10. Concurrency behavior

Three rapid same-token refreshes → three 200s, three distinct pairs/sids
(grace rotation converges; single-valid-token invariant holds via
`superseded` intermediates). Service race on insert → `IntegrityError` →
rollback + retryable 401 (no corruption).

## 11. Reuse detection behavior

Follows 2B-1 semantics exactly: past-grace reuse → family revoked + 401
(API-verified: both old and successor tokens die). **Fix this wave**: `used_at`
is now stamped on first rotation only — previously each in-grace rotation
re-stamped it, letting rapid replay extend grace indefinitely.

## 12. Legacy compatibility

Flag-off tests prove: legacy login shape (no `sid`/`jti`, no cookie),
`get_current_user` acceptance, logout idempotence, empty sessions list.
Flag-on access tokens still pass `get_current_user` (new claims ignored).
Full pre-existing suite green in both modes (flag defaults off; new tests
toggle per-test via monkeypatch).

## 13. Tests and exact results

- New `tests/test_session_auth.py`: **16 passed** — issuance, cookie attrs,
  failure parity, rotation, unknown/malformed/expired/revoked, past-grace
  family kill, 3-way concurrency, CSRF evil/absent/allowlisted, logout
  revoke+repeat+sibling, list scoping/safety, delete own/repeat/current/
  unknown/other-user, password-change seam signature.
- Full backend: **117 passed / 0 failed** (~174 s) = 101 + 16.
- Debugging note: httpx `cookies.set(domain=...)` does not attach on
  TestClient — tests use explicit `Cookie` headers for ambient-credential
  cases (test-only finding, no app impact).

## 14. tsc/build results

`npx tsc --noEmit` exit 0. `npm run build` success (~35 s, pre-existing
chunk warnings only). Frontend untouched.

## 15. Remaining risks

1. Signup still mints legacy 7-day tokens while login mints 15-min + session
   (inconsistency to resolve in 2B-3).
2. No strict per-endpoint refresh rate limit yet (covered by existing
   `/api/auth` 30/min writes; dedicated limiter needs shared store — Wave 4).
3. `is_active=False` users keep usable access JWTs until 15-min expiry
   (refresh blocked immediately) — accepted tail, documented.
4. Reuse events are fail-closed but unwatched (OD-7 audit-log home still open).

## 16. Exact next step (NOT started)

Wave 2B-3: frontend migration (memory access token + refresh queue +
cookie/native handling) and WS `sid` enforcement + revocation sweep; then
password-change/reset `revoke_user_sessions` wiring (seam ready, signature
pinned by test). No legacy cleanup until Phase 5 cutoff.
