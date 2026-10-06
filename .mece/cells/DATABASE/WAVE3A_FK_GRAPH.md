# WAVE 3A — Deletion Dependency Graph (actual schema)

Legend: `--C→` DB+ORM cascade · `--c→` DB-only cascade (no ORM rel) ·
`--S→` SET NULL · `--?→` bare FK (PG-violation risk) · `--x→` no FK (app/JSON).

```
users
 ├──C→ conversation_members (memberships die with user AND conv)
 ├──C→ blocked_users (both directions)
 ├──C→ message_reactions, poll_votes, event_responses, status_viewers
 ├──C→ saved_messages, device_tokens, verification_codes, user_settings
 ├──C→ user_sessions, auth_sessions
 ├──C→ statuses ──C→ status_viewers; ──S→ status_highlights.cover
 ├──C→ status_highlights ──C→ highlight_items
 ├──C→ agent_conversations ──C→ agent_messages        [FK2 bare: ORM ok, PG gap]
 ├──?→ communities(owner) · channels(owner) · broadcast_lists(owner) · agent_convs [RECOMMENDED: S/C/S/C]
 ├──S→ messages(sender), attachments(uploader), polls(creator),
 │     group_events(creator), scheduled_messages(sender), call_history(caller/callee)
 ├──x→ broadcast_lists.member_ids JSON (stale ints, no cleanup)
 └──?→ conversations.created_by (nullable; RECOMMENDED S)

conversations
 ├──C→ conversation_members · messages ──C→ reactions · attachments
 │       └──?→ messages.reply_to_id self (RECOMMENDED S; thread survives)
 ├──c→ group_events ──C→ event_responses   [route deletes conv AFTER bulk member/message ops]
 ├──c→ polls ──C→ options ──C→ votes       [route ORM-deletes polls manually first]
 ├──c→ scheduled_messages · notification_settings · community_groups
 ├──C→ (ORM delete-orphan members/messages: loads-then-deletes, N+1)
 └──x→ read/delivered/cleared cursors (ints, die with member row — fine)

communities ──C→ community_groups (links only; member convs SURVIVE ✓)
channels ──C→ channel_follows · channel_posts (service bulk-deletes first)
broadcast_lists (leaf; fan-out msgs independent)
agent_conversations ──C(ORM)→ agent_messages
statuses ──C(ORM)→ viewers · ──C→ highlight_items? NO — items CASCADE to
           highlight AND status; deleting a STATUS cascades its items ✓
sticker_packs ──C(ORM)→ stickers · user_stickers CASCADE both parents
```

## Cascade chains (longest destructive paths)

1. `users →(C) statuses →(C) status_viewers` + highlights/items — whole
   presence history, one delete. Intended (account erasure).
2. `users →(C) conversation_members` does NOT cascade to conversations
   (correct: other members keep them) — but 1-1 convs become memberless;
   no reaper; frontend shows nothing (list is membership-driven). Benign.
3. `conversations → messages → reactions/attachments` — largest fan-out
   (10k-msg groups). Route soft-deletes messages first, then ORM cascade
   hard-deletes them anyway on `db.delete(conv)` — double work, same result.
4. `communities → community_groups` ONLY — featured safety: member groups
   survive community delete (`communities.py:140` bulk + DB CASCADE agree).

## High-risk deletion paths (accidental large deletes)

- **User delete (future!)**: with recommendations applied, one user row
  cascades to ALL their rows across ~20 tables. No app path today; any future
  "delete account" endpoint MUST be confirm-gated + rate-limited + tested at
  fan-out (user with 10k messages × reactions). Currently IMPOSSIBLE via API
  (no endpoint) — risk is future-facing, flagged now.
- **Conversation delete**: ORM loads ALL messages then deletes row-by-row
  (N+1 writes); 10k-msg group = 10k+ DELETEs in one request transaction.
  Works, slow; DB-cascade + `passive_deletes` is the future fix (not this wave).
- **Community/channel delete**: safe (links/posts only; member content kept).

## Cycles: NONE in FK graph. Self-edge: `messages.reply_to_id` only
(no cycle risk: nullable leaf pointer, never cascades).

## SQLite-vs-Postgres asymmetry (the core hazard)

| Delete | SQLite today | Postgres today |
|---|---|---|
| conv with events/scheduled/notif-links | orphans them silently | DB CASCADE cleans |
| conv delete | ORM cascade hard-deletes soft-deleted msgs anyway | same |
| user delete (manual SQL) | succeeds, leaves everything | CASCADEs fire; 8 bare FKs → 500 |
| channel/community delete | bulk deletes in code carry it | same + DB CASCADE agrees |
