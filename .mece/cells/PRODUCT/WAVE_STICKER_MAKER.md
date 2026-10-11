# WAVE — AI Sticker Maker (2026-10-11 UTC)

## 1. Objective

Let users describe → generate → keep custom stickers, using the
existing image endpoint. The missing capability was real: packs were
builtin-seeded only, with no create/add endpoints — so this wave adds
the smallest safe backend contract for owner-scoped packs.

## 2. Backend contract (new, minimal)

- `StickerPack.owner_id` nullable FK users CASCADE (NULL = builtin/global;
  auto-migration safe, same pattern as `users.is_admin`).
- `POST /api/sticker-packs {name}` → owner-scoped pack (400 on blank).
- `POST /api/sticker-packs/{id}/stickers {image_url, emoji?}` →
  owner-only (others/builtin masked as 404, no oracle); http(s) ≤500 chars;
  cap 60/pack.
- `DELETE /api/sticker-packs/{id}` → owner-only, cascade deletes stickers.
- `GET /sticker-packs` now returns builtin + own packs only, with
  `is_owner` per pack. Recent/use/favorite flows untouched.

## 3. Frontend

StickerPicker gains an ✨ New tab: prompt → Generate (existing image
endpoint, honest busy error) → preview → optional emoji → save into an
existing own pack or a named new pack → list refreshes and activates it.
Builtin packs never appear as save targets. Picker/use/recent behavior
unchanged.

## 4. Tests (VERIFIED)

- Backend `test_sticker_packs.py` (5): create + validation, list
  isolation, add/auth/validation, cap, delete cascade + builtin
  immutability.
- `stickerMaker.test.ts` (4): full generate→new-pack flow, existing-pack
  path (no duplicate create), honest generation/save failures, builtin
  exclusion. Debugging these caught a REAL UX bug: picking an existing
  pack while the name field held text created a new pack instead — select
  choice now wins outright.

## 5. Build results (VERIFIED 2026-10-11)

- Frontend: **265 passed / 41 files**, no errors.
- Backend: **181 passed / 11 skipped** (176 + 5 new).
- `tsc`: clean. Vite build: success (pre-existing chunk warning).
- `git diff --check`: clean.

## 6. Files changed

- `backend/app/models/sticker.py` — `owner_id` column.
- `backend/app/api/stickers.py` — pack CRUD + scoped list.
- `tests/test_sticker_packs.py` — new.
- `frontend/src/services/api.ts` — 3 helpers.
- `frontend/src/components/StickerPicker.tsx` — maker view.
- `frontend/src/components/__tests__/stickerMaker.test.ts` — new.
- This report.

## 7. Limitations

- Generated art depends on the image backend (honest error otherwise).
- No sticker delete/edit yet; packs cap at 60; no pack sharing.
