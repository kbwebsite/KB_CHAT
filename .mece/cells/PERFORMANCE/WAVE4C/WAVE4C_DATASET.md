# WAVE4C — Datasets (`scripts/benchmark/seed.py`, deterministic)

- S (seed 0.6 s): 50 users, 20 convs × 20 msgs (400 msgs), 100 memberships,
  50 statuses, 1 community, 3 channels × 10 posts.
- M (seed 3.8 s): 500 users, 100 convs × 20 msgs + one 500-member/10k-msg
  group (12,000 msgs total), 900 memberships, 500 statuses.
- One shared bcrypt hash for all bench users (auth cost not under test).
- Methodology per scenario: 1–2 warmup + measured runs (export 3–5 iters,
  everything else 15), sequential single client (except WS/refresh thread
  scenarios); percentiles over measured samples; query counts via engine
  event listener; RSS via psutil before/peak/after.
- Repeatability: export/status M scenarios ran twice (two separate
  processes); run-to-run variability ~30% noted below, no cherry-picking —
  both runs reported.
