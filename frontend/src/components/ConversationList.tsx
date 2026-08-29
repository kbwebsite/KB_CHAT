import { Conversation } from '../types'
import { formatTime, initials } from '../utils/format'
import { Users, Search, Pin, BellOff, Archive, Check, CheckCheck } from 'lucide-react'

const avatarGradients = [
  'linear-gradient(135deg, #f97316, #ec4899)',
  'linear-gradient(135deg, #8b5cf6, #3b82f6)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
  'linear-gradient(135deg, #f43f5e, #8b5cf6)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
]

function getAvatarGradient(id: number) {
  return avatarGradients[id % avatarGradients.length]
}

export function ConversationItem({ conv, active, onClick, isTyping, currentUserId, onPin, onMute, onArchive }: {
  conv: Conversation, active: boolean, onClick: () => void, isTyping?: boolean, currentUserId?: number, onPin?: (id: number) => void, onMute?: (id: number) => void, onArchive?: (id: number) => void
}) {
  const isGroup = conv.is_group
  const title = conv.title || 'Unknown'
  const avatar = conv.avatar_url
  const last = conv.last_message
  const hasUnread = conv.unread_count > 0
  const isPinned = (conv as any).is_pinned
  const isMuted = (conv as any).is_muted
  const isArchived = (conv as any).is_archived
  const isOwnLast = last?.sender_id === currentUserId

  return (
    <div className={`conv-item ${active ? 'active' : ''}`}>
      {isPinned && <span className="absolute top-2 right-2"><Pin className="w-3 h-3 text-primary opacity-70" /></span>}
      <button onClick={onClick} className="flex gap-3 flex-1 min-w-0 text-left">
        <div className={`conv-avatar ${!isGroup && conv.members.some(m => m.is_online) ? 'online' : ''}`}
          style={{ background: avatar ? 'none' : getAvatarGradient(conv.id) }}>
          {avatar ? (
            <img src={avatar} alt="" className="w-full h-full object-cover rounded-2xl" />
          ) : isGroup ? (
            <Users className="w-5 h-5 text-white" />
          ) : (
            <span className="text-sm font-semibold text-white">{initials(title)}</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <p className={`font-medium truncate text-sm ${active ? 'text-white' : 'text-foreground'}`}>
              {title} {isMuted && <BellOff className="w-3 h-3 opacity-50 inline" />} {isArchived && <Archive className="w-3 h-3 opacity-40 inline" />}
            </p>
            <span className={`text-[11px] shrink-0 flex items-center gap-1 ${active ? 'text-white/60' : 'text-muted-foreground'}`}>
              {isOwnLast && last && <CheckCheck className="w-3 h-3" />}
              {last ? formatTime(last.created_at) : ''}
            </span>
          </div>
          <div className="flex justify-between items-center gap-2 mt-0.5">
            <p className={`truncate text-xs flex-1 ${isTyping ? 'text-primary font-medium animate-pulse' : active ? 'text-white/70' : 'text-muted-foreground'}`}>
              {isTyping ? 'typing...' : last ? (isGroup && !isOwnLast && last.sender_username ? `${last.sender_username}: ` : '') + (last.content?.slice(0, 38) || '📎 Attachment') : isGroup ? `${conv.members.length} members` : 'Start conversation'}
            </p>
            <span className="flex items-center gap-1 shrink-0">
              {hasUnread && <span className={`nav-badge ${isMuted ? 'opacity-60' : ''}`}>{conv.unread_count}</span>}
            </span>
          </div>
        </div>
      </button>
      <div className="hidden group-hover:flex items-center gap-1 absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 z-10 glass-subtle">
        <button onClick={(e) => { e.stopPropagation(); onPin?.(conv.id) }} title={isPinned ? "Unpin" : "Pin"} className={`icon-btn w-7 h-7 ${isPinned ? 'text-primary' : ''}`}><Pin className="w-3.5 h-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onMute?.(conv.id) }} title={isMuted ? "Unmute" : "Mute"} className={`icon-btn w-7 h-7 ${isMuted ? 'text-amber-500' : ''}`}><BellOff className="w-3.5 h-3.5" /></button>
        <button onClick={(e) => { e.stopPropagation(); onArchive?.(conv.id) }} title={isArchived ? "Unarchive" : "Archive"} className="icon-btn w-7 h-7"><Archive className="w-3.5 h-3.5" /></button>
      </div>
    </div>
  )
}

export function ConversationList({ conversations, activeId, onSelect, search, onSearch, typingMap, currentUserId, onPin, onArchive, onMute, loading }: {
  conversations: Conversation[], activeId: number | null, onSelect: (id: number) => void, search: string, onSearch: (v: string) => void, typingMap?: Record<number, Set<number>>, currentUserId?: number, onPin?: (id: number) => void, onArchive?: (id: number) => void, onMute?: (id: number) => void, loading?: boolean
}) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="p-3 shrink-0">
        <div className="search-bar">
          <Search className="w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search conversations..." className="flex-1 bg-transparent border-none outline-none text-sm" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2 space-y-1 min-h-0">
        {loading ? (
          <div className="p-3 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-12 h-12 rounded-2xl bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-24 bg-muted rounded" />
                  <div className="h-3 w-full bg-muted rounded" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl gradient-primary flex items-center justify-center opacity-50">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <p className="text-sm text-muted-foreground">No conversations yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Search users to start chatting.</p>
          </div>
        ) : (
          conversations.map(c => (
            <ConversationItem key={c.id} conv={c} active={c.id === activeId} onClick={() => onSelect(c.id)} isTyping={!!typingMap?.[c.id]?.size} currentUserId={currentUserId} onPin={onPin} onMute={onMute} onArchive={onArchive} />
          ))
        )}
      </div>
    </div>
  )
}

import { MessageSquare } from 'lucide-react'
