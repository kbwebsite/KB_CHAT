import { Conversation } from '../types'
import { formatLastSeen, initials } from '../utils/format'
import { Users, ArrowLeft, Phone, Video, Search, RefreshCcw, Sparkles, Bell, Moon, Sun, LayoutGrid } from 'lucide-react'
import { useSettingsStore } from '../store/settings'
import { useAuthStore } from '../store/auth'

export function ChatHeader({ conv, currentUserId, onBack, onInfo, onCall, onMute, onSearch, handleRefresh, onAi }: {
  conv: Conversation | null, currentUserId?: number, onBack?: () => void, onInfo?: () => void,
  onCall?: (type: 'voice' | 'video') => void,
  onMute?: () => void,
  onSearch?: () => void,
  handleRefresh?: () => void,
  onAi?: () => void
}) {
  const settings = useSettingsStore()
  const { user } = useAuthStore()

  if (!conv) {
    return (
      <div className="chat-header">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
            K
          </div>
          <div>
            <h1 className="font-bold text-lg gradient-text">Kryzen</h1>
            <p className="text-[11px] text-muted-foreground">Connect. Chat. Share.</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <ServerStatusBadge />
          <button onClick={() => settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })} className="icon-btn" title="Toggle theme">
            {settings.theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
          </button>
          <button className="icon-btn relative" title="Notifications">
            <Bell className="w-[18px] h-[18px]" />
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full gradient-primary text-[9px] text-white flex items-center justify-center font-bold">4</span>
          </button>
          <button className="icon-btn" title="Search">
            <Search className="w-[18px] h-[18px]" />
          </button>
          <button className="icon-btn" title="Grid">
            <LayoutGrid className="w-[18px] h-[18px]" />
          </button>
          <div className="ml-1">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
            ) : (
              <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-xs">
                {user?.display_name?.[0] || user?.username?.[0] || 'U'}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  const title = conv.title || 'Unknown'
  const isOnline = !conv.is_group && conv.members.some(m => m.user_id !== currentUserId && m.is_online)
  const subtitle = conv.is_group ? `${conv.members.length} members` : isOnline ? 'Online' : formatLastSeen(conv.members.find(m => m.user_id !== currentUserId)?.is_online ? undefined : undefined, false)

  return (
    <div className="chat-header">
      <div className="flex items-center gap-3 min-w-0">
        {onBack && <button onClick={onBack} className="lg:hidden icon-btn"><ArrowLeft className="w-5 h-5" /></button>}
        <div className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center shrink-0"
          style={{ background: 'linear-gradient(135deg, hsl(var(--primary)), hsl(var(--accent)))' }}>
          {conv.avatar_url ? (
            <img src={conv.avatar_url} alt="" className="w-full h-full object-cover rounded-full" />
          ) : conv.is_group ? (
            <Users className="w-5 h-5 text-white" />
          ) : (
            <span className="text-sm font-semibold text-white">{initials(title)}</span>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-sm leading-tight truncate">{title}</p>
          <p className={`text-xs truncate ${isOnline ? 'text-emerald-400' : 'text-muted-foreground'}`}>
            {isOnline ? 'Online' : subtitle}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-0.5">
        <ServerStatusBadge />
        <button onClick={() => settings.update({ theme: settings.theme === 'dark' ? 'light' : 'dark' })} className="icon-btn" title="Toggle theme">
          {settings.theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
        </button>
        <button className="icon-btn relative" title="Notifications">
          <Bell className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onSearch} className="icon-btn" title="Search">
          <Search className="w-[18px] h-[18px]" />
        </button>
        <button className="icon-btn" title="Grid">
          <LayoutGrid className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onMute} className="icon-btn hidden sm:flex" title="Mute">
          <Bell className="w-[18px] h-[18px]" />
        </button>
        <button onClick={() => onCall?.('voice')} className="icon-btn" title="Voice call">
          <Phone className="w-[18px] h-[18px]" />
        </button>
        <button onClick={() => onCall?.('video')} className="icon-btn" title="Video call">
          <Video className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onInfo} className="icon-btn" title="Info">
          <RefreshCcw className="w-[18px] h-[18px]" />
        </button>
        <button onClick={handleRefresh} className="icon-btn" title="Refresh">
          <RefreshCcw className="w-[18px] h-[18px]" />
        </button>
        <button onClick={onAi} className="icon-btn" title="AI Assistant">
          <Sparkles className="w-[18px] h-[18px]" />
        </button>
      </div>
    </div>
  )
}

function ServerStatusBadge() {
  return <ServerStatus />
}

import { ServerStatus } from './ServerStatus'
