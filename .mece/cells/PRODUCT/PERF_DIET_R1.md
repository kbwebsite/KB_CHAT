# Performance Diet, Round 1 (2026-10-09 UTC)

## 1. Baseline (OBSERVED, `npm run build`)

Largest first-load-relevant chunks: `ui` 386KB (emoji-picker hoisted by
`manualChunks`), `ChatPage` 480KB, `FirebaseAuth` 358KB (login/signup
routes only), `RiveBadge` 221KB (env-gated lazy), Spline runtimes
(~2MB, env-gated lazy). `animejs` in deps but zero imports.

## 2. Changes

- `emoji-picker-react` (~309KB) lazy-loaded in `MessageComposer` and
  `MessageBubble` behind `Suspense` skeleton fallbacks; theme-enum
  values inlined as literals so no static import pins the module.
- `vite.config.ts`: removed `emoji-picker-react` from
  `manualChunks.ui` (it was defeating the lazy boundary by force
  hoisting). Comment documents why it must stay out.
- Removed unused `animejs` dependency.

## 3. Result (OBSERVED, vite build)

- `ui` chunk 386KB → 78KB; new on-demand `emoji-picker-react.esm`
  309KB chunk (loads only on picker open).
- Landing/route initial load sheds ~308KB raw (~73KB gzip).
- `ChatPage` 489KB (+9KB boundary noise), `FirebaseAuth` unchanged
  (route-scoped already), Spline/Rive still env-gated.

## 4. Verification

- `tsc` clean on both touched components; full vitest 175 passed;
  `git diff --check` clean.
- `npm run build` (tsc gate) currently fails on an unrelated untracked
  file (`VideoNoteRecorder.tsx`, parallel work, `setReviewMime`
  error) — pre-existing, untouched. Vite-only build passes.
- Not done (follow-ups): FirebaseAuth lazy-behind-tab, game-component
  splitting, font-display tuning, image lazy audit.
