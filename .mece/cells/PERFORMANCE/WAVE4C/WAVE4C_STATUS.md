# WAVE4C — Status results (OBSERVED)

S (50 statuses): feed p50 55 ms, 20 queries / 15 ms DB, 1.8 KB.
limit=10: 5 queries, 26 ms — DB-level limiting verified (20→5).

M (500 statuses), two runs: feed p50 521 / 331 ms, 305 queries / ~150–210 ms
DB, 35 KB. limit=10: 35 queries, 72 ms.

INFERRED: bound works (305→35 queries), but the per-row N+1
(`status_to_dict`: user + viewer lookups) dominates the default path —
batching it is the top Wave 4D DB item. Default 100 / max 200: SUPPORTED
as guardrails (prevents the unbounded collapse the audit feared); the 100-row
default at 0.3–0.5 s is acceptable, not great. No abort triggered.
