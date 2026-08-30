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
import { msgPinApi, aiApi } from '../services/api'
import { convApi, extendedApi, savedApi, callsApi } from '../services/api'
import { useToastStore } from '../store/toast'
import { Message } from '../types'
import { Reply, Copy, Forward, Bookmark, Sparkles, Languages, Edit3, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import wsService from '../services/websocket'

type NavPanelTab = 'chats' | 'contacts' | 'groups' | 'calls' | 'saved' | 'files' | 'settings'

export default function ChatPage() {
  const { user, logout } = useAuthStore()
  const toast = useToastStore(s => s.push)
  const settings = useSettingsStore()
  const nav = useNavigate()
  const {
    conversations, currentConversationId, messages, hasMore, loadingMessages, loadingConvs,
    fetchConversations, setCurrent, fetchMessages, sendMessage, editMessage, deleteMessage, react
  } = useChatStore() as any

  const [mobileView, setMobileView] = useState<'list' | 'chat'>(typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'chat' : 'list')
  const [mobileNavTab, setMobileNavTab] = useState<'chats' | 'status' | 'calls' | 'contacts' | 'ai'>('chats')
  const [activeNavTab, setActiveNavTab] = useState<NavPanelTab>('chats')
  const [showProfile, setShowProfile] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [showCalls, setShowCalls] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [showPolls, setShowPolls] = useState(false)
  const [showPinned, setShowPinned] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showInsights, setShowInsights] = useState(false)
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
  const [aiResult, setAiResult] = useState<{ text: string; action: string } | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([])
  const [mobileActionSheet, setMobileActionSheet] = useState<{ open: boolean; msg?: Message }>({ open: false })
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  const currentConv = conversations.find((c: any) => c.id === currentConversationId) || null

  // ─── Init: WS, token, saved IDs ───
  useEffect(() => {
    initChatWS()
    settings.init()
    const token = localStorage.getItem('kb_token')
    if (token) wsService.connect(token)
    fetchConversations()
    savedApi.list().then((r: any) => { if (r.success) setSavedIds(new Set(r.data.map((x: any) => x.message_id))) })
    const off1 = wsService.on('call.incoming', (p: any) => {
      setCallModal({ open: true, type: p.call_type || 'voice', peerName: p.caller_display || p.caller_username || 'Unknown', peerAvatar: null, incoming: true, callId: p.id, peerId: p.caller_id })
    })
    const off2 = wsService.on('call.ended', () => setCallModal(null))
    const off3 = wsService.on('call.accepted', () => {})
    return () => { off1(); off2(); off3() }
  }, [])

  // ─── Keyboard shortcuts ───
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCommandPalette(true) }
      if (e.key === 'Escape') {
        setShowProfile(false); setShowSettings(false); setShowNotifications(false)
        setShowSaved(false); setShowContacts(false); setShowCalls(false); setShowStatus(false)
        setStatusViewer(null); setForwardMsg(null); setLightbox(null); setEditTarget(null)
        setReplyTo(null); setShowCommandPalette(false); setShowPolls(false); setShowPinned(false)
        setShowEvents(false); setShowSchedule(false); setShowInsights(false)
        setMobileActionSheet({ open: false }); setShowMessageSearch(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

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
    try { const res = await msgPinApi.list(id); if (res.success) setPinnedMessages(res.data) } catch {}
  }

  // ─── Start chat from user search ───
  const handleStartChat = async (targetUser: any) => {
    try {
      const res = await convApi.create({ participant_id: targetUser.id })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
        if (window.innerWidth < 1024) setMobileView('chat')
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
    const currentMsgs = currentConversationId ? (messages[currentConversationId] || []) : []
    const msg = currentMsgs.find((m: any) => m.id === id)
    if (!msg || !user) return
    const myReacts = msg.reactions.filter((r: any) => r.user_id === user.id)
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
    try {
      const res = await extendedApi.forward(forwardMsg.id, targetIds)
      if (res.success) { toast(`Forwarded to ${res.data.forwarded_to.length} chats`, 'success'); setForwardMsg(null); fetchConversations() }
    } catch (e: any) { toast(e.response?.data?.detail || 'Forward failed', 'error') }
  }

  // ─── AI action ───
  const handleAIAction = async (msg: Message, action: string) => {
    setAiResult(null)
    try {
      const text = msg.content || ''
      let res
      if (action === 'summarize') res = await aiApi.summarize(text)
      else if (action === 'translate') res = await aiApi.translate(text)
      else res = await aiApi.action(text, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.translation || res.data?.result || 'No result'
      setAiResult({ text: resultText, action })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
  }

  const handleAiPanelAction = async (action: string) => {
    setAiLoading(true); setAiError(null)
    try {
      const currentMsgs = currentConversationId ? (messages[currentConversationId] || []) : []
      const recentText = currentMsgs.slice(-10).map((m: any) => `${m.sender_display_name || 'User'}: ${m.content}`).join('\n')
      const contextText = recentText || 'No conversation context available.'
      let res
      if (action === 'summarize') res = await aiApi.summarize(contextText)
      else if (action === 'translate') res = await aiApi.translate(contextText)
      else if (action === 'extract-tasks') res = await aiApi.action(contextText, 'text', 'extract-tasks')
      else if (action === 'unread-summary') res = await aiApi.summarize(contextText)
      else res = await aiApi.action(contextText, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.translation || res.data?.result || 'No result'
      setAiResult({ text: resultText, action })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
    setAiLoading(false)
  }

  // ─── Call ───
  const handleCall = (type: 'voice' | 'video') => {
    if (!currentConv) return
    const other = currentConv.members.find((m: any) => m.user_id !== user?.id)
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

  // ─── Mute ───
  const handleMute = async () => {
    if (!currentConv) return
    const next = !isMuted
    try { await extendedApi.mute(currentConv.id, next); setIsMuted(next) } catch {}
  }

  // ─── Message search ───
  const handleMessageSearch = async () => {
    if (!messageSearch.trim()) return
    const msgs = await useChatStore.getState().searchMessages(messageSearch.trim(), currentConversationId || undefined)
    if (msgs.length > 0) {
      const first = msgs[0]; setCurrent(first.conversation_id); fetchMessages(first.conversation_id)
      if (window.innerWidth < 1024) setMobileView('chat')
      toast(`Found ${msgs.length} messages. Jumped to conversation.`, 'info')
    } else toast('No results', 'info')
  }

  // ─── Pin ───
  const handlePin = async (m: any) => {
    try {
      if ((m as any).is_pinned) { await msgPinApi.unpin(m.id) } else { await msgPinApi.pin(m.id) }
      if (currentConversationId) { const res = await msgPinApi.list(currentConversationId); if (res.success) setPinnedMessages(res.data) }
      fetchMessages(currentConversationId!)
    } catch {}
  }

  // ─── Toggle theme ───
  const handleToggleTheme = () => {
    settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
  }

  // ─── Nav panel tab change ───
  const handleNavTabChange = (tab: NavPanelTab) => {
    setActiveNavTab(tab)
    if (tab === 'chats' || tab === 'groups') {
      // Already showing conversation list
    } else if (tab === 'contacts') {
      setShowContacts(true)
    } else if (tab === 'calls') {
      setShowCalls(true)
    } else if (tab === 'saved') {
      setShowSaved(true)
    } else if (tab === 'settings') {
      setShowSettings(true)
    }
  }

  // ─── Mobile view auto-switch ───
  useEffect(() => { if (currentConversationId && window.innerWidth < 1024) setMobileView('chat') }, [currentConversationId])

  // ─── Close panels mutually exclusively ───
  const closeAllPanels = () => {
    setShowProfile(false); setShowGroupInfo(false); setShowSettings(false); setShowNotifications(false)
    setShowSaved(false); setShowContacts(false); setShowCalls(false); setShowStatus(false)
    setShowPolls(false); setShowPinned(false); setShowEvents(false); setShowSchedule(false); setShowInsights(false)
  }

  const totalUnread = conversations.reduce((a: number, b: any) => a + b.unread_count, 0)

  // Map sidebar tab for ChatSidebar
  const sidebarTab: 'chats' | 'groups' | 'status' | 'calls' | 'contacts' | 'saved' = activeNavTab === 'groups' ? 'groups' : 'chats'

  return (
    <ChatLayout
      activeNavTab={activeNavTab}
      onNavTabChange={handleNavTabChange}
      onSettings={() => { closeAllPanels(); setShowSettings(true) }}
      totalUnread={totalUnread}
    >
      <ChatSidebar
        onSelect={(id: number) => { handleSelect(id); setMobileView('chat') }}
        onStatusViewer={(statuses: any[], idx: number) => setStatusViewer({ statuses, idx })}
        onMobileViewChange={(view: 'list' | 'chat') => setMobileView(view)}
        onMute={handleMute}
        activeTab={sidebarTab as any}
        onTabChange={(tab) => {
          if (tab === 'chats' || tab === 'groups') setActiveNavTab(tab)
        }}
      />

      <div className="chat-panel chat-scenic-bg">
        <div className="ambient-orb ambient-orb--violet" aria-hidden="true" />
        <div className="ambient-orb ambient-orb--teal" aria-hidden="true" />
        <div className="ambient-orb ambient-orb--orange" aria-hidden="true" />
        <ChatView
          onBack={() => { setMobileView('list'); setReplyTo(null); setEditTarget(null); setEditText(''); setSelectedIds(new Set()); setShowMessageSearch(false) }}
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
          onNewChat={handleStartChat}
          totalUnread={totalUnread}
          onNotifications={() => { closeAllPanels(); setShowNotifications(true) }}
          onSearch={() => setShowMessageSearch(!showMessageSearch)}
          onSaved={() => { closeAllPanels(); setShowSaved(true) }}
          onSettings={() => { closeAllPanels(); setShowSettings(true) }}
          onThemeToggle={handleToggleTheme}
          onLogout={() => { logout(); nav('/login') }}
        />

        <ChatPanels
          showProfile={showProfile}
          showGroupInfo={showGroupInfo}
          showSettings={showSettings}
          showNotifications={showNotifications}
          showPolls={showPolls}
          showPinned={showPinned}
          showEvents={showEvents}
          showSchedule={showSchedule}
          showInsights={showInsights}
          onClose={closeAllPanels}
          onJump={(cid: number) => { setCurrent(cid); fetchMessages(cid); setMobileView('chat') }}
          pinnedMessages={pinnedMessages}
          setPinnedMessages={setPinnedMessages}
          setShowPinned={setShowPinned}
          setShowPolls={setShowPolls}
          setShowEvents={setShowEvents}
          setShowSchedule={setShowSchedule}
          setShowInsights={setShowInsights}
          onChat={handleStartChat}
        />
      </div>

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
        onNewGroup={() => { closeAllPanels() }}
        onNewStatus={() => { closeAllPanels(); setShowStatus(true) }}
        onSettings={() => { closeAllPanels(); setShowSettings(true) }}
        onSaved={() => { closeAllPanels(); setShowSaved(true) }}
        onCalls={() => { closeAllPanels(); setShowCalls(true) }}
        onNotifications={() => { closeAllPanels(); setShowNotifications(true) }}
        onToggleTheme={handleToggleTheme}
        onLogout={() => { logout(); nav('/login') }}
        onCallAccept={handleCallAccept}
        onCallRejectOrEnd={handleCallRejectOrEnd}
      />

      <MobileNav active={mobileNavTab} onTabChange={(tab) => {
        setMobileNavTab(tab)
        if (tab === 'ai') nav('/ai')
        else if (tab === 'chats') { closeAllPanels(); setMobileView('list') }
        else if (tab === 'status') { closeAllPanels(); setShowStatus(true); setMobileView('list') }
        else if (tab === 'calls') { closeAllPanels(); setShowCalls(true); setMobileView('list') }
        else if (tab === 'contacts') { closeAllPanels(); setShowContacts(true); setMobileView('list') }
      }} />

      <BottomSheet open={mobileActionSheet.open} onClose={() => setMobileActionSheet({ open: false })} title="Message Actions">
        {mobileActionSheet.msg && (
          <>
            <BottomSheetAction icon={<span>👍</span>} label="React" onClick={() => { if (mobileActionSheet.msg) handleReact(mobileActionSheet.msg.id, '👍'); setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Reply className="w-4 h-4" />} label="Reply" onClick={() => { if (mobileActionSheet.msg) { setReplyTo({ id: mobileActionSheet.msg.id, content: mobileActionSheet.msg.content || '', sender: mobileActionSheet.msg.sender_display_name || 'Unknown' }); setMobileActionSheet({ open: false }) } }} />
            <BottomSheetAction icon={<Copy className="w-4 h-4" />} label="Copy" onClick={() => { if (mobileActionSheet.msg?.content) { navigator.clipboard.writeText(mobileActionSheet.msg.content); toast('Copied', 'success') }; setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Forward className="w-4 h-4" />} label="Forward" onClick={() => { if (mobileActionSheet.msg) { setForwardMsg(mobileActionSheet.msg); setMobileActionSheet({ open: false }) } }} />
            <BottomSheetAction icon={<Bookmark className="w-4 h-4" />} label={savedIds.has(mobileActionSheet.msg.id) ? 'Unsave' : 'Save'} onClick={() => { if (mobileActionSheet.msg) { handleSave(mobileActionSheet.msg); setMobileActionSheet({ open: false }) } }} />
            <BottomSheetAction icon={<Sparkles className="w-4 h-4" />} label="Summarize" onClick={() => { if (mobileActionSheet.msg) { handleAIAction(mobileActionSheet.msg, 'summarize'); setMobileActionSheet({ open: false }) } }} />
            <BottomSheetAction icon={<Languages className="w-4 h-4" />} label="Translate" onClick={() => { if (mobileActionSheet.msg) { handleAIAction(mobileActionSheet.msg, 'translate'); setMobileActionSheet({ open: false }) } }} />
            {mobileActionSheet.msg.sender_id === user?.id && (
              <>
                <BottomSheetAction icon={<Edit3 className="w-4 h-4" />} label="Edit" onClick={() => { if (mobileActionSheet.msg) { setEditTarget(mobileActionSheet.msg); setEditText(mobileActionSheet.msg.content || ''); setMobileActionSheet({ open: false }) } }} />
                <BottomSheetAction icon={<Trash2 className="w-4 h-4" />} label="Delete" destructive onClick={() => { if (mobileActionSheet.msg && confirm('Delete?')) { deleteMessage(mobileActionSheet.msg.id); setMobileActionSheet({ open: false }) } }} />
              </>
            )}
          </>
        )}
      </BottomSheet>
    </ChatLayout>
  )
}
