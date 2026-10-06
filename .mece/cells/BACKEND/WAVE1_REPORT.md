# WAVE 1 REPORT — backend service foundation (2026-10-06 UTC)

## 1. Executive summary

Wave 1 introduced a real, used service boundary (`backend/app/services/`: `errors.py`,
`users.py`, `groups.py`, `channels.py`) and moved group, channel, invite, and
password business logic out of five route modules, without changing any URL,
request/response shape, status code, message, or authorization semantic. The
duplicate `PATCH /users/me/password` is resolved to exactly one active route.
Backend suite: **85 passed / 0 failed** (baseline 74 + 11 new). `tsc --noEmit`
clean, `vite build` succeeds. No frontend file changed (content diff empty), no
auth redesign, no DB migration, no Redis/Celery, WebSocket code untouched.

Commits (on top of `9cfab5d`):
- `b8c6079` backend: wave1 map/precheck plus service error foundation
- `bc30cbb` backend: users password service plus consolidate duplicate endpoint
- `b2e0cce` backend: groups service for conversations plus groups routers
- `541a81b` backend: channels service plus shared missing-field sentinel
- (this report) backend: wave1 quality review and final report

## 2. Files changed

| Commit | Created | Edited |
|---|---|---|
| `b8c6079` | `.mece/cells/BACKEND/WAVE1_PRECHECK.md`, `WAVE1_MAP.md`, `backend/app/services/errors.py` | — |
| `bc30cbb` | `backend/app/services/users.py`, `tests/test_password.py` (6 tests) | `backend/app/api/users.py` (thin password route), `backend/app/api/extended.py` (removed shadowed handler + dead import) |
| `b2e0cce` | `backend/app/services/groups.py`, `tests/test_groups_service.py` (4 tests) | `backend/app/api/groups.py` (all 8 endpoints delegate), `backend/app/api/conversations.py` (group-create branch + 4 admin endpoints delegate) |
| `541a81b` | `backend/app/services/channels.py`, `tests/test_channels_service.py` (1 test, 12 asserts) | `backend/app/api/channels.py` (all 8 endpoints delegate), `backend/app/services/errors.py` (`MISSING` sentinel), `backend/app/services/groups.py` (import sentinel from `errors`) |

NOT changed: `frontend/**` (verified `git diff HEAD --stat -- frontend` empty),
`backend/app/websocket/**`, `backend/app/auth/**`, `backend/app/models/**`,
`backend/app/main.py` (router order untouched), `messages.py` (incl. its
`from app.api.extended import _blocked_pair`, `extended.py:272` — left as debt).

## 3. Service boundaries introduced

- `services/errors.py` — `ServiceError(status_code, detail)` + `not_found /
  forbidden / bad_request / unauthorized` + `MISSING` sentinel + `service_route`
  decorator (sync + async) translating `ServiceError → HTTPException` with
  identical status/detail. ~15 lines of convention, no framework.
- `services/users.py` — `change_user_password` (length rule, bcrypt verify/hash,
  commit). Layer rule established: **routes validate shape, services decide and
  mutate, routes format responses**.
- `services/groups.py` — `create_group`, `update_group_details`,
  `add_group_members`, `remove_group_member(allow_self_leave)`,
  `set_group_member_role` (returns `(conv, role)`), invite get/rotate/disable/join.
  Preserves both router policies, incl. owner hand-off + sole-owner group-delete
  and the empty-title update nuance (via `MISSING`).
- `services/channels.py` — `get_channel`, `require_reader`, `list/create/update/
  delete/follow/unfollow/posts/create_post`. Presenters (`_channel_to_dict`,
  `_post_to_dict`) deliberately stayed in the route (presentation, not rules).

Deliberately NOT created: `services/auth|chats|extended|messages/*` — Wave 1
scope stops at domains with clear, testable rules and low WS/transaction risk.

## 4. Routes migrated

- `users.py`: `PATCH /me/password` → thin (Pydantic + service + same envelope).
- `extended.py`: dead `PATCH /users/me/password` removed (17 lines + import).
- `groups.py`: all 8 endpoints delegate (create/update/add/remove/invite×3/join).
- `conversations.py`: group-create branch + `PATCH/POST/DELETE/PATCH /groups/...`
  (update/add-members/remove-member/set-role) delegate. 1-1 create, list, get,
  delete, read/unread/pin/archive/disappearing intentionally stay (debt §10).
- `channels.py`: all 8 endpoints delegate; `_get_channel/_require_reader` kept as
  one-line compat wrappers (no external importers, verified by grep).

## 5. Duplicate password endpoint resolution

- Before: `users.py:283` (`PATCH /me/password` via prefix `/api/users`, Pydantic,
  "Password must be at least 6 characters"/"Current password is incorrect"/
  "Password changed successfully") and `extended.py:19` (`PATCH
  /users/me/password` via prefix `/api`, raw dict, different messages).
  Same full path; `users_router` included first (`main.py:199` vs `:210`), so
  FastAPI always served the `users.py` handler — `extended.py`'s was dead.
- After: exactly one registration — proven by
  `test_exactly_one_password_route_registered` (route-table probe) plus a live
  import probe (`170 api routes, dupes: NONE` except pre-existing `GET
  /api/storage`, which is out of scope and untouched).
- Contract kept: path, `{current_password, new_password}` keys (matches
  `frontend/src/services/api.ts:249`), Pydantic 422 on missing fields, 400
  messages, success envelope, auth requirement, bcrypt verify+hash.

## 6. Error-handling changes

- No message, status, or envelope changed anywhere. `service_route` translates
  `ServiceError` to the identical `HTTPException`; unexpected exceptions
  propagate as before. New convention documented in `errors.py` docstring and
  `WAVE1_MAP.md`. No global exception framework added.

## 7. API compatibility verification

- Route-table probe: no new/removed/duplicate paths except the intended dead
  handler removal (net path set unchanged — one shadowed route deleted).
- Frontend callers re-checked: `changePassword` (`api.ts:249`), `convApi`
  group methods, `groupInviteApi`, `channelApi` — all hit unchanged paths with
  unchanged payloads; response envelopes/messages asserted in new tests.
- `git diff HEAD --stat -- frontend` is empty: zero frontend changes.

## 8. Tests executed / results

- Baseline (pre-change, Commit 1): `74 passed` in ~118s.
- Focused after users/groups/channels: `test_password.py` 6/6,
  `test_groups_service.py` 4/4, `test_channels_service.py` 1/1 (12 asserts),
  group/invite/member subset of `test_api.py` 8/8.
- Final full suite: **85 passed / 0 failed** in ~148s (`74 + 11 new`).
- `npx tsc --noEmit` → exit 0. `npm run build` → success in 34.65s
  (only pre-existing >600kB chunk-size warnings).
- No failures at any stage; no test needed modification (no behavior changed).

## 9. TypeScript / build results

See §8. Frontend was not touched; checks were run purely as regression evidence.

## 10. Remaining backend architectural debt (not Wave 1)

1. 1-1 conversation create, conversation list aggregation, message send/read
   fan-out, forward/export/clear, auth flows, uploads, calls, polls/events —
   still route-inline (next service candidates, hardest: WS-coupled send path).
2. Pre-existing duplicate `GET /api/storage` (`extended.py` vs `insights.py`) —
   found by route probe, untouched (Wave 4/consolidation).
3. `messages.py:272` imports `_blocked_pair` from `extended` (cross-router
   coupling); `get_or_create_settings` micro-duplicated in `services/groups.py`
   (documented; candidate `services/settings.py` helper later).
4. Waves 2–4 items per brief: JWT/session redesign, revocation, distributed
   rate-limit/WS/reset-tokens, FK/ondelete migration, export/status caps.

## 11. Recommended Wave 2 tasks

1. Token/session redesign (short-lived access + rotation + revocation) — the
   service seam makes this pluggable now (`get_current_user` untouched this wave).
2. Migrate message send/read to services (needs WS fan-out contract first).
3. `services/settings.py` extraction (own `get_or_create_settings`, kill stub).
4. Consolidate `GET /api/storage` + sessions stub (same pattern as password fix).

## 12. Known limitations

- `service_route` relies on `functools.wraps` signature preservation (standard,
  FastAPI follows `__wrapped__`; proven by 85 green incl. validation tests).
- New tests use time+pid-suffixed usernames against the dev sqlite file, same as
  existing suites; no isolation framework added.
- `git status` shows `M` flags on untouched files — verified stat-only
  (`git diff HEAD --numstat` empty; `hash-object == ls-files` hash); no content
  to preserve and nothing was reset/stashed/cleaned.
- Untracked `backend/tmp_*.db-shm/-wal` and one `uploads/*.txt` are pre-existing
  test/run artifacts, left in place.
