import { ReactNode } from 'react'
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

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <header className="h-14 border-b border-border flex items-center justify-between px-3 sm:px-4 shrink-0 bg-card">
        <div className="flex items-center gap-2">
          <img src="/kryzen-logo.svg" alt="Kryzen" className="w-8 h-8 rounded-xl" />
          <span className="font-bold hidden sm:inline bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Kryzen</span>
          <span className="text-xs px-2 py-1 rounded-full bg-primary/10 text-primary hidden sm:inline font-medium">Connect. Chat. Share.</span>
          <ServerStatus />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button onClick={onNotifications} className="relative p-2 rounded-xl hover:bg-muted transition-colors" title="Notifications">
            <Bell className="w-4 h-4" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center font-medium">{totalUnread}</span>
            )}
          </button>
          <button onClick={onSearch} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Search (Ctrl+K)">
            <Search className="w-4 h-4" />
          </button>
          <button onClick={onSaved} className="p-2 rounded-xl hover:bg-muted transition-colors hidden sm:flex" title="Saved">
            <Bookmark className="w-4 h-4" />
          </button>
          <button onClick={onProfile} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Profile">
            <div className="w-8 h-8 rounded-full overflow-hidden border border-border">
              {user?.avatar_url ? (
                <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
              ) : (
                <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-accent text-primary-foreground text-xs font-bold">
                  {user?.display_name?.[0] || 'U'}
                </span>
              )}
            </div>
          </button>
          <button onClick={onSettings} className="p-2 rounded-xl hover:bg-muted transition-colors" title="Settings">
            <SettingsIcon className="w-4 h-4" />
          </button>
          <button onClick={onLogout} className="p-2 rounded-xl hover:bg-destructive/10 text-destructive transition-colors" title="Logout">
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {showMessageSearch && (
        <div className="border-b border-border p-2 flex gap-2 bg-card">
          <input
            value={messageSearch}
            onChange={e => onMessageSearchChange(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') onMessageSearchSubmit(); if (e.key === 'Escape') onMessageSearchClose() }}
            placeholder="Search messages (Enter to search, Esc to close)..."
            className="flex-1 px-3 py-2 rounded-xl bg-background border border-border outline-none text-sm"
            autoFocus
          />
          <button onClick={onMessageSearchSubmit} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm">Search</button>
          <button onClick={onMessageSearchClose} className="px-3 py-2 rounded-xl bg-muted text-sm">✕</button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden keyboard-aware">
        {children}
      </div>
    </div>
  )
}