import { Conversation } from '../types'
import { formatTime, initials } from '../utils/format'
import { Users, Pin, BellOff, Archive, Check, CheckCheck, MessageSquare } from 'lucide-react'

const avatarGradients = [
  'linear-gradient(135deg, #6366f1, #8b5cf6)',
  'linear-gradient(135deg, #ec4899, #8b5cf6)',
  'linear-gradient(135deg, #06b6d4, #3b82f6)',
  'linear-gradient(135deg, #f43f5e, #ec4899)',
  'linear-gradient(135deg, #f59e0b, #ef4444)',
  'linear-gradient(135deg, #10b981, #06b6d4)',
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
    <div
      className={`conv-item ${active ? 'active' : ''}`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } }}
    >
      <div className={`conv-avatar ${!isGroup && conv.members.some(m => m.is_online) ? 'online' : ''}`}
        style={{ background: avatar ? 'none' : getAvatarGradient(conv.id) }}>
        {avatar ? (
          <img src={avatar} alt="" className="w-full h-full object-cover rounded-[16px]" />
        ) : isGroup ? (
          <Users className="w-5 h-5 text-white" />
        ) : (
          <span className="text-sm font-bold text-white">{initials(title)}</span>
        )}
      </div>
      <div className="conv-content">
        <div className="conv-top-row">
          <span className="conv-name">
            {title}
            {isMuted && <BellOff className="w-3 h-3 opacity-40 inline ml-1" />}
            {isPinned && <Pin className="w-3 h-3 opacity-40 inline ml-1" />}
          </span>
          <span className="conv-time">
            {isOwnLast && last && <CheckCheck className="w-3.5 h-3.5 inline mr-0.5 text-accent-primary" />}
            {last ? formatTime(last.created_at) : ''}
          </span>
        </div>
        <div className="conv-bottom-row">
          <span className={`conv-preview ${isTyping ? 'conv-typing' : ''}`}>
            {isTyping ? 'typing...' : last ? (isGroup && !isOwnLast && last.sender_username ? `${last.sender_username}: ` : '') + (last.content?.slice(0, 45) || '📎 Attachment') : isGroup ? `${conv.members.length} members` : 'Start conversation'}
          </span>
          {hasUnread && (
            <span className={`conv-unread ${isMuted ? 'opacity-60' : ''}`}>
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

export function ConversationList({ conversations, activeId, onSelect, search, onSearch, typingMap, currentUserId, onPin, onArchive, onMute, loading }: {
  conversations: Conversation[], activeId: number | null, onSelect: (id: number) => void, search: string, onSearch: (v: string) => void, typingMap?: Record<number, Set<number>>, currentUserId?: number, onPin?: (id: number) => void, onArchive?: (id: number) => void, onMute?: (id: number) => void, loading?: boolean
}) {
  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      <div className="conv-list flex-1 overflow-y-auto overflow-x-hidden min-h-0">
        {loading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex gap-3 animate-pulse">
                <div className="w-[52px] h-[52px] rounded-[16px] bg-elevated" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-3.5 w-28 rounded bg-elevated" />
                  <div className="h-3 w-full rounded bg-elevated" />
                </div>
              </div>
            ))}
          </div>
        ) : conversations.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <MessageSquare className="w-7 h-7" />
            </div>
            <p className="empty-state-title">No conversations yet</p>
            <p className="empty-state-text">Search for users to start chatting</p>
          </div>
        ) : (
          conversations.map(c => (
            <ConversationItem
              key={c.id}
              conv={c}
              active={c.id === activeId}
              onClick={() => onSelect(c.id)}
              isTyping={!!typingMap?.[c.id]?.size}
              currentUserId={currentUserId}
              onPin={onPin}
              onMute={onMute}
              onArchive={onArchive}
            />
          ))
        )}
      </div>
    </div>
  )
}
