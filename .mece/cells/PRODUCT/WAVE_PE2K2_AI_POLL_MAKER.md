# WAVE PE-2K+2 — AI Poll Maker (2026-10-11 UTC)

## 1. Objective

Let users describe a decision in plain words and get a ready-to-post
poll, using only the existing `POST /api/ai/chat` + poll-create
contracts. Zero backend changes.

## 2. What was built

PollPanel create form gains a **Suggest with AI** row under the question
field: enabled with a non-empty topic, it prompts the model for raw JSON
`{"question", "options"[3-5]}` and fills the form (question + options,
correct-answer reset). Everything stays editable; Create Poll flow
untouched.

## 3. Honesty rules (no fake data)

- `parsePollSuggestion` extracts the first `{...}` block and validates
  strictly (2–10 non-empty options, ≤200-char question, options capped).
- Unparseable replies (including mock-mode tips) → inline error
  ("AI could not suggest options — try rephrasing"), form untouched.
- Network failure → error + topic preserved. Empty topic disables the
  button. A ref guard (not state) prevents double-fire on rapid taps —
  caught by its own test.

## 4. Tests (VERIFIED)

- `pollSuggest.test.ts` (9): parser accepts/extracts/caps/trims, rejects
  garbage deterministically; flow fills form from valid reply; honest
  errors on unusable reply and on network failure with topic preserved;
  disabled-empty + single-fire guard.

## 5. Build results (VERIFIED 2026-10-11)

- Frontend: **210 passed / 32 files** (201 + 9 new), no errors.
- Backend: **175 passed / 11 skipped** (untouched code, green baseline).
- `tsc`: clean. Vite build: success (pre-existing chunk warning).
- `git diff --check`: clean.

## 6. Files changed

- `frontend/src/components/PollPanel.tsx` — suggest state/handler/UI.
- `frontend/src/components/__tests__/pollSuggest.test.ts` — new.
- This report.
