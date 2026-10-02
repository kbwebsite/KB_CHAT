import { useRef, useEffect, useState, useMemo, lazy, Suspense } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { useSettingsStore, getAccentVars, getConvAccent, setConvAccent } from '../store/settings'
import { useLockStore } from '../store/lock'
import { ACCENTS } from './settings/shared'
import { useToastStore } from '../store/toast'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { ChatHeader } from './ChatHeader'
import { DragDropZone } from './DragDropZone'
import { PollCard } from './PollPanel'
import { EventCard } from './EventPanel'
import { pollApi, eventApi, extrasApi, convApi } from '../services/api'
import wsService from '../services/websocket'
import { formatTime } from '../utils/format'
import { WALLPAPERS, getConvWallpaper, setConvWallpaper, getConvCustomUrl, setConvCustomUrl, convWallpaperView, imageFileToWallpaper, isSlideshowOn, nextSlideshowId } from '../utils/wallpapers'
import { fireEffect, effectForText, parseFxMarker, prettyPreview, isGameMoveMsg, checkChatMilestone } from '../utils/messageEffects'
import { EffectOverlay } from './EffectOverlay'
import { DeleteDialog } from './DeleteDialog'
import { hiddenIds, hideMessage } from '../utils/hidden'
import type { RpsChoice } from './RockPaperScissors'

const TIMER_OPTIONS: { id: string; label: string; seconds: number | null }[] = [
  { id: 'off', label: 'Off', seconds: null },
  { id: '24h', label: '24 hours', seconds: 86400 },
  { id: '7d', label: '7 days', seconds: 604800 },
  { id: '90d', label: '90 days', seconds: 7776000 },
]

function timerLabel(seconds: number | null | undefined): string {
  return TIMER_OPTIONS.find((o) => o.seconds === seconds)?.label || 'Off'
}
import { addXp, countSent } from '../utils/levels'
import { Message } from '../types'

import { X, Bot, Sparkles, FileText, Reply, Edit3, Languages, Bookmark, MessageSquare, Users, Phone, Shield, Globe, ChevronRight, Settings as SettingsIcon } from 'lucide-react'
import { Bell, Search as SearchIcon, Moon, Sun } from 'lucide-react'

// Stable empty-array identity for selectors: returning a fresh [] literal
// would re-render on every store change.
const EMPTY_MSGS: any[] = []

// Markdown renderer lives in its own chunk; plain text shows first.
const AiMarkdown = lazy(() => import('./AiMarkdown'))

export function ChatView({
  onBack, onMobileViewChange, onCall, onProfile, onGroupInfo,
  replyTo, setReplyTo, editTarget, setEditTarget, editText, setEditText,
  lightbox, setLightbox, forwardMsg, setForwardMsg,
  selectedIds, setSelectedIds, savedIds, setSavedIds,
  onMobileMore, onReact, onSave, onAIAction, onPin,
  pinnedMessages, setPinnedMessages,
  aiPanelOpen, setAiPanelOpen, aiLoading, aiError, aiResult, setAiResult, handleAiPanelAction,
  isMuted, onMute, showPolls, setShowPolls, showPinned, setShowPinned, showEvents, setShowEvents,
  showSchedule, setShowSchedule, showInsights, setShowInsights,
  activeRightTab, handleMessageSearch, onNewChat,
  totalUnread, onNotifications, onSearch, onSaved, onSettings, onThemeToggle, onLogout,
  showMessageSearch, messageSearch, setMessageSearch, onCloseSearch,
  onAgent,
  onTheme,
  // Language selector (from ChatPage)
  showLanguageSelector, languages, languagesLoading, handleLanguageSelect, handleTranslateClick, onCloseLanguageSelector
}: any) {
  const { user } = useAuthStore()
  const settings = useSettingsStore()
  const toast = useToastStore(s => s.push)
  // Selective subscriptions: the whole store changes on every typing tick
  // and every message in any chat — subscribing wholesale re-renders this
  // entire view for all of that. Only the open conversation's slices here.
  const currentConversationId = useChatStore((s: any) => s.currentConversationId)
  const currentMsgs = useChatStore((s: any) =>
    (currentConversationId ? s.messages[currentConversationId] : undefined) ?? EMPTY_MSGS,
  )
  const hasMoreForConv = useChatStore((s: any) =>
    currentConversationId ? s.hasMore[currentConversationId] : undefined,
  )
  const isCurrentLoading = useChatStore((s: any) =>
    (currentConversationId ? s.loadingMessages[currentConversationId] : undefined) ?? false,
  )
  const sendMessage = useChatStore((s: any) => s.sendMessage)
  const editMessage = useChatStore((s: any) => s.editMessage)
  const deleteMessage = useChatStore((s: any) => s.deleteMessage)
  const fetchMessages = useChatStore((s: any) => s.fetchMessages)
  const fetchConversations = useChatStore((s: any) => s.fetchConversations)
  const retryMessage = useChatStore((s: any) => s.retryMessage)
  const currentConv = useChatStore(s => s.conversations.find((c: any) => c.id === currentConversationId))
  const typingSet = useChatStore((s: any) => currentConversationId ? s.typingUsers[currentConversationId] : undefined)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [showWallpaper, setShowWallpaper] = useState(false)
  const [showTimer, setShowTimer] = useState(false)
  const [convWp, setConvWp] = useState<string | null>(null)
  const [convWpMsg, setConvWpMsg] = useState<string | null>(null)
  const [convAccent, setConvAccentState] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const hiddenTick = useChatStore((s: any) => s.hiddenTick)
  const convWpFileRef = useRef<HTMLInputElement>(null)
  const [showNewIndicator, setShowNewIndicator] = useState(false)
  const [showRefresh, setShowRefresh] = useState(false)
  // In-conversation message search.
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchLoading, setSearchLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [flashId, setFlashId] = useState<number | null>(null)

  const runMessageSearch = async () => {
    const q = (messageSearch || '').trim()
    if (!q || !currentConversationId) return
    setSearchLoading(true)
    setSearched(false)
    try {
      const res = await useChatStore.getState().searchMessages(q, currentConversationId)
      setSearchResults(Array.isArray(res) ? res : [])
    } catch { setSearchResults([]) }
    setSearchLoading(false)
    setSearched(true)
  }

  const jumpToMessage = async (m: any) => {
    if (m.conversation_id !== currentConversationId) {
      const st = useChatStore.getState()
      st.setCurrent(m.conversation_id)
      await st.fetchMessages(m.conversation_id)
      onMobileViewChange('chat')
    }
    requestAnimationFrame(() => {
      setTimeout(() => {
        document.getElementById(`msg-${m.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        setFlashId(m.id)
        setTimeout(() => setFlashId(null), 1800)
      }, 80)
    })
  }

  useEffect(() => {
    setSearchResults([])
    setSearched(false)
  }, [currentConversationId])
  // Polls & events rendered inline in the message flow (not just the panels)
  const [convPolls, setConvPolls] = useState<any[]>([])
  const [convEvents, setConvEvents] = useState<any[]>([])

  useEffect(() => {
    setConvPolls([])
    setConvEvents([])
    if (!currentConversationId) return
    const cid = currentConversationId
    // One round trip for polls + events + pins (was three serial calls).
    extrasApi.get(cid).then((r: any) => {
      if (r?.success && currentConversationId === cid) {
        // Backend once shipped an envelope object here instead of a list;
        // never let a non-array into state (it crashes the flow's .map).
        const polls = r.data?.polls
        setConvPolls(Array.isArray(polls) ? polls : [])
        const evs = r.data?.events
        setConvEvents(Array.isArray(evs) ? evs : (evs?.events || []))
        setPinnedMessages(r.data?.pinned || [])
      }
    }).catch(() => {})
  }, [currentConversationId])

  // Live poll/event updates over the socket, scoped to the open conversation
  useEffect(() => {
    const sameConv = (p: any) => !!p && p.conversation_id === useChatStore.getState().currentConversationId
    const onPollUpsert = (p: any) => {
      if (!sameConv(p)) return
      setConvPolls(ps => {
        const i = ps.findIndex(x => x.id === p.id)
        if (i < 0) return [...ps, p]
        const n = [...ps]; n[i] = p; return n
      })
    }
    const onPollDel = (p: any) => {
      if (!sameConv(p)) return
      setConvPolls(ps => ps.filter(x => x.id !== p.id))
    }
    const onEventUpsert = (p: any) => {
      if (!sameConv(p)) return
      setConvEvents(es => {
        const i = es.findIndex(x => x.id === p.id)
        if (i < 0) return [...es, p]
        const n = [...es]; n[i] = p; return n
      })
    }
    const onEventDel = (p: any) => {
      if (!sameConv(p)) return
      setConvEvents(es => es.filter(x => x.id !== p.id))
    }
    const offs = [
      wsService.on('poll.created', onPollUpsert),
      wsService.on('poll.updated', onPollUpsert),
      wsService.on('poll.deleted', onPollDel),
      wsService.on('event.created', onEventUpsert),
      wsService.on('event.updated', onEventUpsert),
      wsService.on('event.deleted', onEventDel),
    ]
    return () => { offs.forEach(off => off && off()) }
  }, [])

  const listRef = useRef<HTMLDivElement>(null)
  const aiResultRef = useRef<HTMLDivElement>(null)
  const isLoadingMoreRef = useRef(false)
  const scrollSnapshotRef = useRef<{ prevHeight: number; prevTop: number; convId: number } | null>(null)
  const prevMsgLenRef = useRef(0)
  const lastFxIdRef = useRef<number | null>(null)

  const typingNames = typingSet && settings.typing_indicators ? Array.from(typingSet).map((uid: any) => {
    const mem = currentConv?.members?.find((m: any) => m.user_id === uid)
    return mem?.display_name || 'Someone'
  }).join(', ') : ''

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current; if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setShowNewIndicator(false); setIsAtBottom(true)
  }

  const handleMessageScroll = () => {
    const el = listRef.current; if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setIsAtBottom(atBottom)
    if (atBottom) setShowNewIndicator(false)
    if (el.scrollTop < 80 && hasMoreForConv && !isLoadingMoreRef.current && !isCurrentLoading) {
      const firstId = currentMsgs[0]?.id; if (!firstId) return
      isLoadingMoreRef.current = true
      scrollSnapshotRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop, convId: currentConversationId! }
      fetchMessages(currentConversationId!, firstId)
    }
  }

  const prevLoadingRef = useRef(isCurrentLoading)
  useEffect(() => {
    if (prevLoadingRef.current && !isCurrentLoading && scrollSnapshotRef.current) {
      const { prevHeight, prevTop, convId } = scrollSnapshotRef.current
      if (convId === currentConversationId) {
        scrollSnapshotRef.current = null
        requestAnimationFrame(() => {
          if (listRef.current) { const newHeight = listRef.current.scrollHeight; listRef.current.scrollTop = prevTop + (newHeight - prevHeight) }
        })
      } else { scrollSnapshotRef.current = null }
      isLoadingMoreRef.current = false
    }
    prevLoadingRef.current = isCurrentLoading
  }, [isCurrentLoading, currentConversationId])

  useEffect(() => {
    const len = currentMsgs.length
    if (len > prevMsgLenRef.current) {
      // Instant (non-animated) follow while pinned to the bottom: smooth
      // scrolling on every arrival visibly shoves the composer around,
      // especially as the list grows. The ↓ pill keeps smooth scrolling
      // for user-initiated jumps.
      if (isAtBottom) setTimeout(() => scrollToBottom(false), 30)
      else setShowNewIndicator(true)
    }
    prevMsgLenRef.current = len
    // Celebration effects: a brand-new incoming message (not history load,
    // not our own echo) whose text matches a trigger phrase plays fullscreen.
    const last = currentMsgs[currentMsgs.length - 1]
    if (last && last.id !== lastFxIdRef.current) {
      const firstSight = lastFxIdRef.current !== null
      lastFxIdRef.current = last.id
      const created = last.created_at ? new Date(last.created_at).getTime() : 0
      const fresh = last.id > 0 && (!created || Date.now() - created < 120000)
      if (firstSight && fresh && last.sender_id !== user?.id) {
        const raw = last.is_encrypted ? '' : (last.content || '')
        // Sender-chosen effect (marker tag) wins; otherwise keyword fallback.
        const kind = parseFxMarker(raw) ?? effectForText(raw)
        if (kind) setTimeout(() => fireEffect(kind), 450)
        awardActivity(false)
      }
      // Milestone party: every fresh 100th message in this chat.
      if (firstSight && fresh && currentConversationId != null) {
        const hit = checkChatMilestone(currentConversationId, len)
        if (hit) {
          toast(`🎉 ${hit} messages in this chat!`, 'success')
          setTimeout(() => fireEffect('confetti'), 600)
        }
      }
    }
  }, [currentMsgs.length])

  useEffect(() => {
    setIsAtBottom(true); setShowNewIndicator(false); setTimeout(() => scrollToBottom(false), 100)
    lastFxIdRef.current = null
    setConvWp(getConvWallpaper(currentConversationId))
    setConvAccentState(getConvAccent(currentConversationId))
  }, [currentConversationId])

  // Wallpaper slideshow: rotate the global wallpaper every 45s (local only,
  // per-chat overrides keep winning while set).
  useEffect(() => {
    const t = setInterval(() => {
      try {
        if (!isSlideshowOn()) return
        const st = useSettingsStore.getState()
        st.setLocal({ chat_wallpaper: nextSlideshowId(st.chat_wallpaper) })
      } catch {}
    }, 45000)
    return () => clearInterval(t)
  }, [])

  const exportChat = () => {
    if (!currentMsgs.length) return
    const lines = currentMsgs
      .filter((m: any) => !m.is_deleted && !isGameMoveMsg(m.content))
      .map((m: any) => {
        const who = m.sender_id === user?.id ? 'You' : (m.sender_display_name || m.sender_username || 'Unknown')
        const when = m.created_at ? new Date(m.created_at).toLocaleString() : ''
        const body = m.is_encrypted
          ? '🔒 Encrypted message'
          : (prettyPreview(m.content) || (m.attachments?.length ? `[${m.attachments.length} attachment(s)]` : ''))
        return `[${when}] ${who}: ${body}`
      })
    const title = (currentConv as any)?.title || (currentConv as any)?.name || 'chat'
    const blob = new Blob(
      [`Kryzen export — ${title}\nExported ${new Date().toLocaleString()}\n\n${lines.join('\n')}`],
      { type: 'text/plain;charset=utf-8' }
    )
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `kryzen-${String(title).replace(/[^\w-]+/g, '_')}.txt`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 4000)
  }

  const handlePollVote = async (pollId: number, opts: number[]) => {
    try {
      const res = await pollApi.vote(pollId, opts)
      if (res?.success && res.data) {
        setConvPolls(ps => ps.map(p => p.id === pollId ? res.data : p))
        const { quizHit } = await import('./PollPanel')
        if (quizHit(res.data, opts)) {
          toast('Correct! 🎉', 'success')
          setTimeout(() => fireEffect('confetti'), 250)
        }
      }
    } catch {}
  }
  const handlePollClose = async (pollId: number) => {
    if (!confirm('Close this poll? No more votes will be accepted.')) return
    try {
      const res = await pollApi.close(pollId)
      if (res?.success && res.data) setConvPolls(ps => ps.map(p => p.id === pollId ? res.data : p))
    } catch {}
  }
  const handlePollDelete = async (pollId: number) => {
    if (!confirm('Delete this poll?')) return
    try { await pollApi.delete(pollId); setConvPolls(ps => ps.filter(p => p.id !== pollId)) } catch {}
  }
  const handleEventRespond = async (eid: number, r: string) => {
    try {
      const res = await eventApi.respond(eid, r)
      const updated = res?.data && res.data.id ? res.data : null
      if (updated) {
        setConvEvents(es => es.map(e => e.id === eid ? updated : e))
      } else if (currentConversationId) {
        const rl = await eventApi.list(currentConversationId)
        const list = Array.isArray(rl?.data) ? rl.data : (rl?.data?.events || [])
        setConvEvents(list)
      }
    } catch {}
  }

  // Chronological flow: messages + polls + events interleaved so extras live
  // in the chat itself, not only in the Extras panels. Memoized: rebuilding
  // + sorting on every render wastes frames while typing/scrolling.
  const flowItems: { kind: 'msg' | 'poll' | 'event'; key: string; created_at?: string | null; msg?: any; poll?: any; event?: any }[] = useMemo(() => [
    ...currentMsgs.filter((m: any) => !isGameMoveMsg(m.content) && !hiddenIds(currentConversationId).has(m.id)).map((m: any) => ({ kind: 'msg' as const, key: `m-${m.id}`, created_at: m.created_at, msg: m })),
    ...convPolls.map((p: any) => ({ kind: 'poll' as const, key: `p-${p.id}`, created_at: p.created_at, poll: p })),
    ...convEvents.map((e: any) => ({ kind: 'event' as const, key: `e-${e.id}`, created_at: e.created_at, event: e })),
  ].sort((a, b) => {
    const t = new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
    return t !== 0 ? t : (a.key < b.key ? -1 : 1)
  }), [currentMsgs, convPolls, convEvents, currentConversationId, hiddenTick])

  const awardActivity = (mine: boolean) => {
    try {
      if (mine) countSent()
      const r = addXp(mine ? 10 : 2)
      if (r.leveledUp) {
        toast(`🎉 Level ${r.level}! You're on fire!`, 'success')
        setTimeout(() => fireEffect('confetti'), 400)
      }
    } catch {}
  }

  const handleSend = async (content: string, attachmentIds?: number[], type?: string, voiceDuration?: number, opts?: { view_once?: boolean }) => {
    if (!currentConversationId) return
    if (editTarget) {
      if ((editTarget as any).view_once) { setEditTarget(null); setEditText(''); return }
      await editMessage(editTarget.id, content); setEditTarget(null); setEditText(''); return
    }
    try {
      const extra: { voice_duration?: number; view_once?: boolean } =
        voiceDuration != null ? { voice_duration: voiceDuration } : {}
      if (opts?.view_once) extra.view_once = true
      await sendMessage(currentConversationId, content, replyTo?.id, attachmentIds, type, extra)
      awardActivity(true)
    }
    catch (e: any) { toast('Failed to send — tap the message to retry. ' + (e?.response?.data?.message || e?.message || 'network error'), 'error') }
  }

  // Keep the newest AI output visible as it streams/grows, without yanking
  // a user who scrolled up to re-read. Mirrors the message-list behavior.
  useEffect(() => {
    const el = aiResultRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120
    if (nearBottom) el.scrollTo({ top: el.scrollHeight })
  }, [aiResult?.text])

  const sendChallenge = async (kind: 'ttt' | 'rps' | 'c4' = 'ttt') => {
    if (!currentConversationId) return
    const name = user?.display_name || user?.username || 'Someone'
    if (kind === 'rps') {
      await sendMessage(currentConversationId, `🎮RPS:new\n${name} started rock-paper-scissors — tap your throw!`)
    } else if (kind === 'c4') {
      await sendMessage(currentConversationId, `🎮C4:new\n${name} started Connect Four — tap a column to drop!`)
    } else {
      await sendMessage(currentConversationId, `🎮TTT:new\n${name} started tic-tac-toe — tap a square to join as O!`)
    }
  }

  const handleC4Move = async (challenge: any, col: number) => {
    if (!currentConversationId || !(challenge.id > 0)) return
    // Marker only — drops stay out of history (filtered above).
    await sendMessage(currentConversationId, `🎮C4:move:${challenge.id}:${col}`)
  }

  const handleRpsThrow = async (challenge: any, choice: RpsChoice) => {
    if (!currentConversationId || !(challenge.id > 0)) return
    // Marker only — throws stay out of history (filtered above).
    await sendMessage(currentConversationId, `🎮RPS:move:${challenge.id}:${choice}`)
  }

  const handleGameMove = async (challenge: any, pos: number) => {
    if (!currentConversationId || !(challenge.id > 0)) return
    // Marker only — move messages stay out of history (filtered below).
    await sendMessage(currentConversationId, `🎮TTT:move:${challenge.id}:${pos}`)
  }

  const handleConvCustomFile = async (f: File | undefined) => {
    if (!f || currentConversationId == null) return
    setConvWpMsg(null)
    try {
      const dataUrl = await imageFileToWallpaper(f)
      setConvCustomUrl(currentConversationId, dataUrl)
      setConvWallpaper(currentConversationId, 'custom')
      setConvWp('custom')
    } catch (e: any) {
      setConvWpMsg(e?.message || 'Could not use image')
    }
    if (convWpFileRef.current) convWpFileRef.current.value = ''
  }

  const removeConvCustom = () => {
    if (currentConversationId == null) return
    try {
      setConvCustomUrl(currentConversationId, null)
    } catch {
      setConvWpMsg('Storage full — custom photo not removed')
      return
    }
    if (convWp === 'custom') {
      setConvWallpaper(currentConversationId, 'default')
      setConvWp(null)
    }
  }

  const toggleChatLock = () => {
    if (currentConversationId == null) return
    const st = useLockStore.getState()
    if (st.lockedIds.includes(currentConversationId)) {
      st.unlockChat(currentConversationId)
      toast('Chat unlocked', 'success')
    } else {
      if (!st.hasPin) {
        toast('Set up an app lock PIN in Settings → Security first', 'error')
        return
      }
      st.lockChat(currentConversationId)
      toast('Chat locked — hidden from the list', 'success')
    }
  }

  const setTimer = async (seconds: number | null) => {
    if (currentConversationId == null) return
    try {
      await convApi.setDisappearing(currentConversationId, seconds)
      await fetchConversations()
      setShowTimer(false)
    } catch (e: any) {
      toast(e.response?.data?.message || 'Could not update timer', 'error')
    }
  }

  const handleRefresh = async () => {
    if (showRefresh) return; setShowRefresh(true)
    try { await fetchConversations(); if (currentConversationId) await fetchMessages(currentConversationId) } catch {}
    setShowRefresh(false)
  }

  const handleSelectDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected messages?`)) return
    for (const id of selectedIds) { const m = currentMsgs.find((x: any) => x.id === id); if (m && m.sender_id === user?.id) await deleteMessage(id) }
    setSelectedIds(new Set())
  }

  // ─── Loading: conversation selected but not yet found in store ───
  if (currentConversationId && !currentConv) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    )
  }

  // ─── Welcome Screen (no conversation selected) ───
  if (!currentConv) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="chat-header shrink-0" style={{ background: 'rgba(6,6,14,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
              K
            </div>
            <div>
              <h1 className="font-bold text-lg gradient-text">Kryzen</h1>
              <p className="text-[11px] text-muted-foreground">Connect. Chat. Share.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onThemeToggle} className="icon-btn" title="Toggle theme">
              {settings.theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            <button onClick={onNotifications} className="icon-btn relative" title="Notifications">
              <Bell className="w-[18px] h-[18px]" />
              {totalUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full gradient-primary text-[9px] text-white flex items-center justify-center font-bold">{totalUnread}</span>
              )}
            </button>
            <button onClick={onSearch} className="icon-btn" title="Search">
              <SearchIcon className="w-[18px] h-[18px]" />
            </button>
            <button onClick={onSaved} className="icon-btn" title="Saved messages">
              <Bookmark className="w-[18px] h-[18px]" />
            </button>
            <button onClick={onSettings} className="icon-btn" title="Settings">
              <SettingsIcon className="w-[18px] h-[18px]" />
            </button>
            <button onClick={onProfile} className="ml-1 cursor-pointer">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-xs">
                  {user?.display_name?.[0] || user?.username?.[0] || 'U'}
                </div>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0 overflow-y-auto" style={{ background: 'radial-gradient(ellipse at 50% 30%, rgba(var(--accent-rgb), 0.08) 0%, transparent 60%)' }}>
          <div className="max-w-lg w-full text-center">
            <div className="mx-auto mb-5 animate-float" style={{ width: 88, height: 88, borderRadius: 24, background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary), var(--cyan))', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 40px var(--accent-glow), 0 0 80px var(--accent-subtle), inset 0 1px 0 rgba(255,255,255,0.15)', position: 'relative' }}>
              <span className="text-4xl font-bold text-white">K</span>
              <div style={{ position: 'absolute', inset: -3, borderRadius: 27, background: 'linear-gradient(135deg, var(--accent-primary), var(--pink), var(--cyan))', zIndex: -1, opacity: 0.5, filter: 'blur(16px)' }} />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              Welcome to <span className="gradient-text">Kryzen</span>
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Start a conversation, share ideas, and stay connected.
            </p>
            <button onClick={onNewChat} className="btn-gradient px-8 py-3 rounded-2xl text-sm font-semibold text-white mb-8">
              Start New Chat +
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.3), transparent)' }} />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Features</span>
              <div className="flex-1 h-px" style={{ background: 'linear-gradient(90deg, transparent, rgba(var(--accent-rgb), 0.3), transparent)' }} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: MessageSquare, label: 'Messaging', desc: 'Real-time chats', gradient: 'linear-gradient(135deg, hsl(262 83% 58%), hsl(199 89% 48%))' },
                { icon: Users, label: 'Groups', desc: 'Team conversations', gradient: 'linear-gradient(135deg, hsl(142 76% 36%), hsl(199 89% 48%))' },
                { icon: Phone, label: 'Calls', desc: 'Voice & video', gradient: 'linear-gradient(135deg, hsl(38 92% 50%), hsl(0 84% 60%))' },
                { icon: Shield, label: 'Secure', desc: 'Private & encrypted', gradient: 'linear-gradient(135deg, hsl(262 83% 58%), hsl(330 81% 60%))' },
              ].map(({ icon: Icon, label, desc, gradient }, i) => (
                <div key={i} className="feature-card animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className="feature-card-icon" style={{ background: gradient }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-xs mb-1">{label}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Active Conversation ───
  return (
    <DragDropZone onFilesUploaded={(ids: number[]) => { if (ids.length > 0) handleSend('', ids) }}>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
        <ChatHeader
          conv={currentConv}
          currentUserId={user?.id}
          onBack={onBack}
          onInfo={onGroupInfo}
          onCall={onCall}
          onMute={onMute}
          muted={isMuted}
          onSearch={onSearch}
          handleRefresh={handleRefresh}
          onAi={() => setAiPanelOpen(!aiPanelOpen)}
          onAgent={onAgent}
          onTheme={onTheme}
          onSettings={onSettings}
          onExtras={(key: string) => {
            if (key === 'polls') setShowPolls(true)
            else if (key === 'events') setShowEvents(true)
            else if (key === 'pinned') setShowPinned(true)
            else if (key === 'schedule') setShowSchedule(true)
            else if (key === 'insights') setShowInsights(true)
            else if (key === 'export') exportChat()
            else if (key === 'wallpaper') setShowWallpaper((v) => !v)
            else if (key === 'lock') toggleChatLock()
            else if (key === 'timer') setShowTimer((v) => !v)
          }}
        />

        {showWallpaper && currentConversationId && (
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground">Chat wallpaper — this conversation only</p>
            <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
              <button
                onClick={() => { setConvWallpaper(currentConversationId, 'default'); setConvWp(null) }}
                className={`shrink-0 h-12 min-w-[72px] px-2 rounded-xl border text-xs bg-muted hover:bg-accent transition ${!convWp ? 'border-primary ring-2 ring-primary/40' : 'border-transparent'}`}
              >
                Global
              </button>
              {WALLPAPERS.map((w) => (
                <button
                  key={w.id}
                  onClick={() => { setConvWallpaper(currentConversationId, w.id); setConvWp(w.id) }}
                  className={`shrink-0 settings-wallpaper-btn h-12 min-w-[72px] p-1.5 ${w.className ?? ''} ${convWp === w.id ? 'active' : ''}`}
                  style={w.css}
                  title={w.label}
                >
                  <span className="text-[11px] bg-card/80 px-1.5 py-0.5 rounded">{w.label}</span>
                </button>
              ))}
              <button
                onClick={() => convWpFileRef.current?.click()}
                className={`shrink-0 settings-wallpaper-btn h-12 min-w-[72px] p-1.5 overflow-hidden ${convWp === 'custom' ? 'active' : ''}`}
                style={getConvCustomUrl(currentConversationId) ? { backgroundImage: `url(${getConvCustomUrl(currentConversationId)})`, backgroundSize: 'cover', backgroundPosition: 'center' } : undefined}
                title="Upload a custom wallpaper for this chat"
              >
                <span className="text-[11px] bg-card/80 px-1.5 py-0.5 rounded">Custom</span>
              </button>
            </div>
            <input ref={convWpFileRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleConvCustomFile(e.target.files?.[0])} />
            <div className="flex items-center gap-2 mt-1.5">
              {getConvCustomUrl(currentConversationId) && (
                <button onClick={removeConvCustom} className="text-[11px] text-muted-foreground hover:text-destructive">
                  Remove custom
                </button>
              )}
              {convWpMsg && <span className="text-[11px] text-destructive">{convWpMsg}</span>}
            </div>
            <p className="text-xs text-muted-foreground mt-2">Chat accent — this conversation only</p>
            <div className="flex gap-2 overflow-x-auto mt-1.5 pb-1 items-center">
              <button
                onClick={() => { setConvAccent(currentConversationId, null); setConvAccentState(null) }}
                className={`shrink-0 px-2.5 h-8 rounded-lg border text-xs bg-muted hover:bg-accent transition ${!convAccent ? 'border-primary ring-2 ring-primary/40' : 'border-transparent'}`}
              >
                Global
              </button>
              {ACCENTS.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setConvAccent(currentConversationId, a.id); setConvAccentState(a.id) }}
                  className={`settings-accent-dot shrink-0 ${a.color} ${convAccent === a.id ? 'active' : ''}`}
                  title={a.id}
                />
              ))}
            </div>
          </div>
        )}

        {(currentConv as any)?.disappearing_seconds ? (
          <div className="px-3 py-1.5 border-b border-border shrink-0 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <span>⏲</span>
            <span>Disappearing messages: {timerLabel((currentConv as any).disappearing_seconds)} — new messages vanish</span>
          </div>
        ) : null}

        {showTimer && currentConversationId && (
          <div className="px-3 py-2 border-b border-border shrink-0">
            <p className="text-xs text-muted-foreground">Disappearing messages — auto-delete new messages after</p>
            <div className="flex gap-2 overflow-x-auto mt-2 pb-1">
              {TIMER_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setTimer(o.seconds)}
                  className={`shrink-0 px-3 h-9 rounded-xl border text-xs transition ${
                    ((currentConv as any)?.disappearing_seconds || null) === o.seconds
                      ? 'border-primary ring-2 ring-primary/40 bg-primary/10 font-medium'
                      : 'bg-muted hover:bg-accent border-transparent'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {showMessageSearch && (
          <div className="px-3 py-2 border-b border-border shrink-0" style={{ background: 'rgba(var(--accent-rgb), 0.06)' }}>
            <div className="flex items-center gap-2">
              <SearchIcon className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                autoFocus
                value={messageSearch || ''}
                onChange={e => setMessageSearch(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') runMessageSearch()
                  if (e.key === 'Escape') onCloseSearch?.()
                }}
                placeholder="Search in this conversation..."
                className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-muted text-sm outline-none"
              />
              {!!messageSearch && (
                <button onClick={() => { setMessageSearch(''); setSearchResults([]); setSearched(false) }} className="p-1.5 hover:bg-muted rounded-full" aria-label="Clear search">
                  <X className="w-4 h-4" />
                </button>
              )}
              <button onClick={() => onCloseSearch?.()} className="p-1.5 hover:bg-muted rounded-full" aria-label="Close search">
                <X className="w-4 h-4" />
              </button>
            </div>
            {searchLoading && <p className="text-xs text-muted-foreground mt-2 px-1">Searching...</p>}
            {!searchLoading && searched && searchResults.length === 0 && (
              <p className="text-xs text-muted-foreground mt-2 px-1">No messages match “{messageSearch}”.</p>
            )}
            {searchResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-52 overflow-y-auto">
                <p className="text-[11px] text-muted-foreground px-1">{searchResults.length} result{searchResults.length === 1 ? '' : 's'} — tap to jump</p>
                {searchResults.map((m: any) => (
                  <button key={m.id} onClick={() => jumpToMessage(m)} className="w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-muted flex items-center gap-2 min-w-0">
                    <span className="text-xs font-medium text-primary shrink-0 max-w-[90px] truncate">{m.sender_display_name || m.sender_username || 'Unknown'}</span>
                    <span className="text-xs truncate flex-1">{m.is_encrypted ? '🔒 Encrypted message' : (prettyPreview(m.content) || '').slice(0, 80)}</span>
                    <span className="text-[10px] text-muted-foreground shrink-0">{m.created_at ? formatTime(m.created_at) : ''}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {typingNames && (
          <div className="px-4 py-1.5 text-xs text-muted-foreground glass-subtle shrink-0">
            <span className="font-medium">{typingNames}</span> is typing
            <span className="typing-dots ml-1"><span /><span /><span /></span>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="px-3 py-2 gradient-primary text-white flex items-center justify-between text-sm shrink-0">
            <span>{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <button onClick={handleSelectDelete} className="px-3 py-1 rounded-full bg-white/20 text-xs">Delete</button>
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 rounded-full bg-white/20 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {editTarget && (
          <div className="px-3 py-2 bg-warning/10 border-b border-border flex items-center justify-between text-sm shrink-0">
            <span>Editing: <span className="font-medium">{editTarget.content?.slice(0, 40)}</span></span>
            <button onClick={() => { setEditTarget(null); setEditText('') }} className="px-3 py-1 rounded-full bg-muted border border-border text-xs">Cancel</button>
          </div>
        )}

        <div className={`message-list flex-1 overflow-y-auto relative min-h-0 isolate z-0 ${convWallpaperView(currentConversationId, (settings as any)?.chat_wallpaper).className}`} ref={listRef} onScroll={handleMessageScroll} style={Object.assign({}, convWallpaperView(currentConversationId, (settings as any)?.chat_wallpaper).style, convAccent ? getAccentVars(convAccent) : null)} data-fontsize={settings.chat_font_size} data-density={settings.message_density} data-bubble={settings.bubble_style}>
          {isCurrentLoading && (
            <div className="sticky top-0 z-10 flex justify-center py-2">
              <span className="text-xs px-3 py-1 rounded-full glass animate-pulse">Loading older...</span>
            </div>
          )}
          {hasMoreForConv && (
            <div className="text-center py-2">
              <button onClick={() => fetchMessages(currentConversationId!, currentMsgs[0]?.id)} className="text-xs px-3 py-1 rounded-full glass hover:opacity-80 transition-opacity">Load older</button>
            </div>
          )}
          <div className="py-2 px-2 sm:px-4">
            {flowItems.map((item, idx) => {
              const prev = flowItems[idx - 1]
              const prevDate = prev?.created_at ? new Date(prev.created_at).toDateString() : null
              const itemDate = item.created_at ? new Date(item.created_at).toDateString() : null
              const showDateSep = prevDate !== itemDate
              const dateSep = showDateSep && itemDate ? (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border/50" />
                  <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-surface-2/50">{new Date(item.created_at as string).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                  <div className="flex-1 h-px bg-border/50" />
                </div>
              ) : null
              if (item.kind === 'poll' && item.poll) {
                const poll = item.poll
                return (
                  <div key={item.key} className="min-w-0 max-w-full overflow-x-clip">
                    {dateSep}
                    <div className="mb-3 px-2 sm:px-4 min-w-0 max-w-full overflow-hidden">
                      <p className="text-[11px] font-semibold text-primary mb-1">📊 Poll • {poll.creator_name || 'Unknown'}</p>
                      <PollCard poll={poll} userId={user?.id} onVote={handlePollVote} onDelete={handlePollDelete} onClosePoll={handlePollClose} />
                    </div>
                  </div>
                )
              }
              if (item.kind === 'event' && item.event) {
                const ev = item.event
                return (
                  <div key={item.key} className="min-w-0 max-w-full overflow-x-clip">
                    {dateSep}
                    <div className="mb-3 px-2 sm:px-4 min-w-0 max-w-full overflow-hidden">
                      <p className="text-[11px] font-semibold text-primary mb-1">📅 Event • {ev.creator_name || 'Unknown'}</p>
                      <EventCard ev={ev} userId={user?.id ?? 0} onRespond={handleEventRespond} />
                    </div>
                  </div>
                )
              }
              const msg = item.msg
              if (!msg) return null
              const prevMsg = prev?.kind === 'msg' ? prev.msg : undefined
              const next = flowItems[idx + 1]
              const nextMsg = next?.kind === 'msg' ? next.msg : undefined
              const isOwn = msg.sender_id === user?.id
              const showAvatar = !!currentConv?.is_group && (!prevMsg || prevMsg.sender_id !== msg.sender_id)
              const isLastInGroup = !nextMsg || nextMsg.sender_id !== msg.sender_id || (nextMsg && new Date(nextMsg.created_at).getTime() - new Date(msg.created_at).getTime() > 300000)
              return (
                <div key={item.key} id={`msg-${msg.id}`} className={`min-w-0 max-w-full overflow-x-clip ${flashId === msg.id ? 'msg-flash rounded-xl' : ''}`}>
                  {dateSep}
                  <div className={isLastInGroup ? 'mb-3' : 'mb-0.5'}>
                    <MessageBubble
                      msg={msg}
                      isOwn={!!isOwn}
                      isGroup={!!currentConv?.is_group}
                      showAvatar={showAvatar}
                      onReply={(m: any) => setReplyTo({ id: m.id, content: m.is_encrypted ? '🔒 Encrypted message' : (m.view_once && !m.content ? '👁 View-once message' : (prettyPreview(m.content) || '')), sender: m.sender_display_name || 'Unknown' })}
                      onEdit={(m: any) => { if (m.is_encrypted || m.view_once) return; setEditTarget(m); setEditText(m.content || '') }}
                      onDelete={(m: any) => setDeleteTarget(m)}
                      onReact={onReact}
                      onCopy={(t: string) => navigator.clipboard.writeText(t)}
                      onForward={(m: any) => setForwardMsg(m)}
                      onSave={onSave}
                      onSelect={(m: any) => setSelectedIds((s: Set<number>) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}
                      isSelected={selectedIds.has(msg.id)}
                      onImageClick={(url: string, name: string, all: any[], idx: number) => setLightbox({ images: all, idx })}
                      savedIds={savedIds}
                      onPin={onPin}
                      onAIAction={onAIAction}
                      onRetry={(m: any) => retryMessage(m.id)}
                      onTranslateAction={handleTranslateClick}
                      onMobileMore={(m: any) => onMobileMore(m)}
                      gameMsgs={currentMsgs}
                      onGameMove={handleGameMove}
                      onGameRematch={(kind) => sendChallenge(kind)}
                      onRpsThrow={handleRpsThrow}
                      onC4Move={handleC4Move}
                      onContactChat={(u: any) => onNewChat?.({ id: u.user_id, username: u.username, display_name: u.display_name, avatar_url: u.avatar_url })}
                      convTitle={(currentConv as any)?.title || 'Chat'}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {showNewIndicator && (
            <button onClick={() => scrollToBottom(true)} className="sticky bottom-4 z-10 self-center px-4 py-1.5 rounded-full btn-gradient text-xs font-semibold text-white shadow-lg animate-bounce mx-auto block w-fit">
              ↓ New messages
            </button>
          )}
        </div>

        {aiResult && (
          <div className="mx-2 mb-2 p-3 rounded-xl glass-subtle flex items-start gap-3 animate-slide-up shrink-0">
            <div className="shrink-0 w-8 h-8 rounded-lg gradient-primary flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] gradient-text font-semibold mb-1 uppercase tracking-wide">
                Kryzen AI · {aiResult.action}
                {aiResult.provider === 'mock' && (
                  <span className="ml-1.5 normal-case font-medium text-amber-400/90" title="Answering from built-in tips. Set a live AI model on the server for real answers.">• offline tips</span>
                )}
              </p>
              <div ref={aiResultRef} className="max-h-[38vh] min-h-0 overflow-y-auto overscroll-contain touch-pan-y pr-1">
                <Suspense fallback={<p className="text-sm whitespace-pre-wrap break-words">{aiResult.text}</p>}>
                  <AiMarkdown text={aiResult.text} />
                </Suspense>
              </div>
            </div>
            <button onClick={() => setAiResult(null)} className="shrink-0 icon-btn w-7 h-7"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {aiPanelOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setAiPanelOpen(false)} />
            <div className="fixed bottom-[88px] right-3 left-3 sm:left-auto sm:w-[360px] z-50 p-4 rounded-2xl glass-strong shadow-2xl animate-slide-up flex flex-col gap-3 max-h-[65vh] overflow-hidden">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white"><Sparkles className="w-3.5 h-3.5" /></span>
                  Kryzen AI
                </h4>
                <button onClick={() => setAiPanelOpen(false)} className="icon-btn w-7 h-7"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Choose a contextual action.</p>
              <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1 overscroll-contain">
                {[
                  { action: 'summarize', label: 'Summarize conversation', icon: Sparkles },
                  { action: 'explain', label: 'Explain message', icon: FileText },
                  { action: 'translate', label: 'Translate message', icon: Languages },
                  { action: 'rewrite', label: 'Rewrite message', icon: Edit3 },
                  { action: 'reply', label: 'Generate reply', icon: Reply },
                  { action: 'extract-tasks', label: 'Extract tasks', icon: FileText },
                  { action: 'unread-summary', label: 'Summarize unread', icon: Bookmark }
                ].map(({ action, label, icon: Icon }) => (
                  <button
                    key={action}
                    onClick={() => {
                      if (action === 'translate') {
                        handleTranslateClick('panel')
                      } else {
                        handleAiPanelAction(action)
                      }
                      setAiPanelOpen(false)
                    }}
                    className="py-2.5 px-3 rounded-xl glass-subtle hover:bg-primary/10 text-sm text-left flex items-center gap-2 border border-border/50 transition-all active:scale-[0.98]"
                  >
                    <Icon className="w-4 h-4 text-primary" /> {label}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-2"><span className="w-2 h-2 bg-primary rounded-full animate-bounce" /> Thinking...</p>}
              {aiError && <p className="text-xs text-destructive">Error: {aiError}</p>}
            </div>
          </>
        )}

        {showLanguageSelector && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onCloseLanguageSelector} />
            <div className="fixed bottom-[88px] right-3 left-3 sm:left-auto sm:w-[360px] z-50 p-4 rounded-2xl glass-strong shadow-2xl animate-slide-up flex flex-col gap-3 max-h-[65vh] overflow-hidden">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white"><Globe className="w-3.5 h-3.5" /></span>
                  Select Language
                </h4>
                <button onClick={onCloseLanguageSelector} className="icon-btn w-7 h-7"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Choose target language for translation.</p>
              <div className="flex-1 overflow-y-auto pr-1 overscroll-contain space-y-1 max-h-[50vh]">
                {languagesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSelect(lang.code, lang.name)}
                      className="py-2.5 px-3 rounded-xl glass-subtle hover:bg-primary/10 text-sm text-left flex items-center justify-between border border-border/50 transition-all active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{lang.code === 'en' ? '🇺🇸' : lang.code === 'es' ? '🇪🇸' : lang.code === 'fr' ? '🇫🇷' : lang.code === 'de' ? '🇩🇪' : lang.code === 'it' ? '🇮🇹' : lang.code === 'pt' ? '🇵🇹' : lang.code === 'ru' ? '🇷🇺' : lang.code === 'zh' ? '🇨🇳' : lang.code === 'ja' ? '🇯🇵' : lang.code === 'ko' ? '🇰🇷' : lang.code === 'ar' ? '🇸🇦' : lang.code === 'hi' ? '🇮🇳' : lang.code === 'ta' ? '🇮🇳' : '🌐'}</span>
                        <span className="font-medium">{lang.name}</span>
                        {lang.native !== lang.name && <span className="text-xs text-muted-foreground">({lang.native})</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
            </div>
          </>
        )}

        <EffectOverlay />

        {deleteTarget && (
          <DeleteDialog
            onForMe={() => {
              if (currentConversationId != null) {
                hideMessage(currentConversationId, deleteTarget.id)
                useChatStore.getState().bumpHiddenTick()
              }
            }}
            onForEveryone={() => {
              deleteMessage(deleteTarget.id).catch(() => toast('Delete failed', 'error'))
            }}
            onClose={() => setDeleteTarget(null)}
          />
        )}

        <MessageComposer
          onSend={handleSend}
          onTyping={() => {}}
          conversationId={currentConv.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />
      </div>
    </DragDropZone>
  )
}
