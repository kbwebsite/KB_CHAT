# WAVE4C — Export results (OBSERVED)

S group (20 msgs): default p50 49 ms (cold first 233 ms), 3.9 KB,
10 queries / ~10 ms DB. limit=100: 43 ms. max: 45 ms. above-max: 422, 2 queries.

M group (10,000 msgs), run 1 / run 2:
- default (2000): p50 215 / 158 ms, 373 KB, 10 queries / ~25 ms DB, RSS +2.6 MB.
- limit=100: p50 74 / 55 ms, 50 KB.
- max (5000): p50 536 / 358 ms, 883 KB, 10 queries / ~40–50 ms DB, RSS +5 MB.
- above-max: 422 in ~11–17 ms.
- Ordering verified ascending in every bounded response; `truncated: true`
  + `total` present; txt format unchanged (covered by unit tests too).

INFERRED: query count flat at 10 regardless of size (batching works);
latency ≈ 0.1 ms/message serialization-dominated; 5000 cap keeps worst
case sub-second with single-digit MB RSS. Default 2000 / max 5000:
SUPPORTED BY MEASUREMENT. Streaming export stays FUTURE WORK (no need
demonstrated at these sizes).
No abort triggered (no 5xx; max 548 ms << 5 s; no RSS doubling).
