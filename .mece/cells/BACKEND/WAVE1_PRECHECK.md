# WAVE 1 PRECHECK — worktree safety (2026-10-06 UTC)

## Baselines

| Ref | Commit | Status |
|---|---|---|
| `958866d` | feat: 44px follow targets, multiline composers, group-invite fix | verified present |
| `00e3bca` | docs: final verification report for mobile cleanup pass | verified present |
| `9cfab5d` | fix: overlay yields bottom nav, 44px touch targets | **HEAD** (`git rev-parse HEAD` = `9cfab5d1a18…`) |
| Branch | `main`, no stashes | — |

## `git status` summary

- `git status --short` lists ~55 tracked files as `M` (backend api/models/schemas/utils, frontend components/store/utils, tests, Dockerfile, CI).
- **Critical finding: the `M` flags are stat-only, not content changes.** Evidence:
  - `git hash-object backend/app/api/auth.py` = `d1247bbe…` == `git ls-files -s` index hash for the same file.
  - `git diff HEAD --stat` output is **empty** (zero content diff).
  - Root cause: `core.autocrlf=true` + `* text=auto` in `.gitattributes` (checkout normalization), plus mtime noise. No `core.filemode` set (reported `false` read is the unset default path).
- Conclusion: **working tree content == HEAD `9cfab5d`. No intentional uncommitted code changes exist to preserve.** No reset/stash/clean performed or needed.

## Untracked files (do not touch)

- `.mece/cells/ARCHITECTURE/` — Wave 0 audit output (REPORT.md, DIAGRAM.md). Preserved.
- `backend/tmp_*.db-shm` / `*-wal` (~10 files) — SQLite test-run leftovers. Generated; harmless; left in place (not deleted per no-destructive-ops rule; they do not affect pytest which recreates its DB).
- `backend/uploads/b47c…txt` — one runtime upload artifact. Left in place.

## Files Wave 1 will touch (backend only, frontend untouched)

| Action | Files |
|---|---|
| CREATE | `backend/app/services/errors.py`, `backend/app/services/users.py`, `backend/app/services/groups.py`, `backend/app/services/channels.py`, `tests/test_password.py` |
| EDIT (thin routes) | `backend/app/api/users.py` (password handler → service), `backend/app/api/extended.py` (remove shadowed password handler only), `backend/app/api/groups.py` (delegate to service), `backend/app/api/conversations.py` (group-admin handlers delegate to service), `backend/app/api/channels.py` (delegate to service) |
| CREATE (docs) | `.mece/cells/BACKEND/WAVE1_PRECHECK.md`, `WAVE1_MAP.md`, `WAVE1_REPORT.md` |
| NO TOUCH | `frontend/**`, `backend/app/websocket/**`, `backend/app/auth/**`, `backend/app/models/**`, migrations/schema, `backend/app/main.py` router registration order |

## Possible conflicts

- None: content tree is clean at HEAD. The only cross-module import into the edited area is `backend/app/api/messages.py:272` (`from app.api.extended import _blocked_pair`) — Wave 1 does not move `_blocked_pair`, so the import keeps working.
- Duplicate-route shadowing (`users_router` before `extended_router` in `main.py:199` vs `:210`) means the `extended.py` password handler is currently dead code — removal changes no live behavior (verified in Phase 4 with a route-table probe before/after).

## Planned implementation sequence

1. Commit 1 — docs (this file + MAP) + `services/errors.py` foundation; full pytest.
2. Commit 2 — `services/users.py` + thin `users.py` password route + remove dead `extended.py` handler + `tests/test_password.py`; focused + full pytest.
3. Commit 3 — `services/groups.py` + rewire `conversations.py` group-admin + `groups.py` (all ops incl. invites); full pytest.
4. Commit 4 — `services/channels.py` + rewire `channels.py`; full pytest.
5. Commit 5 — quality review + `WAVE1_REPORT.md`; full pytest + `tsc --noEmit` + `vite build`.
