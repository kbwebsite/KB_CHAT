# WAVE PE-2H — Backend Test Isolation (2026-10-09 UTC)

## 1. Original failure (OBSERVED)

`test_leaderboard_weekly_bounds_and_counts` failed across PE waves
(in-suite and solo): the suite bound the persistent dev SQLite file
(`backend/kbchat.db`, 5.35MB / 8271 users at phase start), so the default
top-50 weekly board saturated with accumulated users and the test's fresh
2-message user never appeared. Test unweakened throughout.

## 2. Root cause (OBSERVED)

No pytest configuration existed — no conftest.py, no ini/cfg/toml. Every
test module imports `app.main` at module level; `connection.py` binds its
module-global engine to `settings.DATABASE_URL` (default = dev
`kbchat.db`); `main.py:178` + each test module call `create_tables()`
(check-first, never wipe). Result: every run appended users/messages to
the developer DB. There was never a test DB.

## 3. Current test DB architecture (OBSERVED)

- DB URL: pydantic `Settings.DATABASE_URL`, default dev sqlite; env
  override wins (env > `.env` > default); `model_post_init` keeps any
  non-default value and makedirs sqlite parent dirs.
- No `.env` present; rate limiter already pytest-aware
  (`PYTEST_CURRENT_TEST`); WS manager is a singleton but order-neutral
  across the suite (verified by permutation runs).
- Intra-run sharing (all modules, one engine) is long-standing behavior
  the suite passes under; only cross-run accumulation was broken.

## 4. Chosen strategy: per-session temp SQLite file (option B)

`tests/conftest.py` (new, ~50 lines): `mkdtemp` + `DATABASE_URL` env set
at module top — imported by pytest before any test module, hence before
the first `app.*` import and the singleton `Settings()` build. File (not
`:memory:`) because the module-global engine + `check_same_thread: False`
+ TestClient threads would otherwise see per-connection empty DBs.
Per-test DBs rejected: would require rebuilding the module-global engine
per test — far more invasive for no benefit. Session fixture disposes the
engine and removes the temp dir at session end (best-effort on Windows
locks). Zero production files touched.

## 5. Fixture lifecycle

pytest start → conftest sets env → first `app.*` import binds engine to
temp file → `create_tables()` builds schema → tests run (shared, fresh) →
session fixture: `engine.dispose()` → `rmtree(ignore_errors=True)`.
`create_tables()` calls in test modules are harmless no-ops thereafter.

## 6. Developer DB protection (VERIFIED)

Fingerprinted before/after full runs: size 5353472, users 8271, mtime
1791491456.3665216 — all identical. The suite never opens `kbchat.db`.

## 7. Application state (OBSERVED)

No production lifecycle changes. Rate limiting already skips under
`PYTEST_CURRENT_TEST`; no other global state needed resetting (order
permutations green).

## 8. Repeatability evidence (VERIFIED)

- Full suite: **162 passed / 11 skipped** — twice (257s, 198s).
- Leaderboard solo: passed ×3; leaderboard±broadcast-members both orders:
  9 passed ×2.
- Frontend (unchanged code): **119 passed / 15 files**; `tsc` clean; Vite
  build success.
- "This does not change production database behavior." Production
  semantics, schema, migrations untouched.

## 9. Files changed

- `tests/conftest.py` (new) — isolation harness only.
- This report.

## 10. Limitations / recommendations

- Intra-run sharing retained (matches historical passing behavior); if a
  future test needs true per-test isolation, add explicit fixtures then.
- `uploads/` and `vector_store/` remain shared dev paths during tests —
  no test currently depends on their emptiness; revisit if one does.
- Recommended PE-2I: return to product work; keep this harness stable and
  never let tests write outside it (assert `DATABASE_URL` in CI if desired).
