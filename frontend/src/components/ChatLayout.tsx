import { ReactNode } from 'react'
import { NavPanel } from './NavPanel'

type NavPanelTab = 'chats' | 'contacts' | 'groups' | 'calls' | 'saved' | 'files' | 'settings'

export function ChatLayout({
  children,
  activeNavTab,
  onNavTabChange,
  onSettings,
  totalUnread,
}: {
  children: ReactNode
  activeNavTab: NavPanelTab
  onNavTabChange: (tab: NavPanelTab) => void
  onSettings: () => void
  totalUnread: number
}) {
  return (
    <div className="app-layout">
      <NavPanel
        activeTab={activeNavTab}
        onTabChange={onNavTabChange}
        onSettings={onSettings}
      />
      <div className="flex-1 flex min-w-0 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
