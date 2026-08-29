import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { MessageSquare, Users, Phone, Bookmark, FileText, Settings, Crown, MoreHorizontal } from 'lucide-react'

type NavPanelTab = 'chats' | 'contacts' | 'groups' | 'calls' | 'saved' | 'files' | 'settings'

export function NavPanel({
  activeTab,
  onTabChange,
  onSettings,
}: {
  activeTab: NavPanelTab
  onTabChange: (tab: NavPanelTab) => void
  onSettings: () => void
}) {
  const { user } = useAuthStore()
  const conversations = useChatStore(s => s.conversations)

  const totalUnread = conversations.reduce((a: number, b: any) => a + b.unread_count, 0)
  const groupCount = conversations.filter((c: any) => c.is_group).length

  const navItems: { id: NavPanelTab; icon: any; label: string; count?: number }[] = [
    { id: 'chats', icon: MessageSquare, label: 'Chats', count: totalUnread || undefined },
    { id: 'contacts', icon: Users, label: 'Contacts' },
    { id: 'groups', icon: Users, label: 'Groups', count: groupCount || undefined },
    { id: 'calls', icon: Phone, label: 'Calls' },
    { id: 'saved', icon: Bookmark, label: 'Saved' },
    { id: 'files', icon: FileText, label: 'Files' },
  ]

  return (
    <div className="nav-panel hidden lg:flex">
      {/* Logo */}
      <div className="p-5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl gradient-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
          K
        </div>
        <div className="min-w-0">
          <p className="font-bold text-sm gradient-text">Kryzen</p>
          <p className="text-[10px] text-muted-foreground">Connect. Chat. Share.</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-1">
        {navItems.map(item => {
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              onClick={() => onTabChange(item.id)}
              className={`nav-item w-full ${isActive ? 'active' : ''}`}
            >
              <item.icon className="w-[18px] h-[18px]" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.count !== undefined && item.count > 0 && (
                <span className="nav-badge">{item.count}</span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Premium Card */}
      <div className="mx-3 mb-3">
        <div className="premium-card shimmer">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 rounded-lg gradient-primary flex items-center justify-center">
              <Crown className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-xs">Kryzen Premium</span>
          </div>
          <p className="text-[11px] text-muted-foreground mb-3">Unlock advanced features</p>
          <button className="w-full py-2 rounded-xl btn-gradient text-xs font-semibold text-white">
            Upgrade Now
          </button>
        </div>
      </div>

      {/* User Profile */}
      <div className="p-3 border-t border-border/50">
        <div className="flex items-center gap-3">
          <div className="relative">
            {user?.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
            ) : (
              <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm">
                {user?.display_name?.[0] || user?.username?.[0] || 'U'}
              </div>
            )}
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-background" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm truncate">{user?.display_name || user?.username || 'User'}</p>
            <p className="text-[11px] text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              Online
            </p>
          </div>
          <button
            onClick={onSettings}
            className="icon-btn w-8 h-8"
          >
            <MoreHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
