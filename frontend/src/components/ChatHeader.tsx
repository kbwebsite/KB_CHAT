import { Conversation } from '../types'
import { formatLastSeen, initials } from '../utils/format'
import { Users, ArrowLeft, Phone, Video, Search, Sparkles, MoreVertical, Bot, Palette, Settings } from 'lucide-react'

export function ChatHeader({
  conv,
  currentUserId,
  onBack,
  onInfo,
  onCall,
  onMute,
  onSearch,
  handleRefresh,
  onAi,
  onAgent,
  onTheme,
  onSettings,
}: {
  conv: Conversation | null
  currentUserId?: number
  onBack?: () => void
  onInfo?: () => void
  onCall?: (type: 'voice' | 'video') => void
  onMute?: () => void
  onSearch?: () => void
  handleRefresh?: () => void
  onAi?: () => void
  onAgent?: () => void
  onTheme?: () => void
  onSettings?: () => void
}) {
  const title = conv?.title || 'Unknown'
  const isOnline = conv && !conv.is_group && conv.members.some(m => m.user_id !== currentUserId && m.is_online)
  const subtitle = conv?.is_group
    ? `${conv.members.length} members`
    : isOnline
      ? 'Online'
      : conv
        ? formatLastSeen(conv.members.find(m => m.user_id !== currentUserId)?.is_online ? undefined : undefined, false)
        : ''

  return (
    <div className="chat-header" style={{ background: 'rgba(6,6,14,0.92)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderBottom: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 4px 24px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
      {/* Back button - mobile only */}
      {onBack && (
        <button onClick={onBack} className="chat-header-back" aria-label="Back">
          <ArrowLeft className="w-5 h-5" />
        </button>
      )}

      {/* Avatar + Info */}
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="chat-header-avatar">
          {conv?.avatar_url ? (
            <img src={conv.avatar_url} alt="" />
          ) : (
            <div
              className="w-full h-full flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))' }}
            >
              {conv?.is_group ? (
                <Users className="w-4 h-4 text-white" />
              ) : (
                <span className="text-sm font-bold text-white">{initials(title)}</span>
              )}
            </div>
          )}
        </div>
        <div className="chat-header-info">
          <span className="chat-header-name">{title}</span>
          <span className={`chat-header-status ${isOnline ? 'online' : ''}`}>
            {isOnline ? 'Online' : subtitle}
          </span>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {onSearch && (
          <button onClick={onSearch} className="btn-icon" aria-label="Search messages">
            <Search className="w-[18px] h-[18px]" />
          </button>
        )}
        {onCall && (
          <button onClick={() => onCall('voice')} className="btn-icon" aria-label="Voice call">
            <Phone className="w-[18px] h-[18px]" />
          </button>
        )}
        {onCall && (
          <button onClick={() => onCall('video')} className="btn-icon" aria-label="Video call">
            <Video className="w-[18px] h-[18px]" />
          </button>
        )}
{onAi && (
            <button onClick={onAi} className="btn-icon" aria-label="AI Assistant">
              <Sparkles className="w-[18px] h-[18px]" />
            </button>
          )}
          {onTheme && (
            <button onClick={onTheme} className="btn-icon" aria-label="Theme">
              <Palette className="w-[18px] h-[18px]" />
            </button>
          )}
          {onSettings && (
            <button onClick={onSettings} className="btn-icon" aria-label="Settings">
              <Settings className="w-[18px] h-[18px]" />
            </button>
          )}
          {onInfo && (
          <button onClick={onInfo} className="btn-icon" aria-label="More options">
            <MoreVertical className="w-[18px] h-[18px]" />
          </button>
        )}
      </div>
    </div>
  )
}
