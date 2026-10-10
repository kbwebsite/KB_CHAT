# WAVE PE-2K+1 — Party Games: Emoji Movies + Lucky Draw (2026-10-10 UTC)

## 1. Objective

Two creative, attractive group-chat features reusing only existing
infrastructure. Zero backend changes, zero protocol changes, zero new
dependencies.

## 2. What was built

**Emoji Movies** (`EmojiMovieGame.tsx`): a message-protocol game following
the exact TicTacToe/RPS/ConnectFour pattern — `🎮EMOJI:new` challenge,
`🎮EMOJI:move:<id>:<guess>` markers, shared state derived from the message
list. The puzzle is deterministic per challenge id
(`deck[abs(id) % 32]`), so all devices — including the challenger's — see
the same movie with no hidden state and no extra messages. 32-movie deck,
normalized matching (case/space/punctuation/leading-the), first exact
guess wins from any player, spoiler-free card UI with guess box, guess
counter, ShareWinButton + New-puzzle rematch.

**Lucky Draw** (`LuckyDraw.tsx`): a local party tool, deliberately NOT a
message game (shared randomness can't be fair over messages). On-device
spin with animated shuffle, exclude-me toggle, member count, winner +
Announce button that posts a plain `🎉 Lucky draw winner: X!` text
message. Launched from the chat header extras menu (data-driven
`extrasItems` + `ExtrasKey`, same as polls/events). Seeded-RNG-pure
`pickWinner` core.

## 3. Integrations touched (all additive)

- `messageEffects.ts`: `🎬 Emoji movie game` preview, `🎮EMOJI:move:`
  hidden from history via `isEmojiMove` ⊂ `isGameMoveMsg`.
- Composer games menu: 🎬 entry; `sendChallenge('emoji')` (+ ChatView
  rematch path and `handleEmojiGuess` capped at 80 chars).
- `MessageBubble`: `isEmoji` branch + `onEmojiGuess` prop (kind unions
  extended, nothing retyped).
- `ChatHeader`/`ChatView`: `draw` extras key + `showDraw` overlay with
  member list, announce-via-`handleSend`, Escape/backdrop close.

## 4. Fairness notes (honest limits)

- Emoji answers are deterministic from public ids — a determined cheater
  could compute them; it's a party game, documented in code.
- Draw randomness is local (`Math.random`); only the announcement is
  shared. Announced winners are plain text, auditable in history.

## 5. Tests (VERIFIED)

- `emojiMovie.test.ts` (8): deck integrity/uniqueness, determinism,
  normalization (incl. leading-space + "the" regression), challenge/parse
  helpers, ordered/filtered collection, first-win-from-anyone,
  preview/hidden integration, full deterministic round. One real bug found
  by the suite (trim-before-`the`-strip) and fixed.
- `luckyDraw.test.ts` (7): seeded index mapping, empty pool, fallbacks,
  spin→winner→announce→close flow, exclude-me exclusion across spins,
  Escape/backdrop behavior, disabled empty state (fake timers, no flakes).

## 6. Build results (VERIFIED 2026-10-10)

- Frontend: **201 passed / 31 files** (186 + 15 new), no errors.
- Backend: **175 passed / 11 skipped** (unchanged code, green baseline).
- `tsc`: clean. Vite build: success (pre-existing chunk warning).
- `git diff --check`: clean.

## 7. Files changed

- New: `EmojiMovieGame.tsx`, `LuckyDraw.tsx`,
  `__tests__/emojiMovie.test.ts`, `__tests__/luckyDraw.test.ts`, this report.
- Edited: `messageEffects.ts`, `MessageComposer.tsx`, `MessageBubble.tsx`,
  `ChatView.tsx`, `ChatHeader.tsx` (all additive).
