# WAVE PE-2K — AI Tools Surface (2026-10-09 UTC)

## 1. Objective

Expose Kryzen's existing but unwired AI capabilities through minimal,
production-quality UI using ONLY real backend contracts. No consolidation,
no backend changes, no new endpoints.

## 2. Inspection findings (OBSERVED)

- KBAI page (`/ai`): chat (streaming), image gen, file analysis. No
  smart-search, transcribe, or agent entry points.
- Agent panel (in-chat): chat + history only. No retrieve/index/tools UI.
- Backend contracts (all pre-existing, verified by reading code):
  - `POST /api/ai/smart-search {message}` → `{results:[{id, content,
    sender, conversation, conversation_id, created_at}], summary, count}`;
    membership-scoped server-side; empty query → empty result.
  - `POST /api/ai/transcribe` (multipart file) → `{transcription}`; mock
    path returns an honest placeholder when no API key is set.
  - `POST /api/ai/agent/retrieve {query, k}` → code-search hits
    `{file_path, chunk_type, name, language, start/end_line, content,
    score, match_type}` (codebase index, not user data).
  - `GET /api/ai/agent/index/status` → `{total_vectors, ...}`;
    `POST /api/ai/agent/index {incremental, files}` → message + count;
    full reindex is admin-gated (403), incremental is not.
  - `GET /api/ai/agent/tools` → always `{tools: []}`.
- `?conv=` deep link opens a chat (ChatPage mount effect) — reused for
  in-app navigation without reloads.

## 3. Implemented (frontend only)

- KBAI **search mode** toggle: send routes to `smartSearch`; assistant
  bubble shows the server summary plus structured hit rows (sender, chat,
  snippet) with Open buttons navigating to `/chat?conv=` in-app.
  AbortController + stale-guard + unmount abort; empty/error states honest.
- KBAI **audio transcribe**: attached audio files (`audio/*` or audio
  extension) route to `transcribe` instead of `analyzeFile`; user bubble
  labeled Transcribe vs Analyze; failure text mentions transcription.
- AgentPanel **code search** section (header toggle): query input →
  `retrieve(q, 5)` with abort; rows show file:line, name/language/type,
  score; empty/failure states; no crash paths.
- AgentPanel **index footer**: vector count from `indexStatus` on section
  open; Refresh calls incremental `index(true)`; 403 surfaced as
  "needs admin rights" (never bypassed); success shows server message.
- Helpers gained optional `AbortSignal` (`smartSearch`, `retrieve`) —
  no URL/contract change.

## 4. Intentionally NOT built

- Tools UI: endpoint returns `[]` — rendering it would be fake UI.
- Assistant consolidation (product-copy decision + migration — larger wave).
- Any backend, schema, or auth change.

## 5. Tests (VERIFIED)

- `kbaiTools.test.ts` (4/4): search queries + hit rows + in-app nav to
  `?conv=9`; empty/error honesty; audio→transcribe vs text→analyzeFile
  routing.
- `agentTools.test.ts` (3/3): retrieve rows with file/score/count;
  empty + failure survival; incremental refresh + honest 403 message.
- Existing suites untouched.

## 6. Build results (VERIFIED 2026-10-09)

- Frontend full suite: **159 passed / 23 files** (includes 7 new AI-tools
  tests; other-session suites also present in tree).
- Backend suite: **170 passed / 11 skipped**, 0 failures.
- `tsc`: clean at commit time. (Mid-phase, unrelated dirty-tree edits
  briefly broke it in `ChannelsPanel`/settings files I never touched;
  resolved before commit — verified clean.)
- Vite build: success (pre-existing chunk warning).
- `git diff --check`: clean.
- NOTE on commit placement: a parallel session committed this phase's
  implementation inside batch `e6f3a37` (which also carries unrelated
  groups/channels/wallpaper work); the implementation + tests below were
  verified green both before and after that commit. Only this report
  remained uncommitted and ships here.

## 7. Files changed

- `frontend/src/pages/KBAIPage.tsx` — search mode, hits UI, audio branch.
- `frontend/src/components/AgentPanel.tsx` — code search + index footer.
- `frontend/src/services/api.ts` — optional signals on 2 helpers.
- `frontend/src/pages/__tests__/kbaiTools.test.ts` (new).
- `frontend/src/components/__tests__/agentTools.test.ts` (new).
- This report.

## 8. Limitations / next

- Hits navigate to conversations, not exact messages (contract has ids;
  exact jump left for a follow-up).
- Transcription quality depends on server key/mode (mock placeholder
  otherwise — passed through honestly).
- Suggested next: assistant consolidation decision, then group recap.
