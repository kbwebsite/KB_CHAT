# Admin Analytics (2026-10-11 UTC)

## 1. Scope

The moderation console had actions but no overview. This adds a Stats
tab with platform numbers and dep-free visuals (no chart library —
hand-rolled bars/proportion rows, zero bundle cost).

## 2. What was added

- `GET /api/moderation/stats` (admin-only): user totals/active/new-7d,
  message total + per-day series (default 14d, max 60), conversation
  totals/groups, open/resolved counts, reports by reason. Bounded
  aggregates only — no message content leaves the server. Naive-UTC
  bounds (SQLite-safe) with dialect-normalized day keys.
- Console Stats tab: 4 stat cards, messages-per-day bars (SVG-free
  divs with `role=img` summary label), reports-by-reason proportion
  rows, loading/empty states.

## 3. Verification (OBSERVED)

- Backend: new stats test (403 for plain users; shape incl. 14-day
  series) — suite green.
- E2E `moderation.spec.ts`: 2 passed incl. new Stats-tab assertions.
- `tsc` clean on touched files.
