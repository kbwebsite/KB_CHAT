# WAVE 4A — Index audit

## GOOD (OBSERVED — cover the hot paths)

- `ix_messages_conv_id (conv,id)`, `ix_messages_conv_created (conv,created)`
  → history pagination + ordering.
- `ix_conv_member_conv_user`, `ix_conv_member_user` → membership checks both
  directions; `uq_conversation_user`, `uq_channel_follow`, `uq_block_pair`,
  reaction/vote/save/highlight/push UQs → integrity + point lookups.
- `auth_sessions`: `refresh_hash` unique, `family_id`, `status`,
  `(status,expires_at)` → refresh + sweep paths.
- `verification_codes`: `code_hash` unique, `(email,created_at)` → code flows.
- `statuses (user,created)`, `status_viewers (status,viewer)` → scoped feeds.
- All association/child FKs indexed (members, reactions, votes, follows,
  responses, attachments.message, posts.channel).

## MISSING (OBSERVED — FK or filter columns with no index)

1. `attachments.uploader_id` (`message.py:116`) — unindexed FK.
2. `conversations.created_by` (`conversation.py:25`) — unindexed.
3. `group_events.creator_id` (`event.py:11`) — unindexed.
4. `polls.creator_id` (`poll.py:27`) — unindexed.
5. `scheduled_messages.sender_id` (`scheduled.py:11`) — unindexed.
6. `status_highlights.cover_status_id` (`highlight.py:12`) — unindexed.
7. **Message content: no index at all** — every ILIKE search is a scan.
8. `statuses` feed has no `(is_deleted, created_at)`-style composite for the
   global-feed filter.

## POSSIBLY REDUNDANT (OBSERVED — harmless duplicates, do NOT churn)

- `ix_reaction_message` vs column index; `ix_call_caller/callee` vs column
  indexes; `ix_device_token_user` vs column index; `ix_saved_user` vs column
  index; `ix_users_username_lower/email_lower` duplicating unique indexes.
  Extra write cost each; removal is janitorial, not performance work.

## NEEDS MEASUREMENT (not assumed)

- Whether `ix_messages_sender` + `ix_messages_conv_created` suffice for
  leaderboard/aggregation (needs `EXPLAIN` on PG at size).
- Composite `(conversation_id, is_deleted, id)` for history-with-clear
  queries; `(user_id, created_at)` orderings for saved/stickers.
- FTS vs trigram (`pg_trgm`) for message/user search — decision needs
  dataset-size data first.
- PgBouncer/pool sizing — measure pool waits before changing.
