# WAVE 4A — Database audit (OBSERVED unless labeled)

## Query architecture

One engine (`database/connection.py`), sync sessions, no repository layer.
Eager loading exists in exactly 3 query builders
(`messages.py:178-189` joinedload sender/attachments/reactions.user/reply_to;
`polls.py:150-217` batched; `conversations.py:173-407` batched list).
Everything else is lazy-load-by-default (`models/message.py:62-69` no
`lazy=` overrides) + hand-batched `IN` queries. No `offset` anywhere
(id cursors only — good). `passive_deletes` count: 0.

## N+1 inventory (OBSERVED code paths)

| ID | Location | Behavior | Bound |
|---|---|---|---|
| DB-1 | `messages.py:878-881` search serialization | lazy sender/attachments/reactions/reply per hit (~4/hit) | ≤50 hits |
| DB-2 | `conversations.py:35-170` single-conv dict (get/create/update paths) | `User.first` per member + msg + sender (3+N_members) | per conv |
| DB-3 | `users.py:41-52` user search → `presence_for_viewer` (`privacy.py:64-65,29-44`: settings + 2 member queries) | 2–3 per hit | ≤20 hits |
| DB-4 | `status.py:96-151` per status + per viewer (`User.first`, `Viewer.first`, `v.viewer`) | 2+N_viewers per status | UNBOUNDED feed (§8) |
| DB-5 | `polls.py:32-73` write-path dict (create/vote/close) | 2+3×N_opts per poll | N_opts |
| DB-6 | `events.py:23-46` per event | 2 per event | ≤50 |
| DB-7 | `communities.py:20-45` per linked group (`Conv.first` + member `count`) | 2 per group × groups × communities | UNBOUNDED list |
| DB-8 | `channels.py:16-48` per channel (2 counts + follow check) + per post `User.first` | 3/channel, 1/post | UNBOUNDED ch; ≤100 posts |
| DB-9 | `extended.py:279-292` export per msg (`User.first` + `Attachment.all`) | 2 per message | UNBOUNDED |
| DB-10 | contacts/favorites/recent (`extended.py`, `users.py`) → `presence_for_viewer` per row | 3 per row | ≤10–50 |
| DB-11 | `users.py:131-149` leaderboard per sender `User.first` | 1 per sender | ≤50 |
| DB-12 | `ai.py:427-441` smart-search per hit (`Conv.first` + `User.first`) | 2 per hit | ≤20 |

Fixed-cost counterpoints (do NOT "fix"): message history 4–5 queries flat
(`messages.py:192-258`), conv list ~7 flat, receipts 4 flat, calls 2 flat,
batched polls/extras 3–4 flat.

## Unbounded table scans (OBSERVED, no limit)

`status.py:268` global status feed · `communities.py:71` all communities ·
`channels service:40` all channels · `extended.py:270` export full history ·
`insights.py:24,51` + `extended.py:681` full message-id loads (IN lists) ·
`saved.py:15`, `notification_settings.py:13` per-user uncapped ·
`scheduled.py:178` global due scan (30 s loop) · `disappearing.py:26` all
timer convs (60 s loop) · `stickers.py:136` packs · `broadcasts.py:72`
owner lists.

## LIKE scans (OBSERVED)

`messages.py:856` + `ai.py:414` + `users.py:32` — leading-`%` ILIKE, no
trigram/FTS index; message-content scans have no content index at all
(indexes cover `(conv,created)/(conv,id)/sender`, not content).

## Scale behavior (INFERRED)

Costliest single request: export (2×N_msgs queries + full buffer) and
status feed (full-table + per-row N+1). Costliest background: scheduled
sweeper per-due 2 queries; disappearing similar. Write paths are single-row
+ fan-out (fine). Connection pool is default-sized; no PgBouncer (see
SCALE_MODEL).
