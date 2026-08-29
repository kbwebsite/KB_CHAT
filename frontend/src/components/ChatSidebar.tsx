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
import { MessageSquare, Users, Phone, Contact, Bookmark, Plus } from 'lucide-react'

type SidebarTab = 'chats' | 'groups' | 'status' | 'calls' | 'contacts' | 'saved'

export function ChatSidebar({
  onSelect,
  onStatusViewer,
  onMobileViewChange,
  onMute
}: {
  onSelect: (id: number) => void
  onStatusViewer: (statuses: any[], idx: number) => void
  onMobileViewChange: (view: 'list' | 'chat') => void
  onMute?: () => void
}) {
  const { user } = useAuthStore()
  const {
    conversations, currentConversationId, messages, typingUsers,
    loadingConvs, fetchConversations, setCurrent, fetchMessages
  } = useChatStore() as any

  const [search, setSearch] = useState('')
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('chats')
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
    if (sidebarTab === 'groups') base = base.filter((c: any) => c.is_group)
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
        setSidebarTab('chats')
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
    <div className="w-full lg:w-[340px] shrink-0 border-r border-border flex flex-col overflow-hidden min-h-0 kryzen-glass sidebar-slide-in">
      {/* Desktop icon nav */}
      <div className="w-16 border-r border-border hidden sm:flex flex-col items-center py-4 gap-3 bg-muted/30">
        {[
          { id: 'chats', icon: MessageSquare, label: 'Chats', count: conversations.length },
          { id: 'status', icon: Contact, label: 'Status' },
          { id: 'groups', icon: Users, label: 'Groups', count: conversations.filter((c: any) => c.is_group).length },
          { id: 'calls', icon: Phone, label: 'Calls' },
          { id: 'contacts', icon: Contact, label: 'Contacts' },
          { id: 'saved', icon: Bookmark, label: 'Saved' }
        ].map(item => (
          <button
            key={item.id}
            onClick={() => {
              if (item.id === 'status') setShowStatus(true)
              else if (item.id === 'chats' || item.id === 'groups') setSidebarTab(item.id as any)
              else if (item.id === 'contacts') setShowContacts(true)
              else if (item.id === 'saved') setShowSaved(true)
              else if (item.id === 'calls') setShowCalls(true)
            }}
            className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
              (item.id === sidebarTab && !showContacts && !showSaved && !showCalls && !showStatus) ||
              (item.id === 'contacts' && showContacts) ||
              (item.id === 'saved' && showSaved) ||
              (item.id === 'calls' && showCalls) ||
              (item.id === 'status' && showStatus)
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
            title={item.label}
          >
            <item.icon className="w-5 h-5" />
            {item.count !== undefined && item.count > 0 && (
              <span className="text-[9px]">{item.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Mobile top tabs */}
      <div className="sm:hidden flex gap-1 p-2 border-b border-border overflow-x-auto">
        {[
          { id: 'chats', label: 'Chats' },
          { id: 'status', label: 'Status' },
          { id: 'groups', label: 'Groups' },
          { id: 'calls', label: 'Calls' },
          { id: 'contacts', label: 'Contacts' },
          { id: 'saved', label: 'Saved' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => {
              if (t.id === 'status') setShowStatus(true)
              else if (t.id === 'contacts') setShowContacts(true)
              else if (t.id === 'saved') setShowSaved(true)
              else if (t.id === 'calls') setShowCalls(true)
              else setSidebarTab(t.id as any)
            }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${
              (t.id === sidebarTab && !showContacts && !showSaved && !showCalls && !showStatus) ||
              (t.id === 'contacts' && showContacts) ||
              (t.id === 'saved' && showSaved) ||
              (t.id === 'calls' && showCalls) ||
              (t.id === 'status' && showStatus)
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}
          >
            {t.label}
          </button>
        ))}
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
            <div className="flex items-center justify-between p-3 border-b border-border">
              <h2 className="font-semibold flex items-center gap-2 text-sm">
                {sidebarTab === 'groups' ? <Users className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                {sidebarTab === 'groups' ? 'Groups' : 'Chats'}
              </h2>
              <div className="flex gap-1">
                <button onClick={() => setShowNewGroup(true)} className="p-2 rounded-full hover:bg-muted transition-colors" title="New Group">
                  <Users className="w-4 h-4" />
                </button>
                <button onClick={() => setShowUserSearch(!showUserSearch)} className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors" title="New Chat">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            {showUserSearch && (
              <div className="border-b border-border bg-muted/20">
                <UserSearch onSelect={handleStartChat} />
                <button onClick={() => setShowUserSearch(false)} className="w-full text-xs py-2 text-muted-foreground hover:bg-muted transition-colors">
                  Close
                </button>
              </div>
            )}
            {showNewGroup && (
              <div className="p-3 border-b border-border bg-muted/20 space-y-2">
                <h3 className="font-medium text-sm">New Group</h3>
                <input
                  value={groupTitle}
                  onChange={e => setGroupTitle(e.target.value)}
                  placeholder="Group name"
                  className="w-full px-3 py-2 rounded-xl bg-background border border-border outline-none text-sm"
                />
                <div className="flex flex-wrap gap-1">
                  {groupMembers.map((m: any) => (
                    <span key={m.id} className="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs flex items-center gap-1">
                      {m.display_name}
                      <button onClick={() => setGroupMembers(gm => gm.filter((x: any) => x.id !== m.id))}>×</button>
                    </span>
                  ))}
                </div>
                <UserSearch onSelect={(u: any) => {
                  if (!groupMembers.find((m: any) => m.id === u.id)) setGroupMembers([...groupMembers, u])
                }} />
                <div className="flex gap-2">
                  <button onClick={handleCreateGroup} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90">
                    Create
                  </button>
                  <button onClick={() => setShowNewGroup(false)} className="px-4 py-2 rounded-xl bg-muted border border-border text-sm transition-colors hover:bg-muted/80">
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