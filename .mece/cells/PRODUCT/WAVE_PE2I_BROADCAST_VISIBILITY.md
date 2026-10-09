# WAVE PE-2I — Broadcast Delivery Visibility (2026-10-09 UTC)

## 1. Inspected architecture (OBSERVED)

- Broadcast send IS persisted: one real `Message` row per recipient 1-1 DM
  (`api/broadcasts.py` send handler, `message_type: text`,
  `"status": "sent"` at creation).
- Per-recipient delivery/read IS persisted as DM cursor state
  (`ConversationMember.last_delivered_message_id` /
  `last_read_message_id`), queryable via existing
  `GET /messages/{id}/receipts` — member-only, **sender-only** (owner is
  the sender, so authorized). Buckets derived identically to the bubbles:
  read ≥ id → Read; else delivered ≥ id → Delivered; else Sent
  (`utils/receipts.py` tick semantics).
- `sent_to` = user ids for whom a Message row was created + WS fan-out
  attempted = **accepted for delivery** — NOT delivered/read.
- No send-history table; nothing links a past send to its messages.

## 2. Path chosen: A-minimal

Real status data exists and is queryable per message by the sender. The
only gap was identity: the send response carried no message ids, so the
owner could never address the receipts endpoint. Minimal additive fix
below — no receipt subsystem built (it already exists).

## 3. Changes (IMPLEMENTED)

- Backend (`api/broadcasts.py` only): send response gains additive
  `sent: [{user_id, conversation_id, message_id}]`; `sent_to` + message
  string byte-identical (compatibility preserved). No schema/migration.
- Frontend `BroadcastPanel`: after a successful send, an in-memory
  last-send card ("Delivery · {list} · N sent — Just now") with an
  expandable per-recipient view. Each row resolves ONE receipts call into
  the exact server bucket label (Sent/Delivered/Read + matching tick
  icon); names come from the receipts entries themselves. Manual Refresh,
  error + Retry, per-row "Open chat" (new optional `onOpenChat`, threaded
  from `ChatSidebar` like `ContactsPanel`). Skipped recipients
  (blocked/deleted/self) are not shown — no truthful record exists for
  them. Last-send clears on new send/empty send/list delete; never
  persisted, never history, no polling.
- `services/api.ts`: no new helper needed (`msgApi.receipts` pre-existed).

## 4. Authorization/privacy (OBSERVED + IMPLEMENTED)

Receipts endpoint enforces sender-only + membership server-side (pinned by
a 403 test for recipients); member dicts expose only
id/username/display_name/avatar_url; no content in URLs; failure messages
generic; skipped recipients never enumerated (no block-state oracle).

## 5. Tests (VERIFIED)

- Backend (`test_broadcast_members.py` +2, 12/12 file green): `sent`
  maps 1:1 to `sent_to` with real conv/message ids; receipts start all
  Sent; delivered→read upgrades flow through real cursors; recipient
  receipts access is 403.
- Frontend (`broadcastDelivery.test.ts` 5/5): affordance after send with
  zero prefetch; bucket-faithful labels; untouched recipients pinned to
  Sent (no invented Read/Delivered); error + retry; per-row chat open with
  the true `conversation_id`.

## 6. Build results (VERIFIED 2026-10-09)

- Backend full suite: **164 passed / 11 skipped** (162 + 2 new), 0 failures.
- Frontend full suite: **124 passed** (119 + 5 new), no errors.
- TypeScript `tsc`: clean. Vite build: success (pre-existing chunk
  warning). `git diff --check`: clean. PE-2G membership flows untouched
  (all 16 broadcast tests green); test isolation intact (dev DB untouched).

## 7. Limitations

- Visibility covers only the just-completed send in the current session;
  reopening the panel loses it (no send-history table — deliberate).
- Statuses are point-in-time per fetch; Refresh is manual.
- One receipts request per recipient on expand (bounded by MAX 50).

## 8. Recommended PE-2J

Product-side follow-ups (settings polish, channel analytics already
deferred); no backend receipt work remains — the subsystem is complete.
