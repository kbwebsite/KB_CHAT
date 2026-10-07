# WAVE4C REPORT — benchmark & verification

## 1–2. Executive summary / objective

Measured whether Wave 4B provisional limits are appropriate. Answer: yes —
every bound holds flat query counts with sub-second worst cases at M;
no abort triggered; two mechanisms (DB-level limits, coalescing) proven
working by before/after query counts. No production code changed.

## 3–6. Environment / isolation / datasets / methodology

See WAVE4C_ENVIRONMENT / DATASET. Isolated embedded PG 16.2, synthetic
data only, dev DB untouched. Sequential single-client + threaded WS/refresh
scenarios. Warmup + measured runs; M export/status run twice.

## 7–12. Results

See WAVE4C_EXPORT / STATUS / WEBSOCKET / REFRESH / SEARCH / RESULTS.

## 13–15. p50/p95/p99, DB, RSS

See RESULTS. Highlights: export/max p50 358–536 ms (10 queries flat);
status M p50 331–521 ms (305 queries — the N+1); search-hit 105 queries /
128 ms; refresh×20 p50 673 ms (harness-inflated); fan-out dispatch 1 ms
(50) / 10 ms (500); RSS +5 MB worst peak.

## 16. Abort criteria

None triggered (0 5xx; max 548 ms; no RSS doubling).

## 17. Provisional-limit evaluation

- export 2000/5000: SUPPORTED. status 100/200: SUPPORTED (bound works;
  per-row N+1 is now the quantified 4D item). lists 200: SUPPORTED
  (guardrail, no problem observed).
- WS chunk 100 / typing 3 s / cap 10: SUPPORTED (functional, conservative).
- client 1000 / link 100 / voice 50: SUPPORTED as guardrails (unit-tested;
  large-history UX needs real-device check — NEEDS MORE MEASUREMENT there).
- Pool sizing / scale-out: NEEDS MEASUREMENT / DEFERRED (single process).

## 18–20. OBSERVED / INFERRED / ESTIMATED

- OBSERVED: all numbers in RESULTS + coalescing 98.4% + flat query counts
  + cap enforcement + 20/20 refresh convergence.
- INFERRED: serialization (not scans) dominates hit latency; bounds keep
  worst cases sub-second; refresh absolute latency is harness-inflated.
- ESTIMATED: 100k-row/10k-user projections remain projections (see 4A
  scale model); E2E WS portal latency explicitly NOT measured (artifact).

## 21. FTS vs trigram: NO CHANGE at M (scans ~15 ms). Re-measure at 100k+;
trigram first if ever needed. Batch per-hit serialization before indexes.

## 22–23. Pool / scale-out: single-process only; no pressure observed;
no conclusions drawn; design stays deferred.

## 24. Remaining risks

Status-dict N+1 (quantified: 305q/0.5 s at 500 rows — top 4D item) ·
search-hit serialization (105q) · users/search presence (63q) · refresh
absolute latency uncharacterized · client 1000+ UX on device ·
E2E WS latency needs prod telemetry.

## 25. Wave 4D recommendation (minimum, evidence-ordered)

A. Batch `status_to_dict` user/viewer lookups (305→~5 queries).
B. Batch message-search serialization + `presence_for_viewer` callers.
C. Re-measure; only then decide trigram/pool/virtualization.
NOT recommended now: index changes, Redis, scale-out, bundle rewrite,
limit retunes (all SUPPORTED as-is).

## 26. What must NOT be optimized

Anything already flat: history/conv-list/receipts/export queries,
refresh convergence, coalescing, caps, caches (all measured fine).

## 27. Artifacts

`scripts/benchmark/` (common, seed, bench_api, bench_ws, bench_refresh,
pghold) + `WAVE4C/*.md` + raw JSONs in system temp (bench_S/M/M2/WS/REF).

## 28. Regression

Backend 148/11 skipped · frontend 38/38 · tsc clean · vite not rerun
(zero frontend changes). Benchmark users live only in disposable PG.

## 29. Behavior unchanged

`git diff --check` clean; no production files touched (harness only);
Wave 4B code paths exercised read-only (one coalescing insight: stops
bypass throttle by design — confirmed, not changed).
