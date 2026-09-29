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
    <nav className="bottom-nav" role="navigation" aria-label="Main navigation" style={{ background: 'rgba(6,6,14,0.97)', backdropFilter: 'blur(40px) saturate(200%)', WebkitBackdropFilter: 'blur(40px) saturate(200%)', borderTop: '1px solid rgba(255,255,255,0.05)', boxShadow: '0 -4px 24px rgba(0,0,0,0.5)' }}>
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
              style={isActive ? { color: 'var(--accent-primary)' } : undefined}
            >
              {isActive && <div style={{ position: 'absolute', inset: 0, background: 'rgba(var(--accent-rgb), 0.08)', borderRadius: 0 }} />}
              {isActive && <div style={{ position: 'absolute', top: -1, left: '50%', transform: 'translateX(-50%)', width: 32, height: 3, borderRadius: '0 0 4px 4px', background: 'linear-gradient(180deg, var(--accent-primary), var(--accent-secondary))', boxShadow: '0 2px 12px var(--accent-glow), 0 0 24px var(--accent-subtle)' }} />}
              <Icon className="bottom-nav-icon" style={isActive ? { transform: 'scale(1.15) translateY(-1px)', filter: 'drop-shadow(0 2px 8px var(--accent-glow))' } : undefined} />
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
