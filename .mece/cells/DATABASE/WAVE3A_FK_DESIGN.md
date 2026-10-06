# WAVE 3A — FK Design (recommendations, audit-only)

Rule applied per FK: CASCADE only when the child has no meaning without the
parent; SET NULL when the child must survive but the link is optional;
RESTRICT nowhere (no transfer/deletion UX exists — RESTRICT would brick
future account deletion; reconsider if a user-delete flow with ownership
transfer is ever built).

## The 8 bare FKs — recommendation each

| # | FK | Action | Reason | Risk / migration |
|---|---|---|---|---|
| 1 | `agent_conversations.user_id` | **CASCADE** | Private per-user data; meaningless without owner. No transfer UX. | Low. No app delete-user path; additive DDL only. |
| 2 | `agent_messages.conversation_id` | **CASCADE** | Aligns DDL with existing ORM `delete-orphan` (`agent.py:19-20`); agent test deletes conv expecting messages gone (`test_agent.py:68`). | Low. Behavior already proven by test. |
| 3 | `communities.owner_id` | **SET NULL + make nullable** | Community is shared (others' groups, follows of sub-groups); deleting the umbrella on owner-delete destroys shared structure. Precedent: `messages.sender_id`. | Medium. Column must become NULL first (backfill: none possible — see note). Frontend owner display must tolerate null (**OD-W3-1**: frozen-community governance — who posts/deletes after?). |
| 4 | `conversations.created_by` | **SET NULL** | Provenance only; conversation must survive creator. Column already nullable → DDL-only, zero data risk. | Low. Display already null-tolerant (rarely shown). |
| 5 | `broadcast_lists.owner_id` | **CASCADE** | Single-owner tool; fan-out messages live independently in 1-1 convs. Deleting the list with the owner loses nothing shared. | Low. |
| 6 | `messages.reply_to_id` | **SET NULL** | Reply must survive parent deletion (matches `is_deleted` placeholder UX in `messages.py`). Column already nullable → DDL-only. | Low. Code already guards `reply_to` missing. |
| 7 | `channels.owner_id` | **SET NULL + make nullable** | Shared: followers + others' read state; CASCADE would nuke others' posts. Same governance follow-up as #3 (**OD-W3-1**). | Medium. Owner-only gates 403 for everyone post-null until governance rule lands — acceptable interim (frozen, not lost). |
| 8 | `channel_posts.sender_id` | **SET NULL + make nullable** | Post content must survive author; matches `messages.sender_id` precedent. Requires NULL change (currently NOT NULL). | Medium. Sender display must tolerate null (same pattern as message sender). |

Backfill note for #3/#7/#8: no orphan rows can exist for *user* parents today
(no user-delete path), so NULL-ification is schema-only; the work is the
nullable-column change + display/governance handling, not data repair.

## auth_sessions — explicitly analyzed, NO CHANGE

`auth_sessions.user_id → users.id CASCADE` (`auth_session.py:22`) is correct:
sessions have no meaning without the account, must die on account deletion
(Wave 2 §4.14), and the Wave 2 services rely on user-scoped revocation, not
DB cascades. `user_sessions.user_id CASCADE` likewise correct. No action.

## Already-correct spot checks (no change)

- `call_history.*` SET NULL ×3: history preserved by design (`call.py:8-10`).
- `polls.creator_id`, `group_events.creator_id`, `scheduled.sender_id`,
  `attachments.uploader_id`, `messages.sender_id` SET NULL: authorship pattern.
- `status_highlights.cover_status_id` SET NULL: highlight survives cover delete.
- All membership/link/vote/viewer/reaction/attachment/setting/token rows
  CASCADE: no independent meaning. Correct.

## What is NOT recommended

- RESTRICT anywhere (bricks future GDPR-style deletion; no admin UX to resolve).
- `passive_deletes` additions (changes flush semantics; separate perf wave).
- Touching the 48 good FKs (churn without benefit).
- FK-ing the JSON/int pseudo-relations (`member_ids`, `correct_option_id`,
  read cursors) — app-level cleanup instead (Wave 3B decides per case; the
  member-list staleness needs product input).

## Migration requirements per change class

- DDL-only (`#4`, `#6`, plus all already-correct): PG `ALTER TABLE ...
  DROP CONSTRAINT ... ADD FOREIGN KEY ... ON DELETE ...`; SQLite: nothing
  required (unenforced; new DBs inherit from `create_tables`).
- Nullable + DDL (`#3`, `#7`, `#8`): PG `ALTER COLUMN DROP NOT NULL` then
  constraint swap; SQLite: table rebuild (its `ALTER` can't drop NOT NULL
  portably) — or fresh dev DBs (documented, dev-only).
- Pre-migration orphan scan mandatory on staging (queries in REPORT §8);
  expected zero (no user-delete path), but Postgres ALTER will fail closed
  if wrong — that failure IS the safety net.

## Unresolved decisions

- **OD-W3-1**: ownerless community/channel governance (frozen vs heir vs
  admin-takeover). Blocks #3/#7 behavior-complete status, not the DDL.
- **OD-W3-2**: orphan-scan sign-off on staging copy before prod ALTER.
- **OD-W3-3**: pseudo-relations (`member_ids`, `correct_option_id`) — app
  cleanup vs leave-stale (product input).
