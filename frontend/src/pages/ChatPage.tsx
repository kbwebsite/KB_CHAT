import { useEffect, useState, useRef } from 'react'
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
import { CommandPalette, buildCommands } from '../components/CommandPalette'
import { msgPinApi, extendedApi, callsApi } from '../services/api'
import { Message } from '../types'
import { Reply, Copy, Forward, Bookmark, Sparkles, Languages, Edit3, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import wsService from '../services/websocket'

export default function ChatPage() {
  const { user, logout } = useAuthStore()
  const settings = useSettingsStore()
  const nav = useNavigate()
  const {
    conversations, currentConversationId, messages, fetchConversations, setCurrent, fetchMessages, sendMessage, editMessage, deleteMessage
  } = useChatStore() as any

  const [mobileView, setMobileView] = useState<'list' | 'chat'>(typeof window !== 'undefined' && window.innerWidth >= 1024 ? 'chat' : 'list')
  const [mobileNavTab, setMobileNavTab] = useState<'chats' | 'status' | 'calls' | 'contacts' | 'ai'>('chats')
  const [showProfile, setShowProfile] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showCommandPalette, setShowCommandPalette] = useState(false)
  const [replyTo, setReplyTo] = useState<{ id: number; content: string; sender: string } | null>(null)
  const [editTarget, setEditTarget] = useState<Message | null>(null)
  const [editText, setEditText] = useState('')
  const [lightbox, setLightbox] = useState<{ images: { url: string; name: string }[]; idx: number } | null>(null)
  const [forwardMsg, setForwardMsg] = useState<Message | null>(null)
  const [callModal, setCallModal] = useState<{ open: boolean; type: 'voice' | 'video'; peerName: string; peerAvatar?: string | null; incoming?: boolean; callId?: number; peerId?: number } | null>(null)
  const [statusViewer, setStatusViewer] = useState<{ statuses: any[]; idx: number } | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<number>>(new Set())
  const [mobileActionSheet, setMobileActionSheet] = useState<{ open: boolean; msg?: Message }>({ open: false })
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([])
  const [showPinned, setShowPinned] = useState(false)
  const [showPolls, setShowPolls] = useState(false)
  const [showEvents, setShowEvents] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)
  const [showInsights, setShowInsights] = useState(false)

  useEffect(() => {
    initChatWS()
    settings.init()
    const token = localStorage.getItem('kb_token')
    if (token) wsService.connect(token)
    fetchConversations()
    const off1 = wsService.on('call.incoming', (p: any) => {
      setCallModal({ open: true, type: p.call_type || 'voice', peerName: p.caller_display || p.caller_username || 'Unknown', peerAvatar: null, incoming: true, callId: p.id, peerId: p.caller_id })
    })
    const off2 = wsService.on('call.ended', () => setCallModal(null))
    return () => { off1(); off2() }
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setShowCommandPalette(true) }
      if (e.key === 'Escape') { setShowProfile(false); setShowSettings(false); setShowNotifications(false); setForwardMsg(null); setLightbox(null); setEditTarget(null); setReplyTo(null); setShowCommandPalette(false) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const currentConv = conversations.find((c: any) => c.id === currentConversationId) || null

  const handleCall = (type: 'voice' | 'video') => {
    if (!currentConv) return
    const other = currentConv.members.find((m: any) => m.user_id !== user?.id)
    if (!other) return
    callsApi.start({ callee_id: other.user_id, conversation_id: currentConv.id, call_type: type })
      .then((r: any) => {
        if (r.success) setCallModal({ open: true, type, peerName: other.display_name, peerAvatar: other.avatar_url, incoming: false, callId: r.data.id, peerId: other.user_id })
      })
      .catch(() => {})
  }

  const handleForward = async (targetIds: number[]) => {
    if (!forwardMsg) return
    try {
      const res = await extendedApi.forward(forwardMsg.id, targetIds)
      if (res.success) { setForwardMsg(null); fetchConversations() }
    } catch {}
  }

  const handleToggleTheme = () => {
    settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
  }

  useEffect(() => {
    if (currentConversationId && window.innerWidth < 1024) setMobileView('chat')
  }, [currentConversationId])

  return (
    <ChatLayout>
      <div className={`${mobileView === 'chat' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0 min-h-0 overflow-hidden`}>
        <ChatSidebar
          onSelect={(id: number) => { setCurrent(id); fetchMessages(id); setMobileView('chat') }}
          onStatusViewer={(statuses: any[], idx: number) => setStatusViewer({ statuses, idx })}
          onMobileViewChange={(view: 'list' | 'chat') => setMobileView(view)}
        />
      </div>

      <section className={`${mobileView === 'list' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-surface-2/50`}>
        <ChatView
          onBack={() => { setMobileView('list'); setReplyTo(null); setEditTarget(null); setEditText(''); setSelectedIds(new Set()) }}
          onMobileViewChange={(view: 'list' | 'chat') => setMobileView(view)}
          onCall={handleCall}
          onProfile={() => setShowProfile(true)}
          onGroupInfo={(show: boolean) => setShowGroupInfo(!show)}
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
        />
      </section>

      {(showProfile || showGroupInfo || showSettings || showNotifications || showPinned || showPolls || showEvents || showSchedule || showInsights) && (
        <ChatPanels
          showProfile={showProfile}
          showGroupInfo={showGroupInfo}
          showSettings={showSettings}
          showNotifications={showNotifications}
          showPinned={showPinned}
          showPolls={showPolls}
          showEvents={showEvents}
          showSchedule={showSchedule}
          showInsights={showInsights}
          onClose={() => { setShowProfile(false); setShowGroupInfo(false); setShowSettings(false); setShowNotifications(false); setShowPinned(false); setShowPolls(false); setShowEvents(false); setShowSchedule(false); setShowInsights(false) }}
          onJump={(cid: number) => { setCurrent(cid); fetchMessages(cid); setMobileView('chat') }}
          pinnedMessages={pinnedMessages}
          setPinnedMessages={setPinnedMessages}
          setShowPinned={setShowPinned}
          setShowPolls={setShowPolls}
          setShowEvents={setShowEvents}
          setShowSchedule={setShowSchedule}
          setShowInsights={setShowInsights}
        />
      )}

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
        onNewChat={() => {}}
        onNewGroup={() => {}}
        onNewStatus={() => {}}
        onSettings={() => setShowSettings(true)}
        onSaved={() => {}}
        onCalls={() => {}}
        onNotifications={() => setShowNotifications(true)}
        onToggleTheme={handleToggleTheme}
        onLogout={() => { logout(); nav('/login') }}
      />

      <MobileNav active={mobileNavTab} onTabChange={(tab) => {
        setMobileNavTab(tab)
        if (tab === 'ai') nav('/ai')
        else if (tab === 'chats') { setMobileView('list') }
        else if (tab === 'status') { setMobileView('list') }
        else if (tab === 'calls') { setMobileView('list') }
        else if (tab === 'contacts') { setMobileView('list') }
      }} />

      <BottomSheet open={mobileActionSheet.open} onClose={() => setMobileActionSheet({ open: false })} title="Message Actions">
        {mobileActionSheet.msg && (
          <>
            <BottomSheetAction icon={<span>👍</span>} label="React" onClick={() => { setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Reply className="w-4 h-4" />} label="Reply" onClick={() => { setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Copy className="w-4 h-4" />} label="Copy" onClick={() => { setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Forward className="w-4 h-4" />} label="Forward" onClick={() => { setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Bookmark className="w-4 h-4" />} label="Save" onClick={() => { setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Sparkles className="w-4 h-4" />} label="Summarize" onClick={() => { setMobileActionSheet({ open: false }) }} />
            <BottomSheetAction icon={<Languages className="w-4 h-4" />} label="Translate" onClick={() => { setMobileActionSheet({ open: false }) }} />
            {mobileActionSheet.msg.sender_id === user?.id && (
              <>
                <BottomSheetAction icon={<Edit3 className="w-4 h-4" />} label="Edit" onClick={() => { setMobileActionSheet({ open: false }) }} />
                <BottomSheetAction icon={<Trash2 className="w-4 h-4" />} label="Delete" destructive onClick={() => { setMobileActionSheet({ open: false }) }} />
              </>
            )}
          </>
        )}
      </BottomSheet>
    </ChatLayout>
  )
}