# WAVE 4A — Benchmark plan for Wave 4B (design only, nothing run)

## Principles

Seeded staging (PG 16, same mechanism as Wave 3B verification), isolated
from dev/prod, reproducible seed script committed with the harness.
Measure BEFORE optimizing; every benchmark asserts steady-state behavior
first (no errors), then records metrics.

## Datasets (to generate)

- S: 50 users × 20 convs × 20 msgs (20k msgs).
- M: 500 users × 50 convs × 200 msgs (5M msgs) + 1 group × 2k members.
- L: 5k users incl. one 10k-msg group + 500-post channel + 10k-status pile
  (status-feed worst case).

## Endpoint benchmarks (k6/pytest-benchmark or locust — Wave 4B picks)

| Target | Concurrency | Metrics |
|---|---|---|
| `GET .../messages` (cold + warm) | 10/50/200 | p50/p95/p99, q/request (assert ≤6), bytes |
| `POST .../messages` + WS delivery | 10/50 | p95 send→receive, DB q count |
| `GET /conversations` (10/200-chat users) | 20 | p95, bytes, q count |
| `GET .../export` (100/1k/10k msgs) | 2/5 | p95, peak RSS, bytes; abort criteria |
| `GET /status/feed` (1k/10k rows) | 5/20 | p95, q count |
| `GET /messages/search`, `/users/search` | 10 | p95 at S/M/L (FTS decision input) |
| `POST /auth/refresh` storm (1k clients) | 100 | p95, rotation correctness (no family kills) |
| Upload 15 MB ×20 concurrent | 20 | p95, peak RSS (buffered-read check) |
| `GET /communities`, `/channels` | 20 | p95, q count |

## WebSocket scenarios

- 500-conn burst (connect cost, presence storm size/latency).
- Typing storm: 50 typers in 500-member group (fan-out latency p95, DB q).
- 4401 sweep latency: revoke → last socket closed.
- Zombie consumer: 1 black-hole socket + 499 healthy (5 s reap check).
- Sustained 2k idle conns: RSS/conn, 60 s timeout churn.

## Metrics (all runs)

p50/p95/p99 latency, rps, DB queries/request (assert logs), mean/p99 DB
time (`EXPLAIN ANALYZE` on top queries), WS conn count, fan-out latency,
process RSS, response bytes. Abort criteria: any 5xx, p99 > 5 s on
history, RSS doubling.

## Safe environment

Isolated PG + disposable Redis-free stack (no shared-infra impact);
seed + teardown scripts; no prod data; network throttling profile for
mobile (optional second pass).
