# WAVE4C — Results tables (OBSERVED; two M runs where repeated)

## p50 / p95 / max latency (s)

| Scenario | S p50 | S p95 | M p50 (run1/run2) | M max |
|---|---|---|---|---|
| export/default | 0.049 | 0.214 | 0.215 / 0.158 | 0.327 |
| export/limit=100 | 0.043 | 0.044 | 0.074 / 0.055 | 0.187 |
| export/max | 0.045 | 0.045 | 0.536 / 0.358 | 0.548 |
| export/above-max (422) | 0.019 | 0.020 | 0.017 / 0.011 | 0.020 |
| status/feed | 0.055 | 0.056 | 0.521 / 0.331 | 0.537 |
| status/limit=10 | 0.026 | 0.028 | 0.072 / 0.046 | 0.079 |
| search hit | 0.094 | 0.100 | 0.128 | 0.135 |
| search miss | 0.022 | 0.024 | 0.034 | 0.038 |
| users/search | 0.130 | 0.136 | 0.124 | 0.129 |
| refresh×20 conc. | — | — | p50 0.673 / p95 0.699 | 0.701 |

## DB queries (median) / DB time

export: 10 / ~10–50 ms at all sizes (flat). status: S 20, M 305,
limited-10: 5/35. search hit: 45 (S) / 105 (M). miss: 4. users/search: 63.

## RSS

App process 100–120 MB across the whole campaign; export/max +5 MB peak;
no doubling, no leak claim (post-run RSS retention is normal).

## Abort criteria (from plan: any 5xx, history p99 > 5 s, RSS doubling)

None triggered. Zero 5xx in 300+ benchmark requests.
