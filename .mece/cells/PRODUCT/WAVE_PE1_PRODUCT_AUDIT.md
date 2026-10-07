# WAVE PE-1 — Product audit & evolution roadmap (2026-10-07 UTC, audit-only)

## 1. Executive summary

Kryzen is a **working, unusually broad chat app** (1:1/groups, real WebRTC
calls, channels, communities, broadcasts, stories, polls/quiz, events,
in-chat games, reminders, AI multimodal assistant) with **no onboarding, no
differentiation story, and real discoverability debt**: the richest features
(schedule, wallpaper, highlights API, transcribe, agent tools) are hidden
or unwired, while two first-run paths are actually broken (dead QR route,
lost invite on signup). Nothing here needs architecture — it needs product
editing. Recommended direction: **community-first group chat with built-in
AI assistance** (the only loop the codebase already supports end-to-end).
First wave: fix broken entry points + expose what exists (10 quick wins).

## 2. Current product definition

A dark-mode, mobile-first messenger (`/chat`) with satellite surfaces:
Status stories, Calls, Communities, Channels, AI (`/ai`), Settings. Auth
is email+code / Google / phone-capable Firebase. Backend covers far more
than the UI exposes (highlights, transcribe, smart-search, agent tools,
sessions API). Identity today: **unclear combination leaning chat app** —
community/creator/AI layers exist but don't cohere into one promise.

## 3. Current user journeys (summarized)

- A New user: signup works (incl. skip-verification), invite via
  `/join/:token` works logged-in; logged-out invite stored then **lost on
  signup/Google path** (OBSERVED `JoinPage:21` vs `SignupPage:77-86` nav).
  Post-signup: dumped into empty inbox with two generic welcome cards
  (OBSERVED `ConversationList:199`, `ChatView:579`). No onboarding.
- B Returning: session restore + guards work; deep link `?conv=` works.
- C 1:1 chat: full loop works (send/receive/reply/react/edit/delete,
  ticks, view-once, timers). Edit blocked silently on encrypted/view-once.
- D Groups: create/member/admin flows work; Groups tab in sidebar is
  **dead** (`ChatPage:544` hard-codes `activeTab="chats"`).
- E Discovery: user search works but generic (no about/status, chat-only
  action); no global message search UI (API exists, `ChatPage:409` unused).
- F Channels: complete owner/follower loop with creation wizard, search,
  featured/trending — most polished surface.
- G Communities: clubhouse-styled hub (presentation only, no audio),
  group linking + announcements work; creation wizard good.
- H Search: in-conv works (no prev/next/highlight); global missing.
- I Media: uploads/voice/avatar/lightbox/drag-drop work; drag-drop errors
  lack retry; voice transcription exists only in bubble menu.
- J Mobile: bottom sheets with back-button dismiss, 44px mostly, safe-area
  composer; a few 40px buttons and dialogs without focus trap.

## 4. Product strengths (top 5)

1. **Real calls**: WebRTC + TURN + ICE buffering + scheduled refresh —
   not a mock (`CallModal:170-366`).
2. **Playable in-chat games** (TTT/RPS/C4 over plain messages, no protocol
   change) + meme/GIF/sticker/effects/leaderboard — genuine fun density.
3. **Communities + announcements fan-out** that actually reaches groups.
4. **AI breadth**: streaming chat, image gen, file analysis, history,
   plus an agent surface with tools/index APIs waiting for UI.
5. **Craft details**: per-chat wallpaper/accents, disappearing timers,
   view-once, reminders, lock chats, QR sharing intent.

## 5. Product weaknesses → §6 findings

## 6. P0/P1/P2/P3 findings

**P0 — Broken:**
- P0-1 QR profile links `/u/:username` (`QRProfile:6`) — **route doesn't
  exist** (`App:120-130`), falls through to `/`.
- P0-2 Pending invite lost on signup/Google login (only `PublicOnly`
  resumes; signup paths `nav(/chat)` directly).
- P0-3 Sidebar Groups tab dead (`activeTab` hard-coded).

**P1 — Major gaps:**
- P1-1 Zero onboarding/first-run (empty inbox, no profile nudge, no
  contact suggestions, no feature tour).
- P1-2 Pin/mute/archive actions effectively unreachable (plumbed, no row
  menu/swipe; only header/archived-bucket paths).
- P1-3 No global message search UI (API + jump handler exist, unwired).
- P1-4 Reminders have no manager (create-only; no list/edit/cancel).
- P1-5 Saved-message jump drops `mid` (lands on conv, not message).
- P1-6 Highlights API fully implemented, **zero UI**.
- P1-7 Transcribe/smart-search/agent-index tools exist, unexposed in KBAI.
- P1-8 Broadcast lists lack member management (create/send/delete only).
- P1-9 Theme system undermined by hard-coded surfaces + 3 accent dialects
  (Channels violet-cyan vs Communities emerald vs Broadcast primary).
- P1-10 Mobile reactions limited to 👍; header never shows typing;
  last-seen subtitle always generic (`ChatHeader:71`).

**P2 — Polish:** in-bubble search highlight + prev/next; schedule in
composer; wallpaper discoverability; empty-state retry actions
(`ErrorState` unused); skeleton coverage; notification richness
(mentions/calls/polls, timestamps); expiring-status visibility;
CallsPanel redial; contacts share/chat duplication; language picker
single-language; help text pointing at wrong locations.

**P3 — Nice-to-have:** QR pairing (placeholder), passkeys/security history
(placeholder rows — either build or remove), per-chat storage breakdown,
selective purge, status reply-to-chat polish, winner-modal copy.

## 7. Underexposed existing features (surface before building)

Schedule send · per-chat wallpaper/accents · highlights API · voice
transcribe · smart-search · agent retrieve/index/tools · sessions device
management (fully built!) · broadcast fan-out · quiz polls · reminders ·
export chat · disappearing defaults · typing/presence settings. The
sessions page alone (`WhatsAppSettings:513-541,616-635`) is a finished
security feature nobody can find (buried in a 15-row settings list).

## 8. Mobile findings

Solid base (sheets, safe areas, 44px mostly, back-button dismiss). Remain:
40px composer buttons, dialogs/wizards without focus trap or initial
focus, keyboard overlap risks in wizards, no message-action swipe, sheet
React limited to 👍, channel/composer extra padding paths, status viewer
durations ≠ expiry communication.

## 9. Visual/design findings

Dark-only Inter + Lucide is coherent at the atom level; breaks at the
surface level: hard-coded violet-dark panels ignore themes; three accent
dialects; radius/type sprawl (18px bubbles vs 20px posts vs 22–24px cards;
10–17px ad-hoc type). Direction: **one accent system (theme-driven),
one radius scale, one type scale, theme-respecting surfaces** — tokens,
not a redesign.

## 10. Differentiation analysis

Messaging: parity + games/fun (real edge) · Communities: WhatsApp-parity
presentation, no audio/social graph edge · Creator/channels: solid but
generic (no analytics/monetization) · Discovery: weak (no global search,
no suggestions) · Search: backend-rich, UI-poor · Notifications: generic ·
Identity: QR intent broken, no username change · Personalization: themes
strong, undermined by hard-codes · AI: broadest asset, weakest framing
(two overlapping bots) · Moderation: block/unblock only, no reporting ·
Onboarding: absent · Mobile/desktop: good foundation.
**No single compelling "why Kryzen" exists today** — that is the gap.

## 11. Recommended Kryzen direction

**Community-first group chat with built-in AI assistance.**
Core user: organizers/members of active group chats. Core problem:
groups are noisy and hard to run. Core loop: chat → AI recap/help →
announce → return. Main surface: `/chat` groups + Communities hub.
Why return: my groups run here (polls/events/reminders/announce/AI).
Different: WhatsApp-grade groups + Discord-grade fun + AI that actually
summarizes/transcribes/organizes (all present in code today).
Alternatives rejected: pure AI companion (no moat, two bots already
confuse); creator platform (no analytics/monetization foundation).

## 12. Top 10 quick wins

1. Fix QR route (add `/u/:username` → profile/join) — `QRProfile:6`,
   `App:120-130`. High; S.
2. Resume pending invite after signup/Google (`SignupPage:77-86`,
   `LoginPage:243-252` check `kb_pending_invite`). High; S.
3. Enable sidebar Groups tab (wire `activeTab`, remove hard-code
   `ChatPage:544`). High; S.
4. Row long-press/swipe menu for pin/mute/archive (plumbing exists).
   High; S–M.
5. Global message search UI on existing `msgApi.search` + jump handler.
   High; M.
6. Reminders manager (list/cancel on `reminders.ts` store). M; M.
7. Saved jump scroll-to-message (pass `mid` through `onJump`). M; S.
8. Highlights UI on existing API (`api.ts:331-336`). M; M.
9. Transcribe + smart-search entry points in KBAI. M; S.
10. Theme hard-code sweep (panels use vars) + single accent pass. M; M.

## 13. Prioritized feature backlog (table)

| Priority | Feature | User Problem | Impact | Complexity | Wave |
|---|---|---|---|---|---|
| P0 | QR route + invite resume | broken entry | High | S | PE-1 |
| P0 | Groups tab + row actions | dead/hidden core | High | S–M | PE-1 |
| P1 | Onboarding (profile + find + tour) | empty-start confusion | High | M | PE-1 |
| P1 | Global search UI | can't find content | High | M | PE-2 |
| P1 | Reminders manager | no control | M | S–M | PE-2 |
| P1 | Highlights UI | dead API | M | M | PE-3 |
| P1 | Broadcast members | can't manage lists | M | S–M | PE-3 |
| P1 | AI consolidation (one assistant) | two confusing bots | High | M | PE-4 |
| P1 | Transcribe/smart-search UI | hidden AI value | M | S | PE-4 |
| P2 | Search highlight/prev-next | weak in-conv search | M | S | PE-2 |
| P2 | Theme coherence pass | feels unpolished | M | M | PE-5 |
| P2 | Notification richness | generic alerts | M | M | PE-5 |
| P2 | A11y (focus traps, contrast) | exclusion risk | M | M | PE-5 |
| P3 | QR pairing, passkeys | placeholders | Low | L | later |

## 14. Product Evolution waves

- **PE-1 Foundational UX**: P0 fixes + onboarding + Groups tab + row actions.
- **PE-2 Core chat**: global search, reminders manager, saved jump,
  search highlight, schedule-in-composer.
- **PE-3 Discovery/Channels/Communities**: highlights UI, broadcast
  members, discovery polish, empty-state guidance.
- **PE-4 AI differentiation**: one-assistant consolidation, transcribe/
  smart-search/agent tools UI, group recap moment.
- **PE-5 Polish**: theme tokens, notifications, a11y, delight, production
  hardening.

## 15. Dependencies

Row actions → existing plumbings (none). Search UI → `msgApi.search`
(exists). Highlights → existing API. AI consolidation → product copy
decision (which surface survives). Onboarding → invite-resume fix first.

## 16. Risks

AI consolidation touches two live surfaces (migrate, don't delete);
theme token pass may expose hard-coded contrasts (visual QA needed);
onboarding adds friction if overbuilt (keep 3 steps max).

## 17. Rejected/deferred

Audio rooms (no foundation, huge scope) · creator monetization/analytics
(no backend) · passkeys/QR-pairing builds (placeholders stay) ·
username change (backend + uniqueness UX, later) · full redesign (evolution,
not revolution) · any infra wave (roadmap closed).

## 18. First implementation wave recommendation

**PE-1**: P0-1/2/3 + onboarding v1 + Groups tab + row-action menu.
Visible on day one, zero architecture, unblocks every later wave.
