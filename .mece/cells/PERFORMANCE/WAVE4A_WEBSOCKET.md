# WAVE 4A — WebSocket audit (OBSERVED; scale labels INFERRED)

## Lifecycle cost (all OBSERVED with file:line)

- Connect: `_get_user` (decode + `User.first` + sid check, `chat.py:16-43`)
  + `is_online=True` write (`chat.py:70-79`) + presence fan-out (2 queries
  + gather to all distinct co-members, `manager.py:159-203`). Minimum ~3 DB
  sessions per connect.
- Per message: sid PK check (`chat.py:97-102`, new session each) + dispatch.
  Typing = +2 queries (`chat.py:171-194`); read = membership + commit +
  fan-out (`chat.py:197-248`); call signaling up to 3–4 (`chat.py:251-351`).
  No rate/size/schema limits on any client event.
- Fan-out: `gather` over members (`manager.py:119-139`), per-user sequential
  socket writes with 5 s timeout (`manager.py:102-117`). No semaphore,
  no queue, no backpressure (grep-verified zero hits).
- Disconnect: map cleanup + conditional offline presence (`manager.py:57-70`,
  `chat.py:137-154`). Dead sockets reaped only on next send or loop exit.
- Ping/pong: client 30 s ping / 60 s watchdog (`websocket.ts:133-141`);
  server 60 s receive timeout → 1001 (`chat.py:84-90`); revive-once on
  4401/1008 (`websocket.ts:100-115`).

## Complexity classification (INFERRED)

| Path | Cost |
|---|---|
| Connect/disconnect | O(co-members) DB + fan-out — DB-dependent |
| Message send (chat traffic) | O(members) coroutines — fan-out-dependent |
| Typing event | O(members), 2 DB queries — fan-out-dependent |
| Presence change | O(all distinct co-members) — fan-out-dependent |
| Per-message sid check | O(1) indexed — DB-dependent, flat |
| Revocation sweep | O(sockets of sid/user) — memory-dependent |
| Idle connection | O(1) RAM (3 map entries) — memory-dependent |

## Scale reading (ESTIMATED)

- 10–100 users: everything fits; presence storms are tens of messages.
- 1,000 users: group-typing in 500-member groups = 500 coroutines + 5 s
  head-of-line risk per slow socket (sequential per-user writes); presence
  connect = hundreds of sends. Likely first visible pain (INFERRED).
- 10,000 users: single-process maps hold 10k+ sockets; one slow consumer
  delays only its own `send_to_user` (gather isolates users) but presence
  for hyper-connected users explodes; no multi-instance story (maps,
  sweeps, `is_online` all local — Wave 2 documented).
- No connection cap, no per-user socket cap, no WS rate limit (OBSERVED) —
  abuse/accidental hot loops (typing floods) are unthrottled contributor.

## What is already good (OBSERVED, preserve)

Parallel gather fan-out (was sequential), 5 s zombie reap, backoff
reconnect with 30 s ceiling, revive-once (no loop), ping watchdog both
sides, offline-only-on-last-disconnect, privacy-respecting presence.
