# Chess In Chat (2026-10-11 UTC)

## Design

Follows the established message-protocol game pattern (TTT/RPS/C4):
`🎮CHESS:new` challenge (challenger = White), `🎮CHESS:move:<id>:e2e4`
plies. Both sides derive identical state from message history in id
order; moves hidden from history via `isGameMoveMsg`. White plies must
come from the challenger, Black from anyone else; illegal/out-of-turn
moves are skipped fail-closed. Promotions auto-queen (labeled in UI);
castling + en passant included. Viewer-oriented board (own color at
bottom), legal-dot hints, last-move highlight, check/checkmate/
stalemate banners, rematch + share-win.

## Verification (OBSERVED)

- `chess.test.ts`: 15 passed — 20 opening moves, Fool's + Scholar's
  mate, stalemate, pin legality, kingside castling + rights revocation,
  en passant capture/removal, auto-queen, replay turn enforcement +
  illegal skip + deleted-message skip, challenge/move parsing.
- Full vitest 256/258 (2 failures are parallel's untracked
  `stickerMaker.test.ts` vs their WIP — untouched here). `tsc` clean.
- Shared files (Bubble/ChatView/Composer/messageEffects) carry
  co-mingled parallel hunks (auto-translate, video notes, AI styling);
  verified green together; noted, not separated — matches repo practice.
