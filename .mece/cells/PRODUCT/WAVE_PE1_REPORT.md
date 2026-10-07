# WAVE PE-1 REPORT — entry, onboarding, groups

## 1. Scope

P0 entry fixes (QR route, invite resume), onboarding V1, Groups tab,
group row actions. No backend changes (all APIs existed). No auth
redesign, no infra work.

## 2. Root causes (all OBSERVED before coding)

- QR: `QRProfile:6` links `/u/:username`; `App:120-130` had no such route
  → `*` → `/`. Verified by route-table read.
- Invite: `JoinPage:21` stashes `kb_pending_invite`, but only `PublicOnly`
  (`App:36-39`) consumes it; all 6 signup/login success paths
  `nav('/chat')` directly, discarding context.
- Groups tab: `ChatPage:544` hard-coded `activeTab="chats"`; sidebar
  filtering existed but no tab UI rendered it.
- Row actions: `onPin/onMute/onArchive` plumbed to rows but no menu/swipe
  invoked them (mute only via header, archive via bucket).
- Onboarding: absent — new accounts land on empty inbox.

## 3. QR fix (IMPLEMENTED, VERIFIED via tsc + tests where unitable)

- New public route `/u/:username` (`App`, lazy `UserPage`).
- Logged-out: explains + stashes `kb_pending_profile`, offers login/signup
  (destination preserved through auth via the same helper).
- Logged-in: profile card (avatar, name, @handle, about) + Chat button
  (`convApi.create` → `/chat?conv=`); self-profile → settings link;
  invalid → named error; refresh-safe (effect deps).
- QR format preserved (`/u/<username>` exactly as generated).

## 4. Invite resume fix (IMPLEMENTED)

- `utils/invite.ts`: `stash/takePostAuthDestination` (invite wins over
  profile), strict token/username regexes — arbitrary URLs can never
  become destinations (no open redirect by construction).
- Wired into all 7 post-auth navigations (Signup×4 incl. Skip, Login×3);
  `JoinPage` uses the same stash helper. Consumed one-shot on use.

## 5. Onboarding V1 (IMPLEMENTED)

- `OnboardingPanel`: 3 steps (welcome+name → find people → quick actions),
  skip everywhere, progress dots, `role=dialog aria-modal`, bottom-sheet
  mobile / centered desktop, 44px targets, existing visual classes only.
- Shown once per account with zero conversations (`ChatPage` gate);
  invite joins land in a group → skip naturally. Refresh restarts at
  step 1, never traps. Flag `kb_onboarded_<uid>` (local only — no backend
  subsystem needed).

## 6. Groups tab (IMPLEMENTED)

- `ChatPage` owns `sidebarTab` state (was hard-coded); `ChatSidebar`
  renders Chats/Groups segmented control with live counts, `role=tablist`,
  search placeholder adapts; existing filter + membership semantics kept.
- Groups empty state with New-group CTA (`emptyHint` prop, backwards
  compatible default).

## 7. Row actions (IMPLEMENTED)

- `RowMenu` in `ConversationList`: ⋯ per row (touch-visible, hover-reveal
  desktop, focus-visible), Pin/Unpin, Mute/Unmute (`extendedApi.mute`),
  Archive (`onArchive` prop); busy/disabled states, inline error, Esc +
  backdrop close, `role=menu/menuitem`. Non-destructive only — no
  confirmation needed. Memo comparator untouched (menu lives outside rows).

## 8. UX/design changes

None beyond the above; all new UI reuses `btn-primary/secondary`,
`kryzen-accent-gradient`, `bg-card/border-border`, `auth-*` classes.

## 9–10. Mobile/desktop verification

No browser automation in this environment — verified by construction +
build: 44px targets everywhere new, no fixed widths, overflow guards
(`max-h + overflow-y-auto`, `min-w-0`, `break-all`), `aria` roles, Esc
handling, existing breakpoints reused. Viewports 360–412px and 1280px
layouts follow the same patterns as the audited panels. Stated plainly:
no automated screenshot pass exists.

## 11. Tests

- New `utils/__tests__/invite.test.ts` (6): resume/clear/precedence/
  path-trick rejection/onboarding flag.
- Existing suites untouched and green (below).

## 12. Build results

Backend 152/11 skipped · frontend 44/44 (38+6) · tsc 0 · vite success ·
diff-check clean.

## 13. Compatibility

Route additive (`/u/:username`); `emptyHint` optional; memo + filter
behavior unchanged; invite/profile keys same storage; no API changes.

## 14. Files changed

`utils/invite.ts` (new), `pages/UserPage.tsx` (new),
`components/OnboardingPanel.tsx` (new), `App.tsx` (route),
`pages/SignupPage.tsx` + `pages/LoginPage.tsx` + `pages/JoinPage.tsx`
(post-auth nav), `pages/ChatPage.tsx` (tab state + onboarding gate),
`components/ChatSidebar.tsx` (tabs UI + empty hint),
`components/ConversationList.tsx` (menu + empty props),
`utils/__tests__/invite.test.ts` (new).

## 15. Remaining limitations

No automated browser/screenshot verification; row menu has no swipe
gesture (tap ⋯ instead); onboarding is local-flag only (no cross-device
sync); QR uses external qrserver image service (pre-existing).

## 16. PE-2 recommendation

Global search UI + reminders manager + saved jump-to-message (all
backend-ready per audit).
