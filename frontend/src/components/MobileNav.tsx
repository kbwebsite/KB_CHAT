import { MessageSquare, Radio, Phone, Users, Sparkles } from 'lucide-react'

type NavTab = 'chats' | 'status' | 'calls' | 'contacts' | 'ai'

export function MobileNav({ active, onTabChange, unreadCounts }: {
  active: NavTab
  onTabChange: (tab: NavTab) => void
  unreadCounts?: Record<string, number>
}) {
  const tabs: { id: NavTab; icon: typeof MessageSquare; label: string; badge?: number }[] = [
    { id: 'chats', icon: MessageSquare, label: 'Chats', badge: unreadCounts?.chats },
    { id: 'status', icon: Radio, label: 'Status', badge: unreadCounts?.status },
    { id: 'calls', icon: Phone, label: 'Calls', badge: unreadCounts?.calls },
    { id: 'contacts', icon: Users, label: 'Contacts' },
    { id: 'ai', icon: Sparkles, label: 'AI' }
  ]

  return (
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation">
      <div className="flex items-stretch" style={{ height: 'var(--bottom-nav-height)' }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = active === tab.id
          const badge = tab.badge && tab.badge > 0 ? tab.badge : null
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`bottom-nav-item ${isActive ? 'active' : ''}`}
              aria-label={tab.label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && <div className="absolute inset-0 bg-accent-subtle opacity-30" />}
              <Icon className="bottom-nav-icon" />
              <span>{tab.label}</span>
              {badge && (
                <span className="bottom-nav-badge" aria-label={`${badge} unread`}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
