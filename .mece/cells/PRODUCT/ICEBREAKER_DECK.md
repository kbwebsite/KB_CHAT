# Icebreaker Deck (2026-10-09 UTC)

## 1. Scope

Empty conversations showed a blank list — no invitation to start. This
adds a "Break the ice" entry point with curated starters, one-tap
composer fill, and one AI-generated question when the agent backend
answers (silent local fallback otherwise; the sheet never hard-fails).

## 2. What was added

- `utils/icebreakers.ts`: 4 vibe decks × 8 questions (fun, deep,
  friends & family, groups & work) + `randomIcebreaker()`. Pure local,
  works offline.
- `IcebreakerSheet`: bottom-sheet dialog (vibe tabs, question card,
  Shuffle, Ask AI with loading + honest fallback note, Use in chat).
  `fillComposerDraft()` writes `kb_drafts[cid]` (the composer's own
  storage) and dispatches `kryzen:fill-draft`.
- `ChatView`: empty-conversation block (icon + copy + Break the ice
  button, hidden while loading or for locked announcements) + sheet
  render.
- `MessageComposer`: additive `kryzen:fill-draft` listener (matching
  cid → set text + focus). No prop drilling, no composer rewrite.

## 3. Verification (OBSERVED)

- `icebreakers.test.ts`: 6 passed (deck shape — every question ends
  with `?`; random honoring category; draft write + event; sheet render
  + shuffle; AI failure fallback; AI success → use fills draft, fires
  callbacks).
- Full vitest suite run at commit time; `tsc` clean for all touched
  files; `git diff --check` clean.
- Not covered: no e2e (needs authenticated empty conversation; unit +
  contract tests pin it). AI quality depends on the server model; the
  local deck is always available.
