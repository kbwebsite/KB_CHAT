# WAVE4C — WebSocket results (OBSERVED; latency carefully labeled)

Harness limit discovered honestly: TestClient portals serialize WS traffic
(~1 msg/s), so end-to-end portal latency is NOT measurable here (one probe
returned the 60 s server timeout, an artifact). What IS measured:

- Coalescing: 50 rapid starts → ~1 delivered per watcher in both 5- and
  50-member rooms (98.4% coalesced, both runs). OBSERVED.
- Throttle pre-DB: 50-send storm cost 90 DB queries total (≈1 sid-check per
  coalesced send + 2 for the passing one) vs 150+ unthrottled. OBSERVED.
- Fan-out dispatch (server-side, no portal): 50 members 1.0 ms,
  500 members 10 ms wall. OBSERVED. Chunk-100 path never triggers below 100
  (identical behavior by construction).
- Socket cap: 11th connection rejected 1008; normal connect unaffected.
  OBSERVED.
- Delivery at 50-member scale works (watchers received passing events).
  OBSERVED.

INFERRED: chunk 100 / typing 3 s / cap 10 all SUPPORTED (functional,
conservative, small-room behavior identical). Production p95 fan-out
telemetry still needed for latency claims — explicitly NOT measured here.
