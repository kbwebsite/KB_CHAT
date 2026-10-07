# WAVE4C — Refresh results (OBSERVED)

20 distinct users × concurrent refresh (threads, isolated PG):
20/20 HTTP 200, all rotated (new sid each), all 20 families exactly one
active afterward (no corruption, no reuse kills). Latency p50 673 ms,
p95 699 ms, max 701 ms — includes TestClient portal + thread contention;
absolute values are harness-inflated, convergence/counts are the finding.
RSS 100 → 105 MB across the run (interpreter + pools, no leak claim —
post-run RSS not returned to baseline is normal, not evidence of leak).

INFERRED: rotation is concurrency-safe for distinct tokens (matches unit
coverage of same-token races). No Wave 2 behavior change observed.
