import { ReactNode } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { useSettingsStore } from '../store/settings'
import { ServerStatus } from './ServerStatus'
import { Search, LogOut, Settings as SettingsIcon, Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

export function ChatLayout({ children }: { children: ReactNode }) {
  const { user, logout } = useAuthStore()
  const conversations = useChatStore(s => s.conversations)
  const settings = useSettingsStore()
  const nav = useNavigate()
  const totalUnread = conversations.reduce((a, b) => a + b.unread_count, 0)

  return (
    <div className="h-[100dvh] flex flex-col bg-background app-shell">
      <header className="h-14 border-b flex items-center justify-between px-3 sm:px-4 shrink-0 glass-strong">
        <div className="flex items-center gap-2">
          <img src="/kryzen-logo.svg" alt="Kryzen" className="w-8 h-8 rounded-xl" />
          <span className="font-bold hidden sm:inline gradient-text">Kryzen</span>
          <span className="text-xs px-2 py-1 rounded-full badge hidden sm:inline font-medium">Connect. Chat. Share.</span>
          <ServerStatus />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button className="relative p-2 rounded-xl hover:bg-surface-2 transition-colors" title="Notifications">
            <Bell className="w-4 h-4" />
            {totalUnread > 0 && (
              <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-error text-white text-[10px] flex items-center justify-center font-medium">
                {totalUnread}
              </span>
            )}
          </button>
          <button className="p-2 rounded-xl hover:bg-surface-2 transition-colors" title="Search">
            <Search className="w-4 h-4" />
          </button>
          <button
            onClick={() => nav('/ai')}
            className="p-2 rounded-xl hover:bg-surface-2 transition-colors text-accent"
            title="AI Assistant"
          >
            <span className="text-xs font-medium">AI</span>
          </button>
          <div className="w-8 h-8 rounded-full overflow-hidden avatar cursor-pointer">
            {user?.avatar_url ? (
              <img src={user.avatar_url} className="w-full h-full object-cover" alt="" />
            ) : (
              <span className="w-full h-full flex items-center justify-center bg-gradient-to-br from-primary to-accent text-white text-xs font-bold">
                {user?.display_name?.[0] || 'U'}
              </span>
            )}
          </div>
          <button className="p-2 rounded-xl hover:bg-surface-2 transition-colors" title="Settings">
            <SettingsIcon className="w-4 h-4" />
          </button>
          <button
            onClick={async () => { await logout(); nav('/login') }}
            className="p-2 rounded-xl hover:bg-error/10 text-error transition-colors"
            title="Logout"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>
      <div className="flex-1 flex min-h-0 overflow-hidden keyboard-aware">
        {children}
      </div>
    </div>
  )
}