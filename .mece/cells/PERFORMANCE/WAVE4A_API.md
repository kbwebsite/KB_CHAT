# WAVE 4A — API audit (OBSERVED)

## Pagination matrix (limit default / max / cursor)

| Endpoint | Limit | Cursor | Notes |
|---|---|---|---|
| `GET .../messages` | 50 / 100 | id `before` + `has_more` | GOOD |
| `GET /messages/search` | 100→50 slice | none | over-fetch, no cursor |
| `GET .../pinned` | 50 | none | ok |
| `GET .../polls`, `.../events` | 50 | none | ok |
| `GET .../posts` (channels) | 100 | none | ok |
| `GET /calls/history` | 50 | none | ok |
| `GET /users/search` | 20, **uncapped param** | none | param not clamped |
| `GET /users/leaderboard` | 50 default, **uncapped** | none | param not clamped |
| `GET .../messages` search param | inline | — | ILIKE in history query |
| AI smart-search | 20 | none | ok |
| Sticker recent | 24 | none | ok |

## Unbounded endpoints (OBSERVED — full list)

1. `GET /api/conversations/{id}/export` (`extended.py:253-352`) — full
   history + per-row queries + fully buffered JSON/txt response. Largest
   single-response risk in the API.
2. `GET /api/status/feed` (`status.py:263-295`) — full non-deleted table +
   per-row N+1, Python-side expiry/privacy filter.
3. `GET /api/communities` (`communities.py:64-81`) — all rows + nested
   per-group queries.
4. `GET /api/channels` — all rows + 3 queries each.
5. `GET /api/conversations` list — all user convs (bounded by membership,
   but no limit; 200-chat accounts = large JSON + member arrays).
6. `GET /api/saved-messages`, `GET /api/notification-settings`,
   `GET /api/status/my`, `GET /api/sticker-packs` — per-user uncapped.
7. `GET /api/storage` + `GET .../insights` — full message-id loads into IN.

## Per-endpoint cost notes (OBSERVED)

- Auth: login does password-hash (bcrypt, intentionally slow) + code issue;
  rate-limited 30/min writes. Signup same. No lockout counters.
- `POST .../messages` send: 1 insert + attachment link + fan-out spawn
  (async, off-request). GOOD.
- Read/deliver/read-matrix: fixed 3–4 queries. GOOD.
- `POST .../forward`, `.../clear`, broadcast send, community announce:
  N target writes in-request (bounded by member counts; announce = N groups).
- Uploads: multipart parse + full-file `await file.read()` (memory = file
  size per concurrent upload), Cloudinary-or-local write, 15 MB cap.
- AI chat/stream: history sliced to last 10 (bounded); stream has no server
  timeout documented; provider latency dominates (external).
- Push register/unregister: single-row upserts. GOOD.
- Sessions list/delete: single-row. GOOD (Wave 2).
- `POST /api/auth/refresh`: 2–3 queries + rotation writes. GOOD.

## Serialization cost (INFERRED)

`_message_to_dict` per row builds nested sender/attachments/reactions/
reply dicts in Python — fine at ≤100 rows, dominant cost inside export
(10k rows) and status feed. No response caching anywhere (fine at this
scale; noted for 10k+ users).
