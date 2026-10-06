# WAVE 4A REPORT — performance & scale audit (2026-10-07 UTC, audit-only)

## 1. Executive summary

Nothing is on fire at current scale, but five unbounded server paths +
unvirtualized client lists + backpressure-free fan-out define the ceiling.
Headline: **export, status feed, and community/channel lists collapse first
(data-dependent, not user-count-dependent)**; typing/presence fan-out and
client rerenders hurt next; scale-out is blocked by single-process state
(known since Wave 2). Index coverage of hot paths is GOOD; gaps are narrow
(6 unindexed FK/filter columns + message-content search). Bundle is 8.1 MB
(3D/markdown libs unchunked). No measurements exist — Wave 4B must measure
before changing anything.

## 2. Current architecture

FastAPI sync routes + SQLAlchemy (lazy default, 3 eager builders) +
singleton WS manager (3 maps, gather fan-out) + lifespan sweepers +
React 18 + Zustand (selectors mixed with whole-store reads) + axios with
refresh queue + WS singleton. SQLite dev / PG prod, no pooler, no cache,
no CDN, no virtualization.

## 3–7. Findings by area

See `WAVE4A_DATABASE.md` (12 N+1 sites, 14 unbounded scans, 3 ILIKE scans),
`WAVE4A_API.md` (7 unbounded endpoints, per-family costs), `WAVE4A_WEBSOCKET.md`
(complexity table, no caps/rate limits), `WAVE4A_FRONTEND.md` (no memoization,
no cancellation, unbounded arrays, 2 URL leaks, 8.1 MB bundle),
memory summary below.

## 7b. Memory/process-state findings (OBSERVED)

Unbounded: WS 3 maps, `spawn` untracked tasks, `_request_counts` keys,
`_reset_tokens` entries, client `messages[]`/convs/toasts. Lifespan tasks
(scheduled 30 s, disappearing 60 s, reindex once) run per-replica →
duplicate sends/sweeps on scale-out. Multi-instance breakage (OBSERVED
local-only structures): presence/online/sweeps, rate limits (N× limit),
reset tokens (cross-instance 404), `is_online`/`get_online_user_ids`.

## 8. N+1 findings

12 sites (§3 table DB-1…DB-12); bounded ones (≤50 rows) are acceptable;
unbounded ones ride the unbounded endpoints (fix the endpoint, fix the N+1).

## 9. Unbounded endpoints (complete)

Export · status feed · communities · channels · conv list · saved ·
notification-settings · status/my · sticker packs · storage/insights
full-id loads · user search/leaderboard params unclamped.

## 10. Index gaps

6 unindexed FK/filter columns + no content index + no global-feed
composite (see INDEX_AUDIT). 5 redundant single-column duplicates
(janitorial only).

## 11. Pagination problems

No offset anywhere (good); id-cursor only on history. Everything else is
limit-or-nothing, and 7 endpoints have no limit at all. No stable cursors
for search/feed/channels/communities.

## 12. Top 10 performance risks (ranked)

1. P0 Export endpoint (unbounded queries + buffer + 20 MB responses).
2. P0 Status feed (full-table + N+1 + Python filter).
3. P0 Typing/presence fan-out without backpressure (500+ member groups).
4. P1 Client full-list rerender, no virtualization (1000+ bubbles).
5. P1 Unbounded `messages[convId]` growth (RAM + rerender cost).
6. P1 No request cancellation (overlapping fetches on tab-switch).
7. P1 Single-process state blocks scale-out (5 structures).
8. P2 ILIKE search scans without FTS (100k+ msgs).
9. P2 Voice-decode + link-preview per mount, no cache.
10. P2 8.1 MB bundle, heavy libs unchunked.

## 13–14. Scale model + benchmark plan

See SCALE_MODEL (10→100k table, bottleneck order) and BENCHMARK_PLAN
(datasets S/M/L, endpoint + WS matrices, metrics, abort criteria).

## 15. Recommended Wave 4B (measure first, then, in order)

1. Benchmark harness + S dataset baselines (proves the model).
2. Cap export (limit + cursor + streaming) and status feed (limit +
   SQL-side filter) — the two P0s.
3. WS typing coalesce + rate limit + fan-out semaphore (needs metrics).
4. Client virtualization + message trimming + memoization pass.
5. Refresh-queue-adjacent: AbortController on chat fetches.
6. FTS/trigram decision from M-dataset search numbers.
7. Scale-out design (shared presence/limit/reset) — design only until load
   demands it.

## 16. Things NOT worth optimizing

Batched history/conv-list/receipts/calls paths; redundant-index removal;
`pendingSends` happy path; GZip'd conv list; AI history slicing; per-row
single mutations; SQLite dev behavior; `already-converged` migration path.

## 17. Open decisions

FTS vs trigram (needs data) · virtualization library choice · WS limit
values (needs metrics) · scale-out trigger threshold · pool sizing
(measure waits first) · media pipeline (thumbs/srcset/CDN) scope.

## 18. Baseline test status (rerun for this wave)

Backend: **141 passed, 11 skipped** (PG-gated skips). Frontend: **25/25**.
tsc clean. Vite build not rerun (zero frontend changes — nothing to build).

## 19. Application behavior unchanged (confirmation)

`git diff HEAD --numstat` empty except docs under `.mece/cells/PERFORMANCE/`;
no model/route/service/frontend/test file touched. Wave 3 DDL intact
(ondelete grep re-verified). No measurement harness added (benchmark plan
is design-only, per instructions).
