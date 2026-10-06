import { useEffect, useMemo, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { useSettingsStore } from '../store/settings'
import { ConversationList } from './ConversationList'
import { UserSearch } from './UserSearch'
import { StatusPanel } from './StatusPanel'
import { ContactsPanel } from './ContactsPanel'
import { SavedMessagesPanel } from './SavedMessagesPanel'
import { CallsPanel } from './CallsPanel'
import { BroadcastPanel } from './BroadcastPanel'
import { CommunitiesPanel } from './CommunitiesPanel'
import { ChannelsPanel } from './ChannelsPanel'
import { convApi } from '../services/api'
import { Plus, Search, Settings, UserPlus, Users, Trophy, MoreVertical, Bell, Bookmark, Moon, Sun, Lock, Megaphone, Network, Radio } from 'lucide-react'
import { useLockStore } from '../store/lock'

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
  onNotifications,
  onSaved,
  onSettings,
}: {
  onSelect: (id: number) => void
  onStatusViewer: (statuses: any[], idx: number) => void
  onMobileViewChange: (view: 'list' | 'chat') => void
  onMute?: () => void
  activeTab: SidebarTab
  onTabChange: (tab: SidebarTab) => void
  onProfile?: () => void
  onLeaderboard?: () => void
  onNotifications?: () => void
  onSaved?: () => void
  onSettings?: () => void
}) {
  const { user } = useAuthStore()
  // Selective subscriptions (see ChatView): whole-store subs re-render on
  // every typing tick and every message anywhere.
  const conversations = useChatStore((s: any) => s.conversations)
  const currentConversationId = useChatStore((s: any) => s.currentConversationId)
  const typingUsers = useChatStore((s: any) => s.typingUsers)
  const loadingConvs = useChatStore((s: any) => s.loadingConvs)
  const fetchConversations = useChatStore((s: any) => s.fetchConversations)
  const setCurrent = useChatStore((s: any) => s.setCurrent)
  const fetchMessages = useChatStore((s: any) => s.fetchMessages)

  const [search, setSearch] = useState('')
  const [showUserSearch, setShowUserSearch] = useState(false)
  const [showContacts, setShowContacts] = useState(false)
  const [showSaved, setShowSaved] = useState(false)
  const [showCalls, setShowCalls] = useState(false)
  const [showBroadcasts, setShowBroadcasts] = useState(false)
  const [showCommunities, setShowCommunities] = useState(false)
  const [showChannels, setShowChannels] = useState(false)
  const [shareContact, setShareContact] = useState<any | null>(null)
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [groupTitle, setGroupTitle] = useState('')
  const [groupMembers, setGroupMembers] = useState<any[]>([])
  const [showMenu, setShowMenu] = useState(false)
  const settings = useSettingsStore()
  const lockEnabled = useLockStore((s) => s.enabled)
  const lockNow = useLockStore((s) => s.lock)
  const closeMenu = () => setShowMenu(false)
  const menuFire = (fn?: () => void) => () => { closeMenu(); fn?.() }

  // Opened from anywhere (sidebar menu, command palette) via 'kb:new-group'.
  useEffect(() => {
    const open = () => setShowNewGroup(true)
    window.addEventListener('kb:new-group', open)
    return () => window.removeEventListener('kb:new-group', open)
  }, [])

  const typingMap = typingUsers

  const filteredByTab = useMemo(() => {
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
  }, [conversations, activeTab, search])

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
    <div className="conv-panel col-12 col-lg-4 col-xl-3">
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
        <div className="relative">
          <button
            onClick={() => setShowMenu(v => !v)}
            className="btn-icon"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={showMenu}
          >
            <MoreVertical className="w-5 h-5" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={closeMenu} />
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl kryzen-dropdown-glass py-1 z-20 text-sm max-h-[70vh] overflow-y-auto" role="menu">
                <button role="menuitem" onClick={menuFire(() => setShowNewGroup(true))} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                  <Users className="w-4 h-4 text-primary" />
                  New group
                </button>
                <button role="menuitem" onClick={menuFire(() => settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' }))} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                  {settings.theme === 'dark' ? <Sun className="w-4 h-4 text-primary" /> : <Moon className="w-4 h-4 text-primary" />}
                  {settings.theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                {onNotifications && (
                  <button role="menuitem" onClick={menuFire(onNotifications)} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-primary" />
                    Notifications
                  </button>
                )}
                {onSaved && (
                  <button role="menuitem" onClick={menuFire(onSaved)} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                    <Bookmark className="w-4 h-4 text-primary" />
                    Saved messages
                  </button>
                )}
                {onSettings && (
                  <button role="menuitem" onClick={menuFire(onSettings)} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                    <Settings className="w-4 h-4 text-primary" />
                    Settings
                  </button>
                )}
                <button role="menuitem" onClick={menuFire(() => setShowBroadcasts(true))} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                  <Megaphone className="w-4 h-4 text-primary" />
                  Broadcast lists
                </button>
                <button role="menuitem" onClick={menuFire(() => setShowCommunities(true))} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                  <Network className="w-4 h-4 text-primary" />
                  Communities
                </button>
                <button role="menuitem" onClick={menuFire(() => setShowChannels(true))} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                  <Radio className="w-4 h-4 text-primary" />
                  Channels
                </button>
                {lockEnabled && (
                  <button role="menuitem" onClick={menuFire(lockNow)} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-primary" />
                    Lock now
                  </button>
                )}
              </div>
            </>
          )}
        </div>
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
      {!showContacts && !showSaved && !showCalls && !showBroadcasts && !showCommunities && !showChannels && (
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
          <ContactsPanel onClose={() => setShowContacts(false)} onChat={handleStartChat} onShare={(u: any) => setShareContact(u)} onSelectConversation={(cid: number) => { setCurrent(cid); fetchMessages(cid); setShowContacts(false); onMobileViewChange('chat') }} />
        ) : showSaved ? (
          <SavedMessagesPanel onClose={() => setShowSaved(false)} onJump={(cid: number) => { setCurrent(cid); fetchMessages(cid); setShowSaved(false); onMobileViewChange('chat') }} />
        ) : showCalls ? (
          <CallsPanel onClose={() => setShowCalls(false)} />
        ) : showBroadcasts ? (
          <BroadcastPanel onClose={() => setShowBroadcasts(false)} />
        ) : showCommunities ? (
          <CommunitiesPanel
            onClose={() => setShowCommunities(false)}
            conversations={conversations}
            onOpenChat={(cid: number) => { setCurrent(cid); fetchMessages(cid); setShowCommunities(false); onMobileViewChange('chat') }}
          />
        ) : showChannels ? (
          <ChannelsPanel onClose={() => setShowChannels(false)} />
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
                onChanged={() => fetchConversations()}
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
        {shareContact && (
          <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 modal-entrance">
            <div className="bg-card rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col border border-border kryzen-glass-strong modal-entrance">
              <div className="p-4 border-b border-border">
                <h3 className="font-semibold">Share contact</h3>
                <p className="text-sm text-muted-foreground truncate">
                  {shareContact.display_name} (@{shareContact.username})
                </p>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-1">
                {conversations.map((c: any) => (
                  <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-xl cursor-pointer transition-colors">
                    <input type="checkbox" id={`sharec-${c.id}`} className="w-4 h-4" />
                    <div className="w-8 h-8 rounded-full kryzen-accent-gradient text-white flex items-center justify-center text-xs font-bold shrink-0">
                      {(c.title || '?')[0]}
                    </div>
                    <span className="text-sm font-medium flex-1 truncate">{c.title}</span>
                  </label>
                ))}
              </div>
              <div className="p-3 border-t border-border flex gap-2">
                <button onClick={() => setShareContact(null)} className="flex-1 py-2 rounded-xl bg-muted transition-colors hover:bg-muted/80">Cancel</button>
                <button onClick={async () => {
                  const ids: number[] = []
                  conversations.forEach((c: any) => {
                    const el = document.getElementById(`sharec-${c.id}`) as HTMLInputElement
                    if (el?.checked) ids.push(c.id)
                  })
                  if (ids.length === 0 || !shareContact) return
                  const body = JSON.stringify({ contact: { user_id: shareContact.id, username: shareContact.username, display_name: shareContact.display_name, avatar_url: shareContact.avatar_url || null } })
                  const st = useChatStore.getState()
                  for (const cid of ids) {
                    try { await st.sendMessage(cid, body, undefined, undefined, 'contact') } catch {}
                  }
                  setShareContact(null)
                }} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90">Share</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
