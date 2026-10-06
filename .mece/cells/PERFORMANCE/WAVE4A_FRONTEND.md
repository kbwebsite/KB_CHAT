# WAVE 4A — Frontend audit (OBSERVED)

## Rendering (no virtualization anywhere — grep-verified zero matches)

- `ChatView.tsx:813-893` maps ALL `flowItems` to `MessageBubble`s on every
  `currentMsgs` identity change; `MessageBubble` not memoized (only
  `AiMarkdown` is, `:125`); `ConversationItem` not memoized.
- `messages[convId]` grows unbounded (50/fetch + live, never trimmed,
  `chat.ts:121-141,304,352`); long histories = thousands of DOM nodes.
- Typing/presence: `ChatSidebar` subscribes the WHOLE `typingUsers` map
  (`:50`) and whole `conversations` array; every tick rerenders sidebar +
  all rows. `setOnline` rewrites all `conversations[].members`
  (`chat.ts:442-449`), rerendering every conversations subscriber
  (`ChatPage:35`, `ChatSidebar:48`, `ChatPanels:56`).
- Whole-store destructuring in ~20 components (`ChatPanels:55`,
  `ChatView:65-66`, `ChatPage:29,31`, panels, composer…).
- Unmemoized derived work per render: `filteredByTab` (`ChatSidebar:84-95`),
  `typingNames` (`ChatView:208-211`), reaction loops over ALL convs
  (`chat.ts:566-586`), `editMessage` scans all convs (`:374-377`).

## Fetching

- No `AbortController`/dedupe on chat fetches (`chat.ts:104-152,453-457`;
  only uploads + AI stream take signals). Tab-switch fires overlapping
  `fetchMessages` with no cancellation; reconnect refetches everything
  (`chat.ts:512-519`).
- Duplicate fetch patterns after every mutation (`fetchConversations` +
  `fetchMessages` in create/select/jump/update handlers).
- `pendingSends` never cleaned on permanent failure; search results uncapped.

## Media cost (OBSERVED)

- Voice notes: full `fetch().blob()` + `decodeAudioData` + peak scan PER
  MOUNT, no cache (`MessageBubble:53-87`).
- Link previews fetched per bubble with URL, no cross-message cache
  (`LinkPreview:17-23`, cap 3/message).
- MemeMaker redraws full canvas per keystroke; wallpaper downscale per
  upload (main thread).
- Two object-URL leaks: `ProfilePanel:42` (no revoke), `MessageComposer:347`
  fallback path.

## Bundle (OBSERVED)

`dist/` 105 files, **~8.1 MB** total. Top: physics `.wasm` 1.57 MB (Spline),
`runtime-updater` 984 kB, `runtime-chunk` 649 kB, classicRuntime 626 kB,
webgpu 435 kB, `ui` 378 kB, ChatPage 365 kB, FirebaseAuth 358 kB, vendor
216 kB. `manualChunks` covers only react/router/zustand/axios + ui libs —
firebase, spline, rive, gsap, markdown, bootstrap unchunked. All routes lazy
(good); three heavy 3D/markdown libs load for chat users who never see them.
