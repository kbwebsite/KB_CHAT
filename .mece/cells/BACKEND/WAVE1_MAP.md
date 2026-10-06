# WAVE 1 MAP — current backend (read-only survey, 2026-10-06 UTC)

Tree: `backend/app/` → `api/` (28 files: 27 routers + `disappearing.py` helper-only),
`models/` (16 files, 34 tables), `schemas/` (4 files), `services/` (**`__init__.py` 0 lines — no layer**),
`auth/` (`security.py` JWT/bcrypt, `dependencies.py` `get_current_user`),
`database/` (`connection.py` engine/SessionLocal/`get_db`/WAL/`_ensure_missing_columns`, `config.py` pydantic-settings),
`utils/` (`helpers.py` files, `privacy.py` presence/receipts-visibility, `receipts.py` status quorum,
`fcm.py` push, `email.py` mail), `websocket/` (`manager.py` fan-out, `chat.py` loop),
`middleware/__init__.py` (0 lines — middleware lives inline in `main.py:411-494`),
`main.py` (494L: lifespan loops, 25 `include_router` at `:198-225`, health/config/SPA, timing/rate-limit/headers).

## Route modules (prefix → endpoints)

- `api/auth.py` (`/api/auth`, 11): signup/login/verify-login/logout/me/firebase/google/forgot/reset/verify-email/send-verification. Logic: hashing, `_issue_code/_consume_code`, OAuth verify, in-memory `_reset_tokens`. Schemas: `UserCreate/UserLogin` only; rest raw `dict`.
- `api/users.py` (`/api/users`, 8): search/leaderboard/me-keys/keys/{id}/{username}/me/me-profile/**me-password**. Password handler (`:283-297`) is Pydantic-validated and **live** (registered first).
- `api/conversations.py` (`/api/conversations`, 13): list(batched `198-268`)/create(1-1+group)/get/delete/**groups/{id} CRUD + members + role**/disappearing/read/unread/pin/archive. Helpers `_is_member`, `_member_ids`, `conversation_to_dict` vs `_batched_dict`.
- `api/messages.py` (`/api`, 14): history(eager `178-189`)/send/edit/delete/react/read/delivered/receipts/view-once/search/pin/unpin/pinned. Own `SessionLocal` fan-out helpers (`:38-83`). Imports `_blocked_pair` from `extended` (`:272`).
- `api/groups.py` (`/api/groups`, 8): **create/patch/add-members/remove-member duplicated vs conversations.py** (divergent: self-leave + owner hand-off `:156-189`, no role endpoint) + invite get/create/disable/join (`:211-285`, live via `groupInviteApi`).
- `api/extended.py` (`/api`, 16): **change-password (`:19-35`, raw dict, SHADOWED — dead)** + forward/clear/block/unblock/blocked/export/mute/status/favorite/favorites/contacts/notifs/mark-read/recently-contacted/privacy/storage. Owner: `_blocked_pair` (`:202`).
- `api/channels.py` (`/api/channels`, 8): list/create/**update (no frontend caller — dead but active)**/delete/follow/unfollow/posts/post. Self-contained helpers `_channel_to_dict/_post_to_dict/_get_channel/_require_reader`.
- `api/communities.py`, `api/broadcasts.py`, `api/status.py`, `api/polls.py`, `api/events.py`, `api/scheduled.py`, `api/saved.py`, `api/calls.py`, `api/settings.py`, `api/stickers.py`, `api/insights.py`, `api/sessions.py`, `api/notification_settings.py`, `api/linkpreview.py` (SSRF guard), `api/highlights.py`, `api/extras.py`, `api/ai.py`, `api/agent.py`, `api/push.py` — not in Wave 1 scope except as noted debt.

## Business logic inside routes (Wave 1 candidates)

1. **users/password** — verify current + bcrypt + length rule, duplicated 2× (`users.py:283` live, `extended.py:19` dead). Smallest, highest confidence → first.
2. **groups** — create/update/add/remove/role/invite/join, duplicated across `groups.py` ↔ `conversations.py` with 3 semantic deltas (self-leave, owner hand-off + group-delete, role endpoint only in conversations). Real rules, real tests → second.
3. **channels** — owner/follower gates, name/desc validation, idempotent follow. Self-contained, mechanical → third.
4. **NOT migrated (documented debt)**: 1-1 conversation create (block-check + exact-pair search), conversation list aggregation, message send/read fan-out (WS-coupled), forward/export/clear, auth flows, uploads, calls, polls/events votes, AI/agent.

## Existing service-like / helper code (reuse, don't reinvent)

- `schemas/common.py:11-15` `success_response/error_response` (envelope; routes return dicts, no `response_model`).
- `auth/dependencies.py:10-29` `get_current_user` (401 on missing/invalid/inactive) — stays in routes as `Depends`.
- `utils/privacy.py` presence + `receipts_allowed`; `utils/receipts.py` quorum; `api/settings.py:get_or_create_settings` (imported by groups + conversations create paths — services will import it, no move).
- `api/conversations.py:conversation_to_dict` — presentation builder imported by `groups.py`; stays (route layer formats responses).
- No repository pattern anywhere; services take `db: Session` and own add/commit/refresh (matches current route behavior 1:1).

## DB session patterns

- Request scope: `Depends(get_db)` (`database/connection.py:48-53` yield+close). Manual `SessionLocal()` in WS loop, bg fan-out, scheduled/disappearing sweepers (required — request session is closed there). Wave 1 services are called inside request scope only → receive the request `db`, never open their own.

## Error behavior today (preserve)

- `HTTPException(status_code, detail="...")` → FastAPI `{detail}` envelope (4xx/5xx paths).
- `error_response()` → HTTP 200 `{success:false}` (only `auth.py` catch-alls).
- Frontend reads both (`detail` and `message` branches). Wave 1 convention: service raises domain error carrying `(status_code, detail)`; route translates to the **same** HTTPException it raised before — byte-identical status + message.
