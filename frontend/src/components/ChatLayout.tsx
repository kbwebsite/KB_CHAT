import { ReactNode, useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { ServerStatus } from './ServerStatus'
import { Search, LogOut, Settings as SettingsIcon, Bell, Bookmark } from 'lucide-react'

export function ChatLayout({
  children,
  totalUnread,
  onNotifications,
  onSearch,
  onSaved,
  onProfile,
  onSettings,
  onThemeToggle,
  onLogout,
  showMessageSearch,
  messageSearch,
  onMessageSearchChange,
  onMessageSearchSubmit,
  onMessageSearchClose
}: {
  children: ReactNode
  totalUnread: number
  onNotifications: () => void
  onSearch: () => void
  onSaved: () => void
  onProfile: () => void
  onSettings: () => void
  onThemeToggle: () => void
  onLogout: () => void
  showMessageSearch: boolean
  messageSearch: string
  onMessageSearchChange: (v: string) => void
  onMessageSearchSubmit: () => void
  onMessageSearchClose: () => void
}) {
  const { user } = useAuthStore()
  const [tilt, setTilt] = useState({ x: 0, y: 0 })

  // 3D mouse tracking tilt effect
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (window.innerWidth < 992) return
      const cx = window.innerWidth / 2
      const cy = window.innerHeight / 2
      const dx = (e.clientX - cx) / cx
      const dy = (e.clientY - cy) / cy
      setTilt({ x: dy * -1.5, y: dx * 2 })
    }
    window.addEventListener('mousemove', onMove, { passive: true })
    return () => window.removeEventListener('mousemove', onMove)
  }, [])

  return (
    <div
      className="h-[100dvh] flex flex-col bg-background kryzen-3d-shell"
      style={{
        transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)'
      }}
    >
      <header className="h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0 kryzen-glass">
        <div className="flex items-center gap-2">
          <img src="/kryzen-logo.svg" alt="Kryzen" className="w-8 h-8 rounded-xl kryzen-hover-lift" />
          <span className="font-bold hidden sm:inline gradient-text text-glow">Kryzen</span>
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary hidden sm:inline font-medium kryzen-glow">Connect. Chat. Share.</span>
          <ServerStatus />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button onClick={onNotifications} className="relative kryzen-icon-btn" title="Notifications">
            <Bell className="w-4 h-4" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium kryzen-unread-badge">{totalUnread}</span>
            )}
          </button>
          <button onClick={onSearch} className="kryzen-icon-btn" title="Search (Ctrl+K)">
            <Search className="w-4 h-4" />
          </button>
          <button onClick={onSaved} className="kryzen-icon-btn hidden sm:flex" title="Saved">
            <Bookmark className="w-4 h-4" />
          </button>
          <button onClick={onProfile} className="kryzen-icon-btn" title="Profile">
            <div className="w-8 h-8 rounded-full overflow-hidden kryzen-avatar-ring">
              {user?.avatar_url ? (
                <img src={user.avatar_url} className="w-full h-full object-cover rounded-full" alt="" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs font-bold rounded-full">
                  {user?.display_name?.[0] || 'U'}
                </span>
              )}
            </div>
          </button>
          <button onClick={onSettings} className="kryzen-icon-btn" title="Settings">
            <SettingsIcon className="w-4 h-4" />
          </button>
          <button onClick={onLogout} className="kryzen-icon-btn text-destructive" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showMessageSearch && (
        <div className="border-b border-border p-2 flex gap-2 kryzen-search-bar kryzen-glass">
          <input
            value={messageSearch}
            onChange={e => onMessageSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onMessageSearchSubmit(); if (e.key === 'Escape') onMessageSearchClose() }}
            placeholder="Search messages (Enter to search, Esc to close)..."
            className="flex-1 px-3 py-2 rounded-xl kryzen-input-glass outline-none text-sm"
            autoFocus
          />
          <button onClick={onMessageSearchSubmit} className="px-4 py-2 rounded-xl kryzen-cta-primary text-sm font-medium relative z-10">Search</button>
          <button onClick={onMessageSearchClose} className="px-3 py-2 rounded-xl bg-muted text-sm kryzen-icon-btn">✕</button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden keyboard-aware">
        {children}
      </div>
    </div>
  )
}