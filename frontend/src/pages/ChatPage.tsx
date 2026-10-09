import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore, initChatWS } from '../store/chat'
import { useSettingsStore } from '../store/settings'
import { ChatLayout } from '../components/ChatLayout'
import { ChatSidebar } from '../components/ChatSidebar'
import { ChatView } from '../components/ChatView'
import { ChatPanels } from '../components/ChatPanels'
import { ChatModals } from '../components/ChatModals'
import { MobileNav } from '../components/MobileNav'
import { BottomSheet, BottomSheetAction } from '../components/BottomSheet'
import { DeleteDialog } from '../components/DeleteDialog'
import { hideMessage } from '../utils/hidden'
import { msgPinApi, aiApi, agentApi } from '../services/api'
import { convApi, extendedApi, savedApi, callsApi, isNativeApp } from '../services/api'
import { useToastStore } from '../store/toast'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Message } from '../types'
import { Reply, Copy, Forward, Bookmark, Sparkles, Languages, Edit3, Trash2, Bot, Pin, Clock, Sunrise, Info } from 'lucide-react'
import { MessageInfo } from '../components/MessageInfo'
import { OnboardingPanel, isOnboarded } from '../components/OnboardingPanel'
import { GlobalSearch } from '../components/GlobalSearch'
import { scheduleMessageReminder, formatFireAt } from '../utils/reminders'
import { useNavigate } from 'react-router-dom'
import wsService from '../services/websocket'

// Stable empty-array identity for selectors (see ChatView).
const EMPTY_PAGE_MSGS: any[] = []

export default function ChatPage() {
  const { user, logout } = useAuthStore()
  const toast = useToastStore(s => s.push)
  const settings = useSettingsStore()
  const nav = useNavigate()
  // Selective subscriptions (see ChatView): whole-store subs re-render the
  // entire page on every typing tick and every message in any chat.
  const conversations = useChatStore((s: any) => s.conversations)
  const currentConversationId = useChatStore((s: any) => s.currentConversationId)
  const currentMessages = useChatStore((s: any) =>
    (currentConversationId ? s.messages[currentConversationId] : undefined) ?? EMPTY_PAGE_MSGS,
  )
  const fetchConversations = useChatStore((s: any) => s.fetchConversations)
  const setCurrent = useChatStore((s: any) => s.setCurrent)
  const fetchMessages = useChatStore((s: any) => s.fetchMessages)
  const loadingConvs = useChatStore((s: any) => s.loadingConvs)
  const sendMessage = useChatStore((s: any) => s.sendMessage)
  const editMessage = useChatStore((s: any) => s.editMessage)
  const deleteMessage = useChatStore((s: any) => s.deleteMessage)
  const react = useChatStore((s: any) => s.react)
  const updateMessage = useChatStore((s: any) => s.updateMessage)

  // Mobile-first navigation: 'list' shows conversation list, 'chat' shows active chat
  const [mobileView, setMobileView] = useState<'list' | 'chat'>('list')
  // Reactive viewport width so the desktop multi-column shell adapts live
  // (rotate/resize/dock) instead of only on first render.
  const [winWidth, setWinWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1024
  )
  useEffect(() => {
    const onResize = () => setWinWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    window.addEventListener('orientationchange', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('orientationchange', onResize)
    }
  }, [])
  const [mobileNavTab, setMobileNavTab] = useState<'chats' | 'status' | 'calls' | 'communities' | 'channels' | 'ai'>('chats')
  // Sidebar list scope: chats vs groups (PE-1D — previously hard-coded).
  const [sidebarTab, setSidebarTab] = useState<'chats' | 'groups'>('chats')
  // First-run onboarding (PE-1C): shown once for accounts with no chats yet.
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [showProfile, setShowProfile] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [showCommunities, setShowCommunities] = useState(false)
  const [showChannels, setShowChannels] = useState(false)
  const [showCalls, setShowCalls] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showPolls, setShowPolls] = useState(false)
  const [showPinned, setShowPinned] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
  const [showLeaderboard, setShowLeaderboard] = useState(false)
  const [showTheme, setShowTheme] = useState(false)
  const [showMessageSearch, setShowMessageSearch] = useState(false)
  const [messageSearch, setMessageSearch] = useState('')
  const [replyTo, setReplyTo] = useState<{ id: number; content: string; sender: string } | null>(null)
  const [editTarget, setEditTarget] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; idx: number } | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [callModal, setCallModal] = useState<{ open: boolean; type: 'voice' | 'video'; peerName: string; peerAvatar?: string | null; incoming?: boolean; callId?: number; peerId?: number } | null>(null)
  const [statusViewer, setStatusViewer] = useState<{ statuses: any[]; idx: number } | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [aiResult, setAiResult] = useState<{ text: string; action: string; provider?: string } | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([])
  const [mobileActionSheet, setMobileActionSheet] = useState<{ open: boolean; msg?: Message }>({ open: false })
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null)
  const [infoMsgId, setInfoMsgId] = useState<number | null>(null)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [showLanguageSelector, setShowLanguageSelector] = useState(false)
  const [languages, setLanguages] = useState<Array<{code: string, name: string, native: string}>>([])
  const [languagesLoading, setLanguagesLoading] = useState(false)
  const [pendingTranslateMsg, setPendingTranslateMsg] = useState<Message | null>(null)
  const [showAgentPanel, setShowAgentPanel] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [showReminders, setShowReminders] = useState(false)
  const [showHighlights, setShowHighlights] = useState(false)

  const currentConv = conversations.find((c: any) => c.id === currentConversationId) || null

  const desktopPref = useSettingsStore(s => s.desktop_notifications)
  // Re-run push registration when the user flips desktop notifications on.
  useEffect(() => {
    if (!desktopPref) return
    import('../utils/push').then(m => m.initWebPush({ desktop: true })).catch(() => {})
  }, [desktopPref])

  // ─── Init: WS, token, saved IDs ───
  useEffect(() => {
    initChatWS()
    settings.init().catch(() => {}).finally(() => {
      // Register this client for background push only if the user opted in
      // (no-op unless Firebase is configured; native path covers the APK).
      const wantPush = useSettingsStore.getState().desktop_notifications
      import('../utils/push').then(m => {
        m.initWebPush({ desktop: wantPush })
        m.initNativePush()
      }).catch(() => {})
    })
    const token = useAuthStore.getState().token
    if (token) wsService.connect(token)
    fetchConversations()
    // Deep link from a push notification (?conv=id): open that chat.
    try {
      const cid = Number(new URLSearchParams(window.location.search).get('conv'))
      if (cid > 0) {
        setCurrent(cid)
        fetchMessages(cid)
        setMobileView('chat')
        window.history.replaceState({}, '', '/chat')
      }
    } catch {}
    savedApi.list().then((r: any) => { if (r.success) setSavedIds(new Set(r.data.map((x: any) => x.message_id))) })
    const off1 = wsService.on('call.incoming', (p: any) => {
      setCallModal({ open: true, type: p.call_type || 'voice', peerName: p.caller_display || p.caller_username || 'Unknown', peerAvatar: null, incoming: true, callId: p.id, peerId: p.caller_id })
    })
    const off2 = wsService.on('call.ended', () => setCallModal(null))
    const off3 = wsService.on('call.accepted', () => {})
    return () => { off1(); off2(); off3() }
  }, [])

  // ─── First-run onboarding (PE-1C): new accounts with no chats yet.
  // Invite joins land straight into a group (conversations > 0), so
  // invitees skip this naturally. Refresh-safe: step state is local and
  // the done-flag is per user id.
  useEffect(() => {
    if (!user || loadingConvs) return
    if (conversations.length === 0 && !isOnboarded(user.id)) {
      setShowOnboarding(true)
    }
  }, [user, loadingConvs, conversations.length])

  // ─── Keyboard shortcuts (desktop only) ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCommandPalette(true) }
      if (e.key === 'Escape') {
        // Top-most overlay first on every form factor (PE-2J): Escape in a
        // chat with a lightbox/panel/sheet open closes that — not the chat.
        if (closeTopRef.current()) return
        if (mobileView === 'chat') {
          handleBack()
        } else {
          setReplyTo(null)
          setEditTarget(null)
          setEditText('')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileView])

  // ─── Back navigation (mobile) ───
  const handleBack = () => {
    setMobileView('list')
    setReplyTo(null)
    setEditTarget(null)
    setEditText('')
    setSelectedIds(new Set())
    setShowMessageSearch(false)
  }

  // ─── Conversation selection ───
  const handleSelect = async (id: number) => {
    setCurrent(id)
    fetchMessages(id)
    setShowGroupInfo(false)
    setIsMuted(false)
    setMobileActionSheet({ open: false })
    setReplyTo(null)
    setEditTarget(null)
    setEditText('')
    setSelectedIds(new Set())
    setShowMessageSearch(false)
    setMobileView('chat')
    setMobileNavTab('chats')
    // Pins/polls/events arrive with the chat's single extras fetch in
    // ChatView — no serial round trip here to gate the open on.
  }

  // ─── Start chat from user search ───
  const handleStartChat = async (targetUser: any) => {
    try {
      const res = await convApi.create({ participant_id: targetUser.id })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
        setMobileView('chat')
      }
    } catch (e: any) { toast(e.response?.data?.detail || 'Failed to start chat', 'error') }
  }

  // ─── Create group ───
  const handleCreateGroup = async (title: string, members: any[]) => {
    if (!title.trim()) return toast('Group name required', 'error')
    if (members.length === 0) return toast('Add at least one member', 'error')
    try {
      const res = await convApi.create({ is_group: true, title, member_ids: members.map((m: any) => m.id) })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
      }
    } catch (e: any) { toast(e.response?.data?.detail || 'Failed', 'error') }
  }

  // ─── Send message ───
  const handleSend = async (content: string, attachmentIds?: number[], type?: string) => {
    if (!currentConversationId) return
    if (editTarget) {
      await editMessage(editTarget.id, content)
      setEditTarget(null)
      setEditText('')
      return
    }
    try {
      await sendMessage(currentConversationId, content, replyTo?.id, attachmentIds, type)
    } catch (e: any) {
      toast('Failed to send: ' + (e.response?.data?.message || e.message), 'error')
    }
  }

  // ─── React ───
  const handleReact = async (id: number, emoji: string) => {
    const currentMsgs = currentMessages
    const msg = currentMsgs.find((m: any) => m.id === id)
    if (!msg || !user) return
    const myReacts = (msg.reactions || []).filter((r: any) => r.user_id === user.id)
    const hasSame = myReacts.some((r: any) => r.emoji === emoji)
    try {
      if (hasSame) {
        const { msgApi } = await import('../services/api')
        await msgApi.removeReaction(id, emoji)
      } else {
        const { msgApi } = await import('../services/api')
        for (const r of myReacts) { try { await msgApi.removeReaction(id, r.emoji) } catch {} }
        await msgApi.react(id, emoji)
      }
    } catch { try { await react(id, emoji) } catch {} }
  }

  // ─── Save/Unsave ───
  const handleSave = async (msg: Message) => {
    const isSaved = savedIds.has(msg.id)
    try {
      if (isSaved) { await savedApi.unsave(msg.id); setSavedIds(s => { const n = new Set(s); n.delete(msg.id); return n }) }
      else { await savedApi.save(msg.id); setSavedIds(s => new Set(s).add(msg.id)) }
    } catch (e: any) { toast(e.response?.data?.message || 'Save failed', 'error') }
  }

  // ─── Forward ───
  const handleForward = async (targetIds: number[]) => {
    if (!forwardMsg) return
    if ((forwardMsg as any).is_encrypted) {
      toast('Encrypted messages cannot be forwarded. Copy the text instead.', 'error')
      setForwardMsg(null)
      return
    }
    try {
      const res = await extendedApi.forward(forwardMsg.id, targetIds)
      if (res.success) { toast(`Forwarded to ${res.data.forwarded_to.length} chats`, 'success'); setForwardMsg(null); fetchConversations() }
    } catch (e: any) { toast(e.response?.data?.detail || 'Forward failed', 'error') }
  }

  // ─── Readable text for single-message AI features ───
  const readableTextFor = async (m: any): Promise<string | null> => {
    if (!m || m.is_deleted) return null
    return m.content || ''
  }

  // ─── AI action ───
  const handleAIAction = async (msg: Message, action: string) => {
    if (action === 'translate') {
      await handleTranslateClick(msg)
      return
    }
    setAiResult(null)
    try {
      const text = await readableTextFor(msg)
      if (!text || !text.trim()) { setAiResult({ text: "Couldn't read this message.", action }); return }
      let res
      if (action === 'summarize') res = await aiApi.summarize(text)
      else res = await aiApi.action(text, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.result || 'No result'
      setAiResult({ text: resultText, action, provider: res.data?.provider })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
  }

  const fetchLanguages = async () => {
    if (languages.length > 0) return
    setLanguagesLoading(true)
    try {
      const res = await aiApi.getLanguages()
      if (res.success && res.data?.languages) setLanguages(res.data.languages)
    } catch {}
    setLanguagesLoading(false)
  }

  const handleLanguageSelect = async (langCode: string, langName: string) => {
    setShowLanguageSelector(false)
    setLanguagesLoading(false)
    if (pendingTranslateMsg) {
      const src = await readableTextFor(pendingTranslateMsg)
      if (!src || !src.trim()) { setAiResult({ text: "Couldn't read this message.", action: 'translate' }); return }
      try {
        setAiLoading(true)
        const res = await aiApi.translate(src, langName)
        const resultText = res.data?.translation || res.data?.result || 'No result'
        setAiResult({ text: resultText, action: 'translate', provider: res.data?.provider })
      } catch { setAiResult({ text: 'AI action failed. Please try again.', action: 'translate' }) }
      setAiLoading(false)
      setPendingTranslateMsg(null)
    } else {
      await handleAiPanelAction('translate', langName)
    }
  }

  const handleTranslateClick = async (msg?: Message) => {
    if (msg) {
      const plain = await readableTextFor(msg)
      if (plain == null || !plain.trim()) { toast("Couldn't read this message.", 'error'); return }
      setPendingTranslateMsg({ ...msg, content: plain } as Message)
    }
    else setPendingTranslateMsg(null)
    await fetchLanguages()
    setShowLanguageSelector(true)
  }

  const handleAiPanelAction = async (action: string, targetLanguage?: string) => {
    setAiLoading(true); setAiError(null)
    try {
      const currentMsgs = currentMessages
      const parts: string[] = []
      for (const m of (currentMsgs as any[]).slice(-10)) {
        if (!m || m.is_deleted) continue
        const text = m.content || ''
        parts.push(`${m.sender_display_name || 'User'}: ${text}`)
      }
      const recentText = parts.join('\n')
      const contextText = recentText || 'No conversation context available.'
      let res
      if (action === 'summarize') res = await aiApi.summarize(contextText)
      else if (action === 'translate') res = await aiApi.translate(contextText, targetLanguage)
      else if (action === 'extract-tasks') res = await aiApi.action(contextText, 'text', 'extract-tasks')
      else if (action === 'unread-summary') res = await aiApi.summarize(contextText)
      else res = await aiApi.action(contextText, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.translation || res.data?.result || 'No result'
      setAiResult({ text: resultText, action, provider: res.data?.provider })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
    setAiLoading(false)
  }

  // ─── Call ───
  const handleCall = (type: 'voice' | 'video') => {
    if (!currentConv) return
    if (currentConv.is_group) return toast('Voice/video calls work in direct chats for now', 'error')
    const other = (currentConv.members || []).find((m: any) => m.user_id !== user?.id)
    if (!other) return toast('No peer to call', 'error')
    callsApi.start({ callee_id: other.user_id, conversation_id: currentConv.id, call_type: type })
      .then((r: any) => { if (r.success) setCallModal({ open: true, type, peerName: other.display_name, peerAvatar: other.avatar_url, incoming: false, callId: r.data.id, peerId: other.user_id }) })
      .catch((e: any) => toast(e.response?.data?.detail || 'Call failed', 'error'))
  }
  const handleCallAccept = async () => {
    if (callModal?.callId) { try { await callsApi.accept(callModal.callId) } catch {}; setCallModal(m => m ? { ...m, incoming: false } : null) }
  }
  const handleCallRejectOrEnd = async () => {
    const cid = callModal?.callId; const wasIncoming = callModal?.incoming
    setCallModal(null)
    if (cid) { try { await callsApi.end(cid, wasIncoming ? 'rejected' : 'ended') } catch {} }
  }
  const handleCallMissed = async () => {
    const cid = callModal?.callId
    if (!cid) { setCallModal(null); return }
    setCallModal(null)
    try { await callsApi.end(cid, 'missed') } catch {}
  }

  // ─── Mute ───
  const handleMute = async () => {
    if (!currentConv) return
    const next = !isMuted
    try { await extendedApi.mute(currentConv.id, next); setIsMuted(next) } catch {}
  }

  // ─── Global search navigation ───
  const handleSearchNavigate = async (cid: number, mid?: number) => {
    setShowSearch(false)
    if (mid) {
      await useChatStore.getState().jumpToMessageId(cid, mid)
    } else {
      await handleSelect(cid)
      return
    }
    setMobileView('chat')
    setMobileNavTab('chats')
  }

  // ─── Message search ───
  const handleMessageSearch = async () => {
    if (!messageSearch.trim()) return
    const msgs = await useChatStore.getState().searchMessages(messageSearch.trim(), currentConversationId || undefined)
    if (msgs.length > 0) {
      const first = msgs[0]; setCurrent(first.conversation_id); fetchMessages(first.conversation_id)
      setMobileView('chat')
      toast(`Found ${msgs.length} messages. Jumped to conversation.`, 'info')
    } else toast('No results', 'info')
  }

  // ─── Pin ───
  const handlePin = async (m: any) => {
    // Local-first pin toggle: no full message reload (that refetch was the
    // visible lag on every pin click). Server response reconciles.
    const pinning = !(m as any).is_pinned
    try {
      updateMessage({ ...m, is_pinned: pinning })
      setPinnedMessages((s: any[]) => pinning
        ? [...s.filter((x: any) => x.id !== m.id), { ...m, is_pinned: true }]
        : s.filter((x: any) => x.id !== m.id))
      const res = pinning ? await msgPinApi.pin(m.id) : await msgPinApi.unpin(m.id)
      if (res?.success && res.data) {
        updateMessage(res.data)
        setPinnedMessages((s: any[]) => pinning
          ? [...s.filter((x: any) => x.id !== m.id), res.data]
          : s.filter((x: any) => x.id !== m.id))
      }
    } catch {
      updateMessage(m)
      if (currentConversationId) {
        msgPinApi.list(currentConversationId)
          .then((r: any) => { if (r.success) setPinnedMessages(r.data) })
          .catch(() => {})
      }
    }
  }

  // ─── Nav panel tab change ───
  const handleNavTabChange = (tab: typeof mobileNavTab) => {
    // One panel at a time: tabs always replace, never stack overlays.
    closeAllPanels()
    setMobileNavTab(tab)
    if (tab === 'chats') {
      setMobileView('list')
      setShowStatus(false)
    } else if (tab === 'status') {
      setMobileView('list')
      setShowStatus(true)
    } else if (tab === 'calls') {
      setMobileView('list')
      setShowCalls(true)
    } else if (tab === 'communities') {
      setMobileView('list')
      setShowCommunities(true)
    } else if (tab === 'channels') {
      setMobileView('list')
      setShowChannels(true)
    } else if (tab === 'ai') {
      nav('/ai')
    }
  }

  // ─── Close panels mutually exclusively ───
  const closeAllPanels = () => {
    setShowProfile(false); setShowGroupInfo(false); setShowSettings(false); setShowNotifications(false)
    setShowSaved(false); setShowContacts(false); setShowCalls(false); setShowStatus(false)
    setShowCommunities(false); setShowChannels(false); setShowReminders(false); setShowHighlights(false)
    setShowPolls(false); setShowPinned(false); setShowEvents(false); setShowSchedule(false); setShowInsights(false)
    setShowAgentPanel(false)
    setShowLeaderboard(false)
    setShowTheme(false)
  }

  // ─── Top-most overlay dismissal (PE-2J) ───
  // Single paint-order source of truth for Escape + OS back: z-90 dialogs
  // first, then the action sheet, ChatModals in reverse DOM order (forward
  // picker > palette > viewer > lightbox — later DOM paints above at equal
  // z), global search, full-screen panels, then inline message search.
  // Returns true when something was closed. CallModal is deliberately
  // excluded: Back/Escape must never dismiss a ringing call.
  const closeTopMost = (): boolean => {
    if (deleteTarget) { setDeleteTarget(null); return true }
    if (infoMsgId != null) { setInfoMsgId(null); return true }
    if (mobileActionSheet.open) { setMobileActionSheet({ open: false }); return true }
    if (forwardMsg) { setForwardMsg(null); return true }
    if (showCommandPalette) { setShowCommandPalette(false); return true }
    if (statusViewer) { setStatusViewer(null); return true }
    if (lightbox) { setLightbox(null); return true }
    if (showSearch) { setShowSearch(false); return true }
    if (showProfile || showGroupInfo || showSettings || showNotifications ||
      showSaved || showReminders || showHighlights || showContacts || showCalls || showStatus || showCommunities || showChannels || showPolls || showPinned ||
      showEvents || showSchedule || showInsights || showAgentPanel || showLeaderboard || showTheme) {
      closeAllPanels(); return true
    }
    if (showMessageSearch) { setShowMessageSearch(false); setMessageSearch(''); return true }
    return false
  }
  // Fresh-state mirror: the window Escape listener below must see current
  // overlay state without re-subscribing on every state change.
  const closeTopRef = useRef(closeTopMost)
  closeTopRef.current = closeTopMost

  // ─── Android system back button (native app only) ───
  // Browser history knows nothing about panels/sheets/chat-view, so without
  // this the OS back button quits the entire app from anywhere. This walks
  // back one layer at a time: overlay → panel → chat→list → quit.
  const capAppRef = useRef<any>(null)
  const backRef = useRef<() => void>(() => {})
  backRef.current = () => {
    // One shared paint-order dismissal (PE-2J): overlay → panel → chat→list → quit.
    if (closeTopMost()) return
    if (mobileView === 'chat') { handleBack(); return }
    // Main list with nothing open: standard Android behavior quits the app.
    try { capAppRef.current?.exitApp() } catch {}
  }
  useEffect(() => {
    if (!isNativeApp()) return
    let off: (() => void) | undefined
    let cancelled = false
    import('@capacitor/app').then(({ App: CapApp }) => {
      if (cancelled) return
      capAppRef.current = CapApp
      CapApp.addListener('backButton', () => backRef.current()).then(
        h => { off = () => { try { h.remove() } catch {} } },
        () => {},
      )
    }).catch(() => {})
    return () => { cancelled = true; off?.() }
  }, [])

  const totalUnread = conversations.reduce((a: number, b: any) => a + b.unread_count, 0)

  // Determine if we should show chat view
  const isDesktop = winWidth >= 1024
  const showChatView = isDesktop || mobileView === 'chat'
  const showSidebar = isDesktop || mobileView === 'list'

  return (
    <ChatLayout>
      {/* Ambient 3D background orbs */}
      <div className="ambient-bg" style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none', overflow: 'hidden', background: 'radial-gradient(ellipse at 25% 15%, rgba(var(--accent-rgb), 0.12) 0%, transparent 55%), radial-gradient(ellipse at 75% 85%, rgba(var(--cyan-rgb), 0.08) 0%, transparent 55%), radial-gradient(ellipse at 50% 50%, rgba(var(--pink-rgb), 0.05) 0%, transparent 60%), #06060e' }}>
        <div style={{ position: 'absolute', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(var(--accent-rgb), 0.18), transparent 70%)', top: -120, right: -120, filter: 'blur(80px)', animation: 'ambientDrift 14s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', width: 320, height: 320, borderRadius: '50%', background: 'radial-gradient(circle, rgba(34,211,238,0.12), transparent 70%)', bottom: '12%', left: -80, filter: 'blur(80px)', animation: 'ambientDrift 18s ease-in-out infinite reverse' }} />
        <div style={{ position: 'absolute', width: 260, height: 260, borderRadius: '50%', background: 'radial-gradient(circle, rgba(244,114,182,0.10), transparent 70%)', bottom: -60, right: '28%', filter: 'blur(80px)', animation: 'ambientDrift 12s ease-in-out infinite' }} />
      </div>
      {/* Bootstrap row shell: single col-12 child on mobile (unchanged look),
          side-by-side columns on desktop (fixes stacked-half-height bug). */}
      <div className="flex-1 min-h-0 overflow-hidden row g-0" style={{ position: 'relative', zIndex: 1 }}>
        {/* Sidebar - conversation list */}
        {showSidebar && (
          <ChatSidebar
            onSelect={handleSelect}
            onStatusViewer={(statuses: any[], idx: number) => setStatusViewer({ statuses, idx })}
            onMobileViewChange={(view: 'list' | 'chat') => setMobileView(view)}
            onMute={handleMute}
            activeTab={sidebarTab}
            onTabChange={(t) => { if (t === 'chats' || t === 'groups') setSidebarTab(t) }}
            onProfile={() => { closeAllPanels(); setShowProfile(true) }}
            onLeaderboard={() => { closeAllPanels(); setShowLeaderboard(true) }}
            onNotifications={() => { closeAllPanels(); setShowNotifications(true) }}
            onSaved={() => { closeAllPanels(); setShowSaved(true) }}
            onReminders={() => { closeAllPanels(); setShowReminders(true) }}
            onHighlights={() => { closeAllPanels(); setShowHighlights(true) }}
            onSettings={() => { closeAllPanels(); setShowSettings(true) }}
            onSearch={() => setShowSearch(true)}
          />
        )}

        {/* Chat panel */}
        {showChatView && (
          <div className="chat-panel col-12 col-lg-8 col-xl-9" style={{ background: 'var(--bg-primary)' }}>
            <ErrorBoundary fallback={(err, stack) =>
              <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
                  <span className="text-xl" style={{ color: 'var(--error)' }}>!</span>
                </div>
                <p className="text-sm text-center" style={{ color: 'var(--text-secondary)' }}>Chat view crashed. Try selecting a conversation again.</p>
                {err?.message && (
                  <p className="text-[11px] text-center font-mono px-3 py-1.5 rounded-lg bg-black/40 max-w-full break-words" style={{ color: 'var(--error)' }}>{err.message}</p>
                )}
                {stack && (
                  <details className="max-w-full">
                    <summary className="text-[11px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>Stack</summary>
                    <pre className="text-[10px] text-left font-mono p-2 rounded-lg bg-black/40 max-w-full overflow-x-auto whitespace-pre-wrap" style={{ color: 'var(--text-secondary)' }}>{stack.split('\n').slice(0, 8).join('\n')}</pre>
                  </details>
                )}
                <button onClick={() => window.location.reload()} className="btn-primary">Reload</button>
              </div>
            }>
              <ChatView
                onBack={handleBack}
                onMobileViewChange={(view: 'list' | 'chat') => setMobileView(view)}
                onCall={handleCall}
                onProfile={() => { closeAllPanels(); setShowProfile(true) }}
                onGroupInfo={() => setShowGroupInfo(!showGroupInfo)}
                replyTo={replyTo}
                setReplyTo={setReplyTo}
                editTarget={editTarget}
                setEditTarget={setEditTarget}
                editText={editText}
                setEditText={setEditText}
                lightbox={lightbox}
                setLightbox={setLightbox}
                forwardMsg={forwardMsg}
                setForwardMsg={setForwardMsg}
                selectedIds={selectedIds}
                setSelectedIds={setSelectedIds}
                savedIds={savedIds}
                setSavedIds={setSavedIds}
                onMobileMore={(msg: Message) => setMobileActionSheet({ open: true, msg })}
                onReact={handleReact}
                onSave={handleSave}
                onAIAction={handleAIAction}
                onPin={handlePin}
                onTheme={() => { closeAllPanels(); setShowTheme(true) }}
                pinnedMessages={pinnedMessages}
                setPinnedMessages={setPinnedMessages}
                aiPanelOpen={aiPanelOpen}
                setAiPanelOpen={setAiPanelOpen}
                aiLoading={aiLoading}
                aiError={aiError}
                aiResult={aiResult}
                setAiResult={setAiResult}
                handleAiPanelAction={handleAiPanelAction}
                isMuted={isMuted}
                onMute={handleMute}
                showPolls={showPolls}
                setShowPolls={setShowPolls}
                showPinned={showPinned}
                setShowPinned={setShowPinned}
                showEvents={showEvents}
                setShowEvents={setShowEvents}
                showSchedule={showSchedule}
                setShowSchedule={setShowSchedule}
                showInsights={showInsights}
                setShowInsights={setShowInsights}
                activeRightTab="chat"
                handleMessageSearch={handleMessageSearch}
                showMessageSearch={showMessageSearch}
                messageSearch={messageSearch}
                setMessageSearch={setMessageSearch}
                onCloseSearch={() => { setShowMessageSearch(false); setMessageSearch('') }}
                onNewChat={handleStartChat}
                totalUnread={totalUnread}
                onNotifications={() => { closeAllPanels(); setShowNotifications(true) }}
                onSearch={() => setShowMessageSearch(!showMessageSearch)}
                onSaved={() => { closeAllPanels(); setShowSaved(true) }}
                onSettings={() => { closeAllPanels(); setShowSettings(true) }}
                onThemeToggle={() => settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
                onLogout={() => { logout(); nav('/login') }}
                showLanguageSelector={showLanguageSelector}
                languages={languages}
                languagesLoading={languagesLoading}
                handleLanguageSelect={handleLanguageSelect}
                handleTranslateClick={handleTranslateClick}
                onCloseLanguageSelector={() => setShowLanguageSelector(false)}
                onAgent={() => { closeAllPanels(); setShowAgentPanel(true) }}
              />
            </ErrorBoundary>

          </div>
        )}

        {/* Panels - always render as full-screen overlay regardless of view state */}
        <ChatPanels
          showProfile={showProfile}
          showGroupInfo={showGroupInfo}
          showSettings={showSettings}
          showNotifications={showNotifications}
          showSaved={showSaved}
          showReminders={showReminders}
          showHighlights={showHighlights}
          showContacts={showContacts}
          showCommunities={showCommunities}
          showChannels={showChannels}
          showCalls={showCalls}
          showStatus={showStatus}
          showPolls={showPolls}
          showPinned={showPinned}
          showEvents={showEvents}
          showSchedule={showSchedule}
          showInsights={showInsights}
          showAgentPanel={showAgentPanel}
          showLeaderboard={showLeaderboard}
          showTheme={showTheme}
          onClose={closeAllPanels}
          onJump={handleSearchNavigate}
          onUnsaveSaved={(mid: number) => setSavedIds((s) => { const n = new Set(s); n.delete(mid); return n })}
          onStatusViewer={(statuses: any[], idx: number) => { closeAllPanels(); setStatusViewer({ statuses, idx }) }}
          onUpdated={() => { fetchConversations(); if (currentConversationId) fetchMessages(currentConversationId) }}
          pinnedMessages={pinnedMessages}
          setPinnedMessages={setPinnedMessages}
          setShowPinned={setShowPinned}
          setShowPolls={setShowPolls}
          setShowEvents={setShowEvents}
          setShowSchedule={setShowSchedule}
          setShowInsights={setShowInsights}
          onChat={handleStartChat}
        />

        {/* Bottom navigation - hidden when viewing a chat on mobile */}
        {(!currentConversationId || mobileView === 'list' || isDesktop) && (
          <MobileNav
            active={mobileNavTab}
            onTabChange={handleNavTabChange}
            unreadCounts={{ chats: totalUnread }}
          />
        )}

        {/* First-run onboarding (PE-1C) */}
        {showOnboarding && (
          <OnboardingPanel
            onDone={() => setShowOnboarding(false)}
            onMobileViewChange={(view: 'list' | 'chat') => setMobileView(view)}
          />
        )}

        {/* Global search (PE-2A) */}
        <GlobalSearch
          open={showSearch}
          onClose={() => setShowSearch(false)}
          onOpenConversation={handleSearchNavigate}
        />

        {/* Modals */}
        <ChatModals
          lightbox={lightbox}
          setLightbox={setLightbox}
          callModal={callModal}
          setCallModal={setCallModal}
          statusViewer={statusViewer}
          setStatusViewer={setStatusViewer}
          forwardMsg={forwardMsg}
          setForwardMsg={setForwardMsg}
          showCommandPalette={showCommandPalette}
          setShowCommandPalette={setShowCommandPalette}
          conversations={conversations}
          onForward={handleForward}
          onNewChat={() => { closeAllPanels() }}
          onNewGroup={() => { closeAllPanels(); window.dispatchEvent(new Event('kb:new-group')) }}
          onNewStatus={() => { closeAllPanels(); setShowStatus(true) }}
          onSettings={() => { closeAllPanels(); setShowSettings(true) }}
          onSaved={() => { closeAllPanels(); setShowSaved(true) }}
          onCalls={() => { closeAllPanels(); setShowCalls(true) }}
          onNotifications={() => { closeAllPanels(); setShowNotifications(true) }}
          onToggleTheme={() => settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })}
          onLogout={() => { logout(); nav('/login') }}
          onCallAccept={handleCallAccept}
          onCallRejectOrEnd={handleCallRejectOrEnd}
          onCallMissed={handleCallMissed}
        />

        {/* Mobile action sheet */}
        <BottomSheet open={mobileActionSheet.open} onClose={() => setMobileActionSheet({ open: false })} title="Message Actions">
          {mobileActionSheet.msg && (
            <>
              <BottomSheetAction icon={<span className="text-lg">👍</span>} label="React" onClick={() => { if (mobileActionSheet.msg) handleReact(mobileActionSheet.msg.id, '👍'); setMobileActionSheet({ open: false }) }} />
              <BottomSheetAction icon={<Reply className="w-5 h-5" />} label="Reply" onClick={() => { if (mobileActionSheet.msg) { setReplyTo({ id: mobileActionSheet.msg.id, content: mobileActionSheet.msg.content || '', sender: mobileActionSheet.msg.sender_display_name || 'Unknown' }); setMobileActionSheet({ open: false }) } }} />
              <BottomSheetAction icon={<Copy className="w-5 h-5" />} label="Copy" onClick={() => { if (mobileActionSheet.msg?.content) { navigator.clipboard.writeText(mobileActionSheet.msg.content); toast('Copied', 'success') }; setMobileActionSheet({ open: false }) }} />
              <BottomSheetAction icon={<Forward className="w-5 h-5" />} label="Forward" onClick={() => { if (mobileActionSheet.msg) { setForwardMsg(mobileActionSheet.msg); setMobileActionSheet({ open: false }) } }} />
              <BottomSheetAction icon={<Bookmark className="w-5 h-5" />}
                label={savedIds.has(mobileActionSheet.msg.id) ? 'Unsave' : 'Save'} onClick={() => { if (mobileActionSheet.msg) { handleSave(mobileActionSheet.msg); setMobileActionSheet({ open: false }) } }} />
              <BottomSheetAction icon={<Pin className="w-5 h-5" />}
                label={pinnedMessages.some((p: any) => p.id === mobileActionSheet.msg?.id) ? 'Unpin' : 'Pin'} onClick={() => { if (mobileActionSheet.msg) { handlePin(mobileActionSheet.msg); setMobileActionSheet({ open: false }) } }} />
              <BottomSheetAction icon={<Sparkles className="w-5 h-5" />} label="Summarize" onClick={() => { if (mobileActionSheet.msg) { handleAIAction(mobileActionSheet.msg, 'summarize'); setMobileActionSheet({ open: false }) } }} />
              <BottomSheetAction icon={<Languages className="w-5 h-5" />} label="Translate" onClick={() => { if (mobileActionSheet.msg) { handleAIAction(mobileActionSheet.msg, 'translate'); setMobileActionSheet({ open: false }) } }} />
              <BottomSheetAction icon={<Clock className="w-5 h-5" />} label="In 1 hour" onClick={() => { const m = mobileActionSheet.msg; if (m) { const t = useChatStore.getState().conversations.find((c: any) => c.id === m.conversation_id)?.title || 'Chat'; scheduleMessageReminder({ convId: m.conversation_id ?? null, convTitle: t, msg: m }, 'hour').then((r) => toast(`Remind set for ${formatFireAt(r.fireAt)}`, 'success')) } setMobileActionSheet({ open: false }) }} />
              <BottomSheetAction icon={<Sunrise className="w-5 h-5" />} label="At 9 AM" onClick={() => { const m = mobileActionSheet.msg; if (m) { const t = useChatStore.getState().conversations.find((c: any) => c.id === m.conversation_id)?.title || 'Chat'; scheduleMessageReminder({ convId: m.conversation_id ?? null, convTitle: t, msg: m }, 'morning').then((r) => toast(`Remind set for ${formatFireAt(r.fireAt)}`, 'success')) } setMobileActionSheet({ open: false }) }} />
              {mobileActionSheet.msg.sender_id === user?.id && (
                <>
                  <BottomSheetAction icon={<Info className="w-5 h-5" />} label="Info" onClick={() => { if (mobileActionSheet.msg) { setInfoMsgId(mobileActionSheet.msg.id); setMobileActionSheet({ open: false }) } }} />
                  <BottomSheetAction icon={<Edit3 className="w-5 h-5" />} label="Edit" onClick={() => { if (mobileActionSheet.msg && !(mobileActionSheet.msg as any).is_encrypted && !(mobileActionSheet.msg as any).view_once) { setEditTarget(mobileActionSheet.msg); setEditText(mobileActionSheet.msg.content || ''); setMobileActionSheet({ open: false }) } }} />
                  <BottomSheetAction icon={<Trash2 className="w-5 h-5" />} label="Delete" destructive onClick={() => { if (mobileActionSheet.msg) { setDeleteTarget(mobileActionSheet.msg); setMobileActionSheet({ open: false }) } }} />
                </>
              )}
            </>
          )}
        </BottomSheet>

        {infoMsgId != null && (
          <MessageInfo msgId={infoMsgId} onClose={() => setInfoMsgId(null)} />
        )}

        {deleteTarget && (
          <DeleteDialog
            onForMe={() => {
              if (deleteTarget.conversation_id != null) {
                hideMessage(deleteTarget.conversation_id, deleteTarget.id)
                useChatStore.getState().bumpHiddenTick()
              }
            }}
            onForEveryone={() => {
              deleteMessage(deleteTarget.id).catch(() => toast('Delete failed', 'error'))
            }}
            onClose={() => setDeleteTarget(null)}
          />
        )}
      </div>
    </ChatLayout>
  )
}
