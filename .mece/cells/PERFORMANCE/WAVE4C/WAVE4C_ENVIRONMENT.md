# WAVE4C — Environment & isolation

- OS: Windows AMD64 · CPU: 8 logical · RAM: 7.8 GB · Python 3.12.10 ·
  Node v24.19.0 · PostgreSQL 16.2 (embedded pgserver, isolated pgdata in
  system temp; holder process; nothing shared with dev/prod).
- App under test: single TestClient process (no workers), SQLAlchemy settling
  pool defaults, sync sessions; `DATABASE_URL` forced to the benchmark PG
  before app import — startup refuses non-PG dialects.
- Isolation proof: benchmark users are `*@bench.test` / `ws*` / `st*` /
  `rf*` prefixed/suffixed names in throwaway databases (`postgres` staging
  DB wiped+seeded per dataset; `kbchat_fktest`-style isolation for PG unit
  runs); dev `kbchat.db` untouched (verified: no bench users present —
  separate files/servers); no external services called (Cloudinary unconfigured
  log line is the pre-existing no-op path; no mail backend).
- What's NOT covered: multi-process behavior, real network latency/CDN,
  production pooler, browser rendering timings.
