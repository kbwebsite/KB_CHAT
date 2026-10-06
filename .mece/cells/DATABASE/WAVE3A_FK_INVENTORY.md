# WAVE 3A — FK Inventory (fresh, evidence-based, 2026-10-06 UTC)

> Audit only. No code, models, migrations, or tests modified. All paths are
> `backend/app/...` at HEAD `13fefca` unless noted. Verified behaviors:
> SQLite `PRAGMA foreign_keys = 0` (OFF — FKs unenforced on dev/test),
> 36 tables, inspector-confirmed DDL.

## Method

- `ForeignKey(` grep over `models/`: **56 FKs** across 21 files (counts below).
- `relationship(`/`cascade=`/`passive_deletes` grep: 8 `delete-orphan` chains,
  **zero** `passive_deletes` anywhere (ORM always loads-then-deletes).
- `db.delete(` (18 sites) + bulk `.query().delete()/.update()` (6 sites) +
  user-deactivation grep (**no user delete/deactivate endpoint exists**).
- Live-DB inspector spot checks (`auth_sessions`, `messages`) for DDL truth.

## The 8 FKs without ondelete (rechecked — matches prior audit)

| # | Child table.column | Parent | Nullable | Model evidence |
|---|---|---|---|---|
| 1 | `agent_conversations.user_id` | `users.id` | NO | `models/agent.py:11` |
| 2 | `agent_messages.conversation_id` | `agent_conversations.id` | NO | `models/agent.py:29` |
| 3 | `communities.owner_id` | `users.id` | NO | `models/community.py:22` |
| 4 | `conversations.created_by` | `users.id` | YES | `models/conversation.py:25` |
| 5 | `broadcast_lists.owner_id` | `users.id` | NO | `models/broadcast.py:17` |
| 6 | `messages.reply_to_id` | `messages.id` (self) | YES | `models/message.py:45` |
| 7 | `channels.owner_id` | `users.id` | NO | `models/channel.py:25` |
| 8 | `channel_posts.sender_id` | `users.id` | NO | `models/channel.py:68` |

DDL truth (inspector): these emit bare `REFERENCES` with no `ON DELETE`
(e.g. `messages.reply_to_id → ondelete: {}`). On SQLite: unenforced. On
Postgres (prod): parent delete → **FK violation, HTTP 500**.

## Full inventory (48 with ondelete + 8 above)

Conventions observed: user-owned private rows → `CASCADE`; content
authorship → `SET NULL` (nullable); everything else structural → `CASCADE`.

| Child → parent | Ondelete | Nullable | ORM cascade? | Notes |
|---|---|---|---|---|
| `auth_sessions.user_id → users.id` | CASCADE | NO | none (Wave 2; correct) | `auth_session.py:22` |
| `saved_messages.user_id → users.id` | CASCADE | NO | none | `saved.py:8` |
| `saved_messages.message_id → messages.id` | CASCADE | NO | none | `saved.py:9` |
| `call_history.caller/callee/conversation_id` | SET NULL ×3 | YES | none (history preserved by design) | `call.py:8-10` |
| `group_events.conversation_id` | CASCADE | NO | none from Conversation¹ | `event.py:10` |
| `group_events.creator_id → users` | SET NULL | YES | none | `event.py:11` |
| `event_responses.event_id` | CASCADE | NO | delete-orphan `event.py:20` | |
| `event_responses.user_id` | CASCADE | NO | none | |
| `device_tokens.user_id` | CASCADE | NO | none | `push_token.py:26` |
| `community_groups.community_id` | CASCADE | NO | none (bulk-deleted in route) | `community.py:36` |
| `community_groups.conversation_id` | CASCADE | NO | none | `community.py:42` |
| `conversation_members.conversation_id` | CASCADE | NO | delete-orphan `conversation.py:37` | |
| `conversation_members.user_id` | CASCADE | NO | none | |
| `statuses.user_id` | CASCADE | NO | none | `status.py:21` |
| `status_viewers.status_id` | CASCADE | NO | delete-orphan `status.py:35` | |
| `status_viewers.viewer_id → users` | CASCADE | NO | none | |
| `verification_codes.user_id` | CASCADE | NO | none | `verification.py:18` |
| `polls.conversation_id` | CASCADE | NO | none from Conversation¹ | `poll.py:23` |
| `polls.creator_id → users` | SET NULL | YES | none | `poll.py:28` |
| `poll_options.poll_id` | CASCADE | NO | delete-orphan `poll.py:40` | |
| `poll_votes.poll_option_id` | CASCADE | NO | delete-orphan `poll.py:56` | |
| `poll_votes.user_id` | CASCADE | NO | none | |
| `user_settings.user_id` | CASCADE | NO | none | `settings.py:20` |
| `blocked_users.blocker/blocked_id` | CASCADE ×2 | NO | none | `user.py:58-61` |
| `messages.conversation_id` | CASCADE | NO | delete-orphan `conversation.py:42` | |
| `messages.sender_id → users` | SET NULL | YES | none | `message.py:28` |
| `message_reactions.message_id` | CASCADE | NO | delete-orphan `message.py:59` | |
| `message_reactions.user_id` | CASCADE | NO | none | |
| `attachments.message_id` | CASCADE | NULL² | delete-orphan `message.py:62` | `message.py:107` |
| `attachments.uploader_id → users` | SET NULL | YES | none | |
| `notification_settings.user_id` | CASCADE | NO | none | |
| `notification_settings.conversation_id` | CASCADE | NULL | none from Conversation¹ | |
| `scheduled_messages.conversation_id` | CASCADE | NO | none from Conversation¹ | |
| `scheduled_messages.sender_id → users` | SET NULL | YES | none | |
| `user_sessions.user_id` | CASCADE | NO | none | `session.py:10` |
| `status_highlights.user_id` | CASCADE | NO | none | `highlight.py:10` |
| `status_highlights.cover_status_id → statuses` | SET NULL | YES | none | |
| `status_highlight_items.highlight_id` | CASCADE | NO | delete-orphan `highlight.py:17` | |
| `status_highlight_items.status_id` | CASCADE | NO | none | |
| `stickers.pack_id` | CASCADE | NO | delete-orphan `sticker.py:17` | |
| `user_stickers.user_id / sticker_id` | CASCADE ×2 | NO | none | |
| `channel_follows.channel_id / user_id` | CASCADE ×2 | NO | none (bulk-deleted in service) | `channel.py:39-48` |
| `channel_posts.channel_id` | CASCADE | NO | none (bulk-deleted in service) | `channel.py:64` |

¹ No ORM relationship from `Conversation` to events/polls/scheduled/
notification_settings/community_groups — DB-level CASCADE is the only
cleanup on Postgres; on SQLite these rows orphan (see REPORT §5).
² `attachments.message_id` NULL-able for pre-linked uploads (`uploads.py`
creates rows with `message_id=None`); orphan-if-abandoned, no reaper.

## Implicit (non-FK) relationships — no constraint possible

- `broadcast_lists.member_ids` JSON int list (stale on user delete; no FK).
- `polls.correct_option_id` plain int (dangles if option deleted).
- `conversation_members.last_read/delivered/cleared_before_message_id` ints.
- `User` model defines **zero** relationships (all edges child→parent only).
- No `ForeignKeyConstraint(`, no association-table objects, no cycles in FK
  graph (verified: `messages.reply_to_id` self-ref is the only self-edge;
  no table pair references both ways).

## Current behavior summary

- SQLite: FKs decorative; deletes succeed, orphans accumulate silently.
- Postgres: deletes succeed iff every affected FK has CASCADE/SET NULL or no
  referencing rows; the 8 bare FKs raise FK-violation 500s instead.
- ORM `delete-orphan` (8 chains) loads children then deletes row-by-row
  (correct on both DBs; N+1 on bulk, e.g. conversation delete).
- Bulk `.delete()/.update()` bypasses ORM cascades (6 sites) but aligns with
  DB CASCADEs; `communities.py:140`, `conversations.py:553-554` depend on it.
- **No code path deletes a `User`** (grep: no `delete(user)`, no
  `is_active=False` writes) — user-FK hazards are latent, not live.
