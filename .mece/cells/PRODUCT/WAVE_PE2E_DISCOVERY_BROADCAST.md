# WAVE PE-2E — Discovery & Broadcast (2026-10-09 UTC)

## 1. Objective

Make Channel/Broadcast/creator-discovery genuinely discoverable and usable
using ONLY capabilities already in the repo — "community-first group chat
with built-in AI assistance", channels as the secondary discovery layer.
Assessment verdict: **mostly (A)** — channels + communities UIs already
complete; broadcast UI functional but pre-PE-2 polish → **(B), minimum
frontend pass only**. No backend changes.

## 2. Real capabilities discovered (OBSERVED)

- **Channels** (`api/channels.py` + `services/channels.py`, models
  `Channel/ChannelFollow/ChannelPost`): list (bounded `limit≤200`, anyone
  may discover), create, PATCH update, delete, follow/unfollow, posts
  list/create (owner-only posting; reader = owner-or-follower). Dicts carry
  real `follower_count`, `post_count`, `is_owner`, `followed`, timestamps —
  every number the UI shows comes from here.
- **Channel UI** (`ChannelsPanel`, ~1100 lines, audit: "most polished
  surface"): Discover (Featured/Trending/All derived from real counts) +
  client search over the bounded list, Following tab, 3-step create wizard,
  follow/unfollow, post feed with Posts/Media/About tabs, owner composer,
  delete (confirm), local mute, invite-link copy. Entries: sidebar menu +
  MobileNav Channels tab. **No change needed; untouched.**
- **Communities** (`api/communities.py`, emerald clubhouse hub, Home |
  Groups | Members | About): visually/semantically distinct from Channels'
  violet creator identity. Untouched.
- **Broadcasts** (`api/broadcasts.py`, `models/broadcast.py`): list (owned,
  id DESC, real `member_count`), create `{name, member_usernames}` (400 on
  blank name / no valid members), delete (404), send `{content≤4000}` fans
  out to 1-1 chats skipping blocked/deleted users → `{sent_to}`. **NO
  add/remove-member endpoints exist** — manager offers create + send +
  delete only (P1-8 member management stays deferred, not faked).
- **Search**: NO channel search endpoint (`list` takes only `limit`);
  `channelApi.list` mirrors that. Per the phase rules, global search was
  NOT extended — client-loaded directory data is not global search.

## 3. Implementation note — what was NOT faked (OBSERVED decisions)

No verification badges invented (owner check only, from `is_owner`);
no follower/view/recommendation/category fabrication (counts are server
fields; Featured/Trending are deterministic sorts of them); no
Events/Media sections added to broadcasts; no member editing (no
endpoints); no global-search Channels section (no endpoint).

## 4. What was implemented (IMPLEMENTED)

`BroadcastPanel` rewritten in place (same mount, sidebar-menu entry,
existing `msg` inline-notice pattern shared with Channels/Communities):
loading skeletons (`aria-busy`), error + Retry (previously silent empty),
abort on unmount, `role="dialog"` + label, 44px named controls (were
`p-2`/`p-1.5` with generic labels), labeled create inputs + Enter-to-create,
44px send composer, real `member_count` (fallback to `member_ids` length),
delete confirm naming the list, failure keeps the row + message.
`broadcastApi.list` gained optional `AbortSignal` (PE-2 pattern, no
contract change). Channels/Communities/GlobalSearch: intentionally
untouched.

## 5. Files changed (IMPLEMENTED)

- `frontend/src/components/BroadcastPanel.tsx` — PE-2-standard rewrite.
- `frontend/src/components/__tests__/broadcast.test.ts` (new) — 10 tests.
- `frontend/src/services/api.ts` — signal on `broadcastApi.list`.
- `.mece/cells/PRODUCT/WAVE_PE2E_DISCOVERY_BROADCAST.md` (this file).

## 6. UX/mobile/desktop/accessibility (IMPLEMENTED / VERIFIED by inspection + tests)

Existing full-screen sheet + safe-area padding; 44px targets; `min-w-0` /
`truncate` guards at 360–412px; list scrolls; Android-back/Escape close via
unchanged shell handlers; no new gestures. Desktop 1280×768: shell intact,
mouse + keyboard (Enter creates/sends). Dialog + heading, sr-only input
labels, every control named (test asserts zero unnamed), `aria-busy` /
`aria-expanded` where applicable.

## 7. Tests (VERIFIED)

`__tests__/broadcast.test.ts` — **10/10 pass** vs the mocked real
contract: loading→rows with counts, empty, error + retry refire, create
validation + success (username parsing, prepend, notice), delete confirm +
success, delete failure keeps row, send success (draft cleared, reach
reported), Enter-to-send, named-controls + close. Existing suites untouched.

## 8. Build results (VERIFIED 2026-10-09)

- Backend: **151 passed / 1 failed / 11 skipped** — the failure is the known
  pre-existing `test_leaderboard_weekly_bounds_and_counts` isolation flaw
  (shared dev sqlite `kbchat.db` holds 7500+ accumulated users, saturating
  the default top-50; root-caused in PE-2D, fails solo, zero backend content
  changes in this task). Not weakened, not fixed (test-infra scope).
- Frontend: **107 passed** (97 + 10 new), all files green.
- TypeScript `tsc`: clean, 0 errors.
- Vite production build: success (pre-existing chunk warning only).
- `git diff --check`: clean on staged PE-2E files.

## 9. Limitations (OBSERVED)

- No broadcast member add/remove (no endpoints) — recreate the list to
  change membership.
- No server-side channel search — directory search is client-side over the
  bounded (≤200) list; global search correctly not extended.
- Channel PATCH (rename/description) exists server-side but has no UI —
  left out as beyond minimum discovery scope.
- Broadcast send is fire-and-forget per 1-1 chat; `sent_to` may exclude
  blocked/deleted recipients (server rule, reported in the notice count).

## 10. Recommended PE-2F

Candidate: channel edit UI on the real PATCH endpoint; broadcast member
management needs backend endpoints first (design before build); backend
test-isolation fix (per-run DB reset) to un-flake the leaderboard test;
and the deferred PE-5 visual-coherence pass (channels violet vs communities
emerald vs broadcast primary dialects, noted since PE-1).
