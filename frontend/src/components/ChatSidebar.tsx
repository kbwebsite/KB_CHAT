import { useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { ConversationList } from './ConversationList'
import { UserSearch } from './UserSearch'
import { StatusPanel } from './StatusPanel'
import { ContactsPanel } from './ContactsPanel'
import { SavedMessagesPanel } from './SavedMessagesPanel'
import { CallsPanel } from './CallsPanel'
import { convApi } from '../services/api'
import { Plus, Search, Settings, UserPlus, Trophy } from 'lucide-react'

type SidebarTab = 'chats' | 'groups' | 'calls' | 'contacts' | 'saved'

export function ChatSidebar({
  onSelect,
  onStatusViewer,
  onMobileViewChange,
  onMute,
  activeTab,
  onTabChange,
  onProfile,
  onLeaderboard,
}: {
  onSelect: (id: number) => void
  onStatusViewer: (statuses: any[], idx: number) => void
  onMobileViewChange: (view: 'list' | 'chat') => void
  onMute?: () => void
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  onProfile?: () => void
  onLeaderboard?: () => void
}) {
  const { user } = useAuthStore()
  const {
    conversations, currentConversationId, messages, typingUsers,
    loadingConvs, fetchConversations, setCurrent, fetchMessages
  } = useChatStore() as any

  const [search, setSearch] = useState('')
  const [showUserSearch, setShowUserSearch] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showCalls, setShowCalls] = useState(false)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupTitle, setGroupTitle] = useState('')
  const [groupMembers, setGroupMembers] = useState<any[]>([])

  const typingMap = typingUsers

  const filteredByTab = (() => {
    let base = conversations
    if (activeTab === 'groups') base = base.filter((c: any) => c.is_group)
    if (search) {
      const s = search.toLowerCase()
      base = base.filter((c: any) =>
        (c.title || '').toLowerCase().includes(s) ||
        c.last_message?.content?.toLowerCase().includes(s)
      )
    }
    return base
  })()

  const handleSelect = async (id: number) => {
    onSelect(id)
    setShowContacts(false)
    setShowSaved(false)
    setShowCalls(false)
    setShowUserSearch(false)
    onMobileViewChange('chat')
  }

  const handleStartChat = async (targetUser: any) => {
    try {
      const res = await convApi.create({ participant_id: targetUser.id })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
        setShowUserSearch(false)
        setShowContacts(false)
        onTabChange('chats')
        onMobileViewChange('chat')
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  const handleCreateGroup = async () => {
    if (!groupTitle.trim() || groupMembers.length === 0) return
    try {
      const res = await convApi.create({
        is_group: true,
        title: groupTitle,
        member_ids: groupMembers.map((m: any) => m.id)
      })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
        setShowNewGroup(false)
        setGroupTitle('')
        setGroupMembers([])
      }
    } catch (e: any) {
      console.error(e)
    }
  }

  const handlePin = async (id: number) => {
    try { await convApi.pin(id); fetchConversations() } catch {}
  }

  const handleArchive = async (id: number) => {
    try { await convApi.archive(id); fetchConversations() } catch {}
  }

  return (
    <div className="conv-panel">
      {/* Mobile Header */}
      <div className="mobile-header" style={{ background: 'rgba(6,6,14,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
        <h1 className="mobile-header-title gradient-text" style={{ fontWeight: 800 }}>Kryzen</h1>
        <button
          onClick={onLeaderboard}
          className="btn-icon"
          aria-label="Leaderboard"
        >
          <Trophy className="w-5 h-5" />
        </button>
        <button
          onClick={() => setShowUserSearch(!showUserSearch)}
          className="btn-icon"
          aria-label="New Chat"
        >
          <UserPlus className="w-5 h-5" />
        </button>
        <button
          onClick={onProfile}
          className="btn-icon"
          aria-label="Profile"
        >
          {user?.avatar_url ? (
            <img
              src={user.avatar_url}
              alt=""
              className="w-7 h-7 rounded-full object-cover"
            />
          ) : (
            <div className="w-7 h-7 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold">
              {(user?.display_name || user?.username || '?')[0].toUpperCase()}
            </div>
          )}
        </button>
      </div>

      {/* Search */}
      {!showContacts && !showSaved && !showCalls && (
        <div className="search-bar" style={{ background: 'rgba(20,20,42,0.6)', border: '1px solid rgba(255,255,255,0.06)', backdropFilter: 'blur(12px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.02)' }}>
          <Search className="w-4 h-4 text-tertiary" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search conversations..."
            aria-label="Search conversations"
          />
        </div>
      )}

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {showContacts ? (
          <ContactsPanel onClose={() => setShowContacts(false)} onChat={handleStartChat} />
        ) : showSaved ? (
          <SavedMessagesPanel onClose={() => setShowSaved(false)} onJump={(cid: number) => { setCurrent(cid); fetchMessages(cid); setShowSaved(false); onMobileViewChange('chat') }} />
        ) : showCalls ? (
          <CallsPanel onClose={() => setShowCalls(false)} />
        ) : (
          <>
            {showUserSearch && (
              <div className="animate-slide-down">
                <UserSearch onSelect={handleStartChat} />
                <button
                  onClick={() => setShowUserSearch(false)}
                  className="w-full py-3 text-sm text-secondary hover:bg-elevated transition-colors"
                >
                  Close
                </button>
              </div>
            )}
            {showNewGroup && (
              <div className="p-4 space-y-3 animate-slide-down border-b border-subtle">
                <h3 className="font-semibold text-sm">New Group</h3>
                <input
                  value={groupTitle}
                  onChange={e => setGroupTitle(e.target.value)}
                  placeholder="Group name"
                  className="w-full px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm"
                />
                <div className="flex flex-wrap gap-1.5">
                  {groupMembers.map((m: any) => (
                    <span key={m.id} className="px-2.5 py-1 rounded-full gradient-primary text-white text-xs flex items-center gap-1">
                      {m.display_name}
                      <button onClick={() => setGroupMembers(gm => gm.filter((x: any) => x.id !== m.id))}>×</button>
                    </span>
                  ))}
                </div>
                <UserSearch onSelect={(u: any) => {
                  if (!groupMembers.find((m: any) => m.id === u.id)) setGroupMembers([...groupMembers, u])
                }} />
                <div className="flex gap-2">
                  <button onClick={handleCreateGroup} className="flex-1 py-2.5 rounded-xl btn-primary text-sm font-medium">
                    Create
                  </button>
                  <button onClick={() => setShowNewGroup(false)} className="px-4 py-2.5 rounded-xl btn-secondary text-sm">
                    Cancel
                  </button>
                </div>
              </div>
            )}
            <div className="flex-1 min-h-0">
              <ConversationList
                conversations={filteredByTab}
                activeId={currentConversationId}
                onSelect={(id: number) => handleSelect(id)}
                search={search}
                onSearch={setSearch}
                typingMap={typingMap}
                currentUserId={user?.id}
                onPin={handlePin}
                onArchive={handleArchive}
                onMute={onMute}
                loading={loadingConvs}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
