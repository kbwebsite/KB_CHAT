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
    <nav className="fixed bottom-0 left-0 right-0 z-50 lg:hidden glass-strong" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
      <div className="flex items-center justify-around py-1">
        {tabs.map(tab => {
          const Icon = tab.icon
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center gap-0.5 w-14 h-12 rounded-xl transition-all relative ${
                isActive
                  ? 'text-white scale-105'
                  : 'text-muted-foreground hover:text-foreground active:scale-95'
              }`}
            >
              {isActive && (
                <div className="absolute inset-0 rounded-xl gradient-primary opacity-20" />
              )}
              <Icon className="w-5 h-5 relative z-10" />
              <span className="text-[10px] font-medium relative z-10">{tab.label}</span>
              {isActive && <div className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-white pulse-dot" />}
            </button>
          )
        })}
      </div>
    </nav>
  )
}
