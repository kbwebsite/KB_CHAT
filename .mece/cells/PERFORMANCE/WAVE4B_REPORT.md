# WAVE 4B REPORT — targeted performance fixes

## 1. Executive summary

Implemented the highest-value Wave 4A fixes with zero contract breaks:
bounded export/status/community/channel endpoints (+ export batching),
WS fan-out chunking + typing coalescing + socket cap, memoized conv rows +
bounded message arrays, fetch cancellation with stale-discard, 2 object-URL
leak fixes, bounded link/voice caches. Deferred: full virtualization,
FTS, index changes, Redis/scale-out, bundle rewrite. Backend **148 passed /
11 skipped**, frontend **38/38**, tsc clean, vite build green.

## 2. Baseline commit

`559743d` (Wave 4A audit). Tree clean; Wave 3 DDL intact.

## 3. Implemented fixes

| ID | Problem (audit ref) | Path | Change |
|---|---|---|---|
| P1-E | Unbounded export, 2N queries, 20 MB buffer | `api/extended.py:253-` | `limit` 2000/5000, newest-window + legacy asc order, batched users/attachments (2 fixed queries), additive `total/limit/truncated` |
| P1-S | Unbounded status feed/my | `api/status.py:263,298` | DB-level `limit` 100/200, order + shape unchanged |
| P1-C | Unbounded community/channel lists | `api/communities.py:64`, `api/channels.py` + `services/channels.py:39` | DB-level `limit` 200/200 |
| P2-F | Unbounded fan-out coroutines | `websocket/manager.py:119` | Chunked gather (100/provisional); small rooms identical |
| P2-T | Typing floods, 2 DB queries each | `manager.py` + `chat.py:171` | `typing_allowed` 3 s window pre-DB; stops always pass |
| P2-C | Unbounded sockets/user | `chat.py` connect | Cap 10/provisional → 1008 |
| P3-R | Conv rows rerender on any tick | `ConversationList.tsx:24` | `memo` + data-only comparator (handlers verified closure-safe) |
| P3-M | Unbounded `messages[]` | `store/chat.ts` | Cap 1000 newest, dedupe-safe overlap refetch |
| P3-F | Filter recompute per render | `ChatSidebar.tsx:84` | `useMemo` |
| P4-X | No cancellation, stale overwrites | `chat.ts:104,121` + `api.ts` signals | Per-scope AbortController + seq guard; cancels swallowed, errors rethrown |
| P5-U | 2 object-URL leaks | `ProfilePanel.tsx:38`, `MessageComposer.tsx:347` | Ref-tracked revoke (all paths) + timeout-path revoke |
| P6-L | Link preview refetch per mount | `LinkPreview.tsx:13` | Bounded Map (100) + in-flight dedupe, failures uncached |
| P6-V | Voice decode per mount | `MessageBubble.tsx:28` | Bounded peaks cache (50) + shared decodes |

## 4–11. (See §3; details)

- **API bounds**: export default 2000/max 5000 (newest window, legacy asc
  output); status 100/200; communities/channels 200/200. All `ge/le`
  validated (422 beyond). Additive response fields only.
- **Export changes**: query count 2N+2 → ~6 flat; RAM still buffered
  (streaming = FUTURE WORK, documented in code comment).
- **WebSocket protection**: semantics preserved (delivery, reconnect,
  revive untouched); provisionals marked (`FANOUT_CHUNK_SIZE=100`,
  `TYPING_MIN_INTERVAL_S=3.0`, `MAX_SOCKETS_PER_USER=10`).
- **Message-list**: full virtualization DEFERRED (inline callbacks +
  gameMsgs array defeat plain memo without rewrite — documented reason).
- **Message-array bounds**: 1000/conv (provisional), overlap-safe.
- **Cancellation**: conv + message fetches; search left (single-shot UI,
  low impact — documented).
- **URL fixes**: both leak sites closed, lifecycle reviewed.
- **Media**: local bounded caches; no global subsystem.

## 12. Tests

- Backend: `test_perf_bounds.py` (3: bounds/ordering/compat/422s),
  `test_ws_protection.py` (4: throttle predicate/prune/chunking/cap).
- Frontend: `chat.perf.test.ts` (7: trim/append/switch/cancel/stale/
  loading/signal), `mediaCache.test.ts` (6: dedupe/revisit/failure-retry/
  eviction ×2 domains).
- Totals: backend 148/11 skipped, frontend 38/38.

## 13. Build/typecheck

tsc exit 0 · vite build success (~3 min, pre-existing chunk warnings) ·
`git diff --check` clean.

## 14. Compatibility assessment

No URL/field removals; no ordering changes (export asc preserved);
no auth/WS-protocol changes; no message loss paths (dedupe + retry
semantics intact); cancel paths swallow only cancellations. One
intentional behavior note: export over-limit now returns newest window
(previously everything) — flagged via `truncated: true`.

## 15. Claims: OBSERVED vs INFERRED

- OBSERVED (tests): bounds enforced, ordering preserved, chunked delivery
  complete (250/250), throttle windows, single-flight refresh of caches,
  eviction, cap trims, cancel/stale discard.
- INFERRED (not benchmarked): reduced DB load, smoother lists, lower
  memory growth. No "faster" claims — Wave 4C measures.

## 16. Intentionally NOT implemented

FTS/trigram · index add/remove · Redis/scale-out · bundle rewrite ·
full virtualization · MessageBubble memo (documented blocker) ·
search cancellation · streaming export · broad N+1/service refactors.

## 17. Remaining Wave 4A risks

Uncapped saved/notifications/sticker-packs (per-user, low) · ILIKE scans
· pool sizing unmeasured · scale-out state · media pipeline · 8.1 MB bundle.

## 18. Wave 4C benchmark plan

Execute `WAVE4A_BENCHMARK_PLAN.md` S dataset first; priority order:
export p95/RSS → status feed → typing-storm fan-out → refresh storm →
search at M. Abort criteria already defined there.

## 19. Open decisions

Provisional values pending measurement: export 2000/5000, status 100/200,
list 200, fan-out chunk 100, typing 3 s, sockets 10, messages 1000,
cache caps 100/50. Virtualization library (deferred). Streaming export
design (future).

## 20–21. Files changed / diff stat

Backend: `api/extended.py`, `api/status.py`, `api/communities.py`,
`api/channels.py`, `services/channels.py`, `websocket/manager.py`,
`websocket/chat.py`, `tests/test_perf_bounds.py`,
`tests/test_ws_protection.py`. Frontend: `services/api.ts`,
`store/chat.ts`, `components/ConversationList.tsx`,
`components/ChatSidebar.tsx`, `components/ProfilePanel.tsx`,
`components/MessageComposer.tsx`, `components/LinkPreview.tsx`,
`components/MessageBubble.tsx`, `store/__tests__/chat.perf.test.ts`,
`components/__tests__/mediaCache.test.ts`. Docs:
`.mece/cells/PERFORMANCE/WAVE4B_REPORT.md`.
