# Moderation Console (2026-10-10 UTC)

## 1. Scope

No platform safety tooling existed (only per-group owner/admin roles;
`User` had no admin flag — `agent.py` even notes its absence). This
adds: user reporting, an admin-gated moderation queue with resolutions,
and admin user management, end to end (API + UI + e2e).

## 2. Backend

- `users.is_admin` nullable flag (NULL reads as False; auto-migrated on
  old DBs) + `ADMIN_EMAILS` env allowlist bootstrap (no admin by
  default). Reads use `getattr`/helper so pre-migration rows never 500.
- New `reports` table + `/api/moderation/*`: any user files reports
  (message/user/conversation, validated reason/target); admins list
  (open/resolved/all), resolve (`dismissed` | `message_deleted` →
  soft-delete | `user_deactivated`), manage users (search, deactivate,
  reactivate). Self/other-admin deactivation refused; resolutions are
  recorded, reports never deleted.
- `/api/auth/me` exposes `is_admin` for the signed-in user only.

## 3. Frontend

- Message menu → Report (non-own messages) → reason dialog → toast.
- `/admin` route behind `AdminOnly` (non-admins bounce to /chat);
  Settings shows a gated Moderation entry for admins only.
- Console: Reports tabs (open/resolved/all) with target snippets and
  per-row actions; Users search with deactivate/reactivate.

## 4. Verification (OBSERVED)

- Backend `test_moderation.py`: 5 passed (gating, validation, full
  report→resolve flow, deactivation guards, direct actions + `/me` flag).
- Frontend `moderation.test.ts`: 2 passed (reasons + submit contract,
  failure keeps dialog open).
- E2E `moderation.spec.ts`: 2 passed (non-admin bounce; API report →
  console resolve → server truth verified).
- `tsc` clean on all touched files; full suites green except one
  pre-existing failure in `channelEdit.test.ts` caused by parallel
  in-flight ChannelsPanel work (untouched by this change).
