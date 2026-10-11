# WAVE — Photo Polls + Away Auto-Reply (2026-10-11 UTC)

## 1. Objective

Two requested features, both frontend-only, zero backend changes.

## 2. Photo polls

Poll options can carry photos: per-option photo button in the create
form (upload via existing `uploadApi`, URL absolutized and appended to
the option text, 500-char cap respected). Cards render photo thumb +
caption via `splitOptionMedia` (image-URL-in-text convention, same as
channel posts). Quiz select, votes line, and results show captions, never
raw URLs. Backend stores plain text — no schema change by design.

## 3. Away auto-reply

Per-chat auto-reply (local-only): header extras menu → Auto-reply panel
with toggle + custom message. The store receive-path hook replies once
per conversation per hour through the normal send path. Guards: own
messages skipped, game markers skipped, hourly cap is the ping-pong
guard, silent failure, app-open only.

## 4. Tests (VERIFIED)

- Photo/media splitting, upload flow, card render, honest failures.
- Auto-reply store units (cooldown, persistence, corruption) + panel UI.
- Full suites at commit time: frontend 234/234, backend 176.

## 5. Files

- `PollPanel.tsx`, `ChatView.tsx`, `ChatHeader.tsx`, `store/chat.ts`,
  `utils/autoReply.ts`, related tests (shipped in upstream batch).
- This report.
