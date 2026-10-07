# WAVE 4D REPORT — status/search batching (measured)

## 1. Executive summary

Batched the two Wave 4C-quantified N+1s with zero contract changes.
Measured on isolated PG 16.2 (M: 500 users/12k msgs): status feed
305→7 queries (p50 521→34 ms), message-search hits 105→5 (128→55 ms),
users/search 63→6 (124→21 ms). Backend 152/11, frontend 38/38, tsc/build
green. Wave 4 performance work is now sufficient — close the roadmap.

## 2. Wave 4C evidence used

Status 305q/0.5 s at M; search-hit 105q; users/search 63q (presence N+1);
miss paths already flat (4q).

## 3–4. Status root cause + implementation

Root: `status_to_dict` issued author lookup + viewed check + lazy viewers
+ per-viewer user per row. Fix (`api/status.py:96`): `statuses_to_dict`
collects user_ids/status_ids/viewer_ids → 3 fixed queries (users IN,
viewers IN, viewer-users IN) + identical shaping; single-row path
delegates as batch-of-one (no divergence); feed partitions from dicts.

## 5–7. Status before/after (OBSERVED, M)

Queries 305 → 7 · p50 521/331 ms (2 runs) → 34 ms · p95 536 → 35 ms ·
bytes identical (35,429). Correctness: shapes/flags/counts/viewers-list
asserted, incl. viewed + view_count + dedupe paths.

## 8–10. Search/presence

Root: (a) search serialized without the history eager-loads; (b)
`presence_for_viewer` cost 3 queries/row (settings + 2 membership).
Fix: `_get_messages_query(db, conv_id=None)` optional filter reused by
search (105→5 queries, 128→55 ms); new `presence_for_viewers`
(settings IN + my-convs + co-members IN = 3 fixed) migrated into 4 loops
(users/search, contacts, favorites, recently-contacted); single helper
kept for single-target callers. users/search: 63→6 queries, 124→21 ms.
No deferral needed — both justified and done. Miss paths untouched
(already 4 queries).

## 11. Response equivalence

`test_perf_batching.py` (4 tests): presence single-vs-batch across
4 scopes × contact/stranger; feed/my shapes + flags + viewers content;
search hits with populated reactions; bounded counts. Zero differences
found (no intentional/unintentional changes to adjudicate).

## 12–13. Tests / regression

New: 4 batching tests. Backend **152 passed / 11 skipped** (148+4).
Frontend 38/38 · tsc 0 · vite success · `git diff --check` clean.

## 14–16. OBSERVED / INFERRED / ESTIMATED

- OBSERVED: all counts/latencies above (two M runs for export/status).
- INFERRED: serialization, not scans, dominated these paths; per-hit cost
  now ~constant; refresh absolute latency remains harness-inflated.
- ESTIMATED: nothing new — 4A projections stand, with status/search rows
  now cheaper than modeled.

## 17. Remaining risks (small)

Refresh absolute latency uncharacterized · client 1000+ UX on-device ·
E2E WS latency needs prod telemetry · pool/scale-out still deferred by
design (no evidence of need).

## 18. Explicitly deferred (unchanged)

FTS · trigram · Redis · scale-out · pool tuning · bundle work · full
virtualization (MessageBubble memo still blocked on callback/gameMsgs
identities — documented in 4B).

## 20–21. Wave 4 sufficient? / next phase

YES — close the performance roadmap. All P0/P1 Wave 4A items are bounded
+ measured; remaining items need production-scale evidence, not more
waves. Recommended next: **KRYZEN PRODUCT EVOLUTION** (user-facing work).

## Files changed

`api/status.py` (batch serializer + 2 call sites), `api/messages.py`
(optional-filter eager helper + search reuse), `utils/privacy.py`
(`presence_for_viewers`), `api/users.py` + `api/extended.py` (4 loop
migrations), `tests/test_perf_batching.py`, `.mece/cells/PERFORMANCE/WAVE4D_REPORT.md`.
