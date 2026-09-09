import { Conversation } from '../types'
import { formatLastSeen, initials } from '../utils/format'
import { Users, ArrowLeft, Phone, Video, Search, Sparkles, MoreVertical, Bot, Palette, Settings, BarChart3, CalendarDays, Pin, Clock3, Lightbulb, Bell, BellOff, Info } from 'lucide-react'
import { useState } from 'react'

export type ExtrasKey = 'polls' | 'events' | 'pinned' | 'schedule' | 'insights'

export function ChatHeader({
  conv,
  currentUserId,
  onBack,
  onInfo,
  onCall,
  onMute,
  muted,
  onSearch,
  handleRefresh,
  onAi,
  onAgent,
  onTheme,
  onSettings,
  onExtras,
}: {
  conv: Conversation | null
  currentUserId?: number
  onBack?: () => void
  onInfo?: () => void
  onCall?: (type: 'voice' | 'video') => void
  onMute?: () => void
  muted?: boolean
  onSearch?: () => void
  handleRefresh?: () => void
  onAi?: () => void
  onAgent?: () => void
  onTheme?: () => void
  onSettings?: () => void
  onExtras?: (key: ExtrasKey) => void
}) {
  const [showMenu, setShowMenu] = useState(false)
  const close = () => setShowMenu(false)
  const fire = (fn?: () => void) => () => { close(); fn?.() }

  const menuItems: { label: string; icon: any; run?: () => void; danger?: boolean }[] = [
    ...(onAi ? [{ label: 'AI Assistant', icon: Sparkles, run: onAi }] : []),
    ...(onTheme ? [{ label: 'Theme', icon: Palette, run: onTheme }] : []),
    ...(onSettings ? [{ label: 'Settings', icon: Settings, run: onSettings }] : []),
    ...(onMute ? [{ label: muted ? 'Unmute chat' : 'Mute chat', icon: muted ? Bell : BellOff, run: onMute }] : []),
  ]
  const extrasItems: { key: ExtrasKey; label: string; icon: any }[] = onExtras ? [
    { key: 'polls', label: 'Polls', icon: BarChart3 },
    { key: 'events', label: 'Events', icon: CalendarDays },
    { key: 'pinned', label: 'Pinned messages', icon: Pin },
    { key: 'schedule', label: 'Scheduled', icon: Clock3 },
    { key: 'insights', label: 'Insights', icon: Lightbulb },
  ] : []
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

      {/* Action buttons: core actions inline, everything else in one menu
          so narrow (phone) headers never crush the title. */}
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
        <div className="relative">
          <button onClick={() => setShowMenu(v => !v)} className="btn-icon" aria-label="More options" aria-haspopup="menu" aria-expanded={showMenu}>
            <MoreVertical className="w-[18px] h-[18px]" />
          </button>
          {showMenu && (
            <>
              <div className="fixed inset-0 z-10" onClick={close} />
              <div className="absolute right-0 top-full mt-2 w-52 rounded-xl kryzen-dropdown-glass py-1 z-20 text-sm max-h-[70vh] overflow-y-auto" role="menu">
                {menuItems.map(({ label, icon: Icon, run }) => (
                  <button key={label} role="menuitem" onClick={fire(run)} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-primary" />
                    {label}
                  </button>
                ))}
                {menuItems.length > 0 && extrasItems.length > 0 && <div className="border-t my-1" />}
                {extrasItems.map(({ key, label, icon: Icon }) => (
                  <button key={key} role="menuitem" onClick={fire(() => onExtras?.(key))} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                    <Icon className="w-4 h-4 text-primary" />
                    {label}
                  </button>
                ))}
                {onInfo && (
                  <>
                    <div className="border-t my-1" />
                    <button role="menuitem" onClick={fire(onInfo)} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2.5">
                      <Info className="w-4 h-4 text-primary" />
                      {conv?.is_group ? 'Group info' : 'Contact info'}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
