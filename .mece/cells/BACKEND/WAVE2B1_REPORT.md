# WAVE 2B-1 REPORT — persistent auth session foundation (2026-10-06 UTC)

## 1. Exact files changed

| Action | File |
|---|---|
| CREATE | `backend/app/models/auth_session.py` (`AuthSession`, table `auth_sessions`) |
| CREATE | `backend/app/services/auth_sessions.py` (session primitives) |
| CREATE | `tests/test_auth_sessions.py` (16 tests) |
| CREATE | `.mece/cells/BACKEND/WAVE2B1_REPORT.md` (this file) |
| EDIT (1 line each) | `backend/app/models/__init__.py` (import + `__all__`), `backend/app/main.py` (model import for table registration) |

NOT changed: `frontend/**`, `backend/app/websocket/**`, `backend/app/auth/**`,
`backend/app/api/**`, `backend/app/services/{users,groups,channels,errors}.py`,
`user_sessions` model/table, login flow, `get_current_user`.

## 2. DB schema created

`auth_sessions`: `id` String(36) PK = sid · `user_id` int FK `users.id CASCADE`
NOT NULL indexed · `family_id` String(36) NOT NULL indexed · `refresh_hash`
String(64) NOT NULL **UNIQUE** indexed · `status` String(16) NOT NULL default
`active` indexed · `rotated_from_hash` String(64) NULL · `used_at /
revoked_at` tz-NULL · `revoke_reason` String(32) NULL · `device_info /
browser_info` String(200) NULL · `ip_address` String(45) NULL ·
`created_at / last_used_at` tz NOT NULL (server_default now) · `expires_at` tz
NOT NULL · composite `ix_auth_sessions_status_expires(status, expires_at)` for
purge. No field beyond WAVE2_AUTH_DESIGN §7. `is_current` deliberately not
stored (derived from calling `sid`, per design).

## 3. Migration details

- Tooling: the project has **no Alembic harness** (`backend/alembic/`,
  `backend/migrations/`, `alembic.ini` all absent); schema evolves via
  `create_tables()` (per-table `checkfirst`, DuplicateTable-tolerant,
  `connection.py:65-82`) + `_ensure_missing_columns`. The design (§12) already
  anticipated this path.
- Upgrade: model registration → `create_tables()` creates `auth_sessions`
  additively; verified by inspector test (`test_migration_upgrade_and_downgrade`).
  Zero existing rows touched; `user_sessions` untouched; old JWTs unaffected.
- Downgrade/reversible: `AuthSession.__table__.drop(checkfirst=True)` removes
  it cleanly; test drops then re-upgrades and re-verifies. Nothing reads the
  table yet, so rollback = ignore or drop.

## 4. Session lifecycle (as implemented)

`create_session` (new family) → `active`; `refresh_session` rotates
(active→`used`, successor `active`, same family, `rotated_from_hash` linked);
`used` + reuse ≤30 s → rotate again, intermediate successor `revoked
(superseded)`; `used` + reuse >30 s → whole family `revoked (reuse)`;
`revoke_session` / `revoke_family` / `revoke_user_sessions(except_sid)` set
`revoked` + reason; expiry is lazy (`expires_at` checked on access) +
`purge_sessions` deletes non-active rows past retention.

## 5. Refresh-token storage approach

`secrets.token_urlsafe(32)` (256-bit, opaque, never JWT); **only
`sha256` hex persisted** (`hash_refresh_token`); UNIQUE constraint doubles as
the concurrency guard (first writer wins, loser gets retryable 401).
Plaintext exists only as a function return value for later transport layers;
no logging of tokens anywhere (service logs nothing at all).

## 6. Security properties verified (by test)

- Plaintext never persisted (`test_refresh_hash_never_plaintext`, column scan).
- Old token dead after rotation; late reuse → family revoked, successor dead
  (fail-closed, `test_old_token_invalid_after_grace_and_family_revoked`).
- Revoked sessions cannot refresh; sibling device unaffected
  (`test_explicit_revoke_and_sibling_untouched`).
- Expired sessions cannot refresh (`test_expired_session_cannot_refresh`).
- Family revocation scoped to one family (`test_family_revoke_scoped_to_family`).
- Unknown token → 401 with zero side effects; unknown `sid` revoke → 404.
- Inactive user → refresh denied (`test_inactive_user_cannot_refresh`).
- In-grace concurrent reuse converges to one valid token
  (`test_in_grace_reuse_rotates_again_and_converges`).

## 7. Tests added

`tests/test_auth_sessions.py`: 16 tests covering all 12 required areas
(creation, hashing, validation, rotation, old-token invalidation, expiry,
explicit + family revocation, reuse detection, uniqueness, invalid/nonexistent,
inactive user) plus migration upgrade/downgrade, per-user scoping with
`except_sid`, purge semantics, and sid-bearing access-token shape. One failure
found and fixed during development (SQLite naive-datetime roundtrip in the
creation assertion — test-side only, service was already normalizing).

## 8. Full test results

- Focused: **16 passed** (~6 s).
- Full backend: **101 passed / 0 failed** (~111 s) = baseline 85 + 16 new.
- `npx tsc --noEmit`: exit 0. `npm run build`: success (~47 s, pre-existing
  chunk-size warnings only).

## 9. Existing auth compatibility

`get_current_user`, login/signup/verify/OAuth, 7-day JWTs, `user_sessions`
endpoints, WS auth: all byte-identical (no files touched). New code paths are
additive and unread by old code. `issue_access_token` reuses existing
`create_access_token`; new `sid`/`jti` claims are ignored by current decode
(forward-compatible; verified in test via `decode_token`).

## 10. Open decisions still unresolved

OD-1 (TTLs) · OD-2 (HS256 vs RS256) · OD-3 (absolute refresh cap) · OD-4
(native transport signal) · OD-5 (legacy cutoff) · OD-6 (keep inbox code step) ·
OD-7 (audit-log home). None finalized.

## 11. Temporary / provisional values (all in `services/auth_sessions.py` only)

`REFRESH_TTL_DAYS=30`, `REUSE_GRACE_SECONDS=30`, `ACCESS_TOKEN_MINUTES=15`,
`PURGE_RETENTION_DAYS=90`. Narrowest defaults needed to implement; no
irreversible behavior built on them (all are parameters, overridable per call).

## 12. Risks discovered

1. **Design deviation (documented, minimal)**: in-grace reuse cannot re-issue
   the *same* pair without storing plaintext, so it rotates again and marks the
   intermediate `superseded`. Observable difference vs design text is confined to
   the ≤30 s grace window; theft response (late reuse ⇒ family revoke) is exact.
2. **Naive datetimes from SQLite**: service normalizes to UTC on every read
   (`_aware`); Postgres path unaffected. Any future raw SQL on this table must
   do the same.
3. **`user_id` CASCADE**: account delete wipes families (intended, §4.14) — no
   orphan risk, but no audit trail either until OD-7 is resolved.

## 13. Exact next step (Wave 2B-2, NOT started)

Wire issuance + refresh + logout API (`POST /auth/refresh`, session-aware
logout, login minting behind `SESSION_ISSUE_ENABLED` flag) reusing
`create_session / refresh_session / revoke_session` unchanged; add cookie/body
transport + strict refresh rate-limit entry. No frontend, WS, or enforcement yet.
