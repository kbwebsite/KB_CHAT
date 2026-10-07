# WAVE4C — Search results (OBSERVED)

Miss path (both datasets): 4 queries, p50 22–34 ms, of which ~14–18 ms DB
— the leading-% ILIKE scan over 12k rows costs low-double-digit ms.

Hit paths:
- S ("s0", ~20 convs hit → capped): 45 queries (N+1 serialization),
  p50 94 ms, 10.9 KB.
- M ("big", 10k matches → capped 50): 105 queries, p50 128 ms, 27.7 KB.
- users/search (~20 hits): 63 queries both datasets, p50 124–130 ms
  (presence N+1, dataset-independent — same 20-hit cap).

INFERRED: per-hit serialization (≈2 queries/hit), not the scan, dominates
hit latency — batch it before touching indexes. FTS vs trigram: NO CHANGE
at M (scans ~15 ms); re-measure at 100k+ rows; if needed, trigram first
(simpler ops than FTS). Recommendation: no index work in 4D except the
status-dict batching above.
