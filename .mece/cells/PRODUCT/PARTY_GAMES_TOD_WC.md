# Party Games: Truth or Dare + Word Chain (2026-10-11 UTC)

## Design

Same message-protocol pattern as Chess/TTT (no protocol change, both
sides derive state from message history in id order, illegal moves
skipped fail-closed, move messages hidden from history):

- **Truth or Dare**: `🎮TOD:new`, `🎮TOD:spin:<id>:<truth|dare>:<index>`,
  `🎮TOD:done:<id>`. Card text derives from the shared deck + index, so
  both sides render the identical card. Animated spin (1.2s cycling,
  instant under reduced-motion), Done completions feed a scoreboard.
- **Word Chain**: `🎮WC:new`, `🎮WC:word:<id>:<word>`. Referee: letters
  only, 3–30 chars (protocol-anchored), chain-letter order, no repeats.
  Malformed protocol is ignored; failed words show as strikes with
  reasons. Live chain tail, next-letter hint, scores, per-word sender.

## Verification (OBSERVED)

- `partyGames.test.ts`: 7 passed (protocol parse incl. index wrap and
  cross-challenge isolation, card determinism, spin/done replay +
  scores, deck shape, chain/refuse/score, deleted-word handling,
  malformed-protocol ignore).
- Full vitest 265 passed. `tsc` clean.
