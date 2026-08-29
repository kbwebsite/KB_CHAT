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
import { Plus } from 'lucide-react'

type SidebarTab = 'chats' | 'groups' | 'status' | 'calls' | 'contacts' | 'saved'

export function ChatSidebar({
  onSelect,
  onStatusViewer,
  onMobileViewChange,
  onMute,
  activeTab,
  onTabChange,
}: {
  onSelect: (id: number) => void
  onStatusViewer: (statuses: any[], idx: number) => void
  onMobileViewChange: (view: 'list' | 'chat') => void
  onMute?: () => void
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
}) {
  const { user } = useAuthStore()
  const {
    conversations, currentConversationId, messages, typingUsers,
    loadingConvs, fetchConversations, setCurrent, fetchMessages
  } = useChatStore() as any

  const [search, setSearch] = useState('')
  const [showUserSearch, setShowUserSearch] = useState(false)
  const [showStatus, setShowStatus] = useState(false)
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
    setCurrent(id)
    fetchMessages(id)
    setShowStatus(false)
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
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <h2 className="font-bold text-base">Chats</h2>
        <button
          onClick={() => setShowUserSearch(!showUserSearch)}
          className="w-8 h-8 rounded-xl gradient-primary flex items-center justify-center text-white hover:scale-105 transition-transform"
          title="New Chat"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {showStatus ? (
          <StatusPanel onClose={() => setShowStatus(false)} onViewer={(s: any, all: any[]) => onStatusViewer(all, all.findIndex((x: any) => x.id === s.id))} />
        ) : showContacts ? (
          <ContactsPanel onClose={() => setShowContacts(false)} onChat={handleStartChat} />
        ) : showSaved ? (
          <SavedMessagesPanel onClose={() => setShowSaved(false)} onJump={(cid: number) => { setCurrent(cid); fetchMessages(cid); setShowSaved(false); onMobileViewChange('chat') }} />
        ) : showCalls ? (
          <CallsPanel onClose={() => setShowCalls(false)} />
        ) : (
          <>
            {showUserSearch && (
              <div className="border-b border-border">
                <UserSearch onSelect={handleStartChat} />
                <button onClick={() => setShowUserSearch(false)} className="w-full text-xs py-2 text-muted-foreground hover:bg-muted/50 transition-colors">
                  Close
                </button>
              </div>
            )}
            {showNewGroup && (
              <div className="p-3 border-b border-border space-y-2">
                <h3 className="font-medium text-sm">New Group</h3>
                <input
                  value={groupTitle}
                  onChange={e => setGroupTitle(e.target.value)}
                  placeholder="Group name"
                  className="w-full px-3 py-2 rounded-xl bg-muted border border-border outline-none text-sm"
                />
                <div className="flex flex-wrap gap-1">
                  {groupMembers.map((m: any) => (
                    <span key={m.id} className="px-2 py-1 rounded-full gradient-primary text-white text-xs flex items-center gap-1">
                      {m.display_name}
                      <button onClick={() => setGroupMembers(gm => gm.filter((x: any) => x.id !== m.id))}>×</button>
                    </span>
                  ))}
                </div>
                <UserSearch onSelect={(u: any) => {
                  if (!groupMembers.find((m: any) => m.id === u.id)) setGroupMembers([...groupMembers, u])
                }} />
                <div className="flex gap-2">
                  <button onClick={handleCreateGroup} className="flex-1 py-2 rounded-xl btn-gradient text-sm font-medium text-white">
                    Create
                  </button>
                  <button onClick={() => setShowNewGroup(false)} className="px-4 py-2 rounded-xl bg-muted border border-border text-sm">
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
