# WAVE 4A — Scale model (labels: OBSERVED / INFERRED / ESTIMATED)

Assumptions (ESTIMATED): avg user in 10 convs (~30 distinct co-members);
active chatter sends 1 msg/min at peak; presence flaps occasionally;
messages avg 0.5 kB JSON; voice/image prevalent in media mix.

## Per subsystem (ESTIMATED unless noted)

| Users | WS conns | Msg fan-out peak | Presence/connect cost | DB ops/s hot paths | Likely bottleneck (INFERRED) |
|---|---|---|---|---|---|
| 10 | ~15 | trivial | tens of sends | single digits | none |
| 100 | ~150 | 100s msgs/min to small groups | 30 sends/connect | tens/s | none; first N+1 visibility in export/status |
| 1,000 | ~1.5k | typing storms in big groups (500-corr gather) | 30–500 sends/connect | hundreds/s (history 4–5 q each) | typing/presence fan-out; unmemoized client rerenders; pool pressure without PgBouncer |
| 10,000 | ~15k | 10k-corr gathers, 5 s zombie head-of-line per user | up to 10k sends/connect for hyper-connected | thousands/s | single-process WS maps + RAM; in-memory rate-limit/reset/presence diverge on scale-out (OBSERVED local); status feed + export collapse first |
| 100,000 | ~150k | — | — | — | architecture change required (sharded presence, read replicas, FTS, object-storage media pipeline, CDN) |

## Bandwidth (ESTIMATED)

History page 50 msgs ≈ 25–100 kB (fine). Export of 10k-msg group ≈
5–20 MB buffered server-side per request (dangerous). Conv list for
200-chat user ≈ hundreds of kB (GZip helps; unbounded).

## Memory (INFERRED from structures)

Server: ~3 map entries/socket + untracked spawn tasks + unbounded
`_request_counts` keys + `_reset_tokens` entries. Client: unbounded
`messages[convId]` + full conv list + toasts/timeouts. Neither has
eviction; growth is linear in usage (OBSERVED code), not leaks per se —
except the two object-URL leaks and `pendingSends` failures (OBSERVED).

## Bottleneck order (INFERRED, confidence high on first three)

1. Unbounded endpoints (export, status feed) — collapse on first big data.
2. WS fan-out without backpressure (typing/presence in large groups).
3. Client full-list rerenders (thousands of bubbles, no virtualization).
4. ILIKE search scans (no FTS) past ~100k messages.
5. Single-process state on scale-out (rate-limit, resets, presence, sweeps).
6. Connection pool + no PgBouncer (needs measurement first).
