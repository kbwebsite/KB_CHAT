import { MessageSquare, Users, Phone, Contact, Bot } from 'lucide-react'

type NavTab = 'chats' | 'status' | 'calls' | 'contacts' | 'ai'

export function MobileNav({ active, onTabChange }: { active: NavTab, onTabChange: (tab: NavTab) => void }) {
  const tabs: { id: NavTab; icon: typeof MessageSquare; label: string }[] = [
    { id: 'chats', icon: MessageSquare, label: 'Chats' },
    { id: 'status', icon: Contact, label: 'Status' },
    { id: 'calls', icon: Phone, label: 'Calls' },
    { id: 'contacts', icon: Users, label: 'Contacts' },
    { id: 'ai', icon: Bot, label: 'AI' }
  ]

  return (
    <nav className="mobile-bottom-nav lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      {tabs.map(tab => {
        const Icon = tab.icon
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={`flex flex-col items-center justify-center gap-0.5 w-16 h-14 rounded-xl transition-all ${
              isActive
                ? 'text-primary bg-primary/10 scale-105'
                : 'text-text-muted hover:bg-surface-2 active:scale-95'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px] font-medium">{tab.label}</span>
            {isActive && <div className="absolute bottom-1 w-1 h-1 rounded-full bg-primary" />}
          </button>
        )
      })}
    </nav>
  )
}