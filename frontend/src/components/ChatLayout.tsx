import { ReactNode } from 'react'
import { NavPanel } from './NavPanel'
import { ServerStatus } from './ServerStatus'
import { Bell, Search, Grid3X3, Settings } from 'lucide-react'
import { useAuthStore } from '../store/auth'
import { useSettingsStore } from '../store/settings'

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
  const { user } = useAuthStore()
  const settings = useSettingsStore()

  return (
    <div className="app-layout">
      <NavPanel
        activeTab={activeNavTab}
        onTabChange={onNavTabChange}
        onSettings={onSettings}
      />
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
