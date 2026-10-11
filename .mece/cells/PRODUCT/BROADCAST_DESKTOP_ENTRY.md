# Broadcast Desktop Entry (2026-10-11 UTC)

## Gap (OBSERVED, PE-2K)

`BroadcastPanel` rendered only inside `ChatSidebar` behind
`showBroadcasts`, reachable solely from the overflow menu in
`.mobile-header` — which is `display: none` at ≥1024px. Desktop users
had no path to broadcast lists.

## Fix

New `kb:open-broadcasts` window event (mirrors the existing
`kb:new-group` pattern — no prop threading):
- `ChatSidebar` listens and opens its broadcasts panel.
- Welcome header (no conversation selected) gets a Megaphone icon
  button dispatching the event.
- Command palette gains a `Broadcast lists` entry dispatching the
  event (Ctrl+K everywhere, all form factors).
- Mobile overflow menu unchanged.

## Verification (OBSERVED)

- `commandPalette.test.ts`: 2 passed (entry routes through the event;
  command set intact).
- E2E `broadcast.spec.ts` desktop test: header button opens the
  `Broadcast lists` dialog, close works, Ctrl+K → filter → option
  opens it again. `tsc` clean on touched files.
