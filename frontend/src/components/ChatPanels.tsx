import { ProfilePanel } from './ProfilePanel'
import { GroupPanel } from './GroupPanel'
import { SettingsPanel } from './SettingsPanel'
import { NotificationPanel } from './NotificationPanel'
import { SavedMessagesPanel } from './SavedMessagesPanel'
import { ContactsPanel } from './ContactsPanel'
import { CallsPanel } from './CallsPanel'
import { PollPanel } from './PollPanel'
import EventPanel from './EventPanel'
import ScheduleMessage from './ScheduleMessage'
import ChatInsights from './ChatInsights'
import { useChatStore } from '../store/chat'
import { msgPinApi } from '../services/api'
import { X } from 'lucide-react'

export function ChatPanels({
  showProfile,
  showGroupInfo,
  showSettings,
  showNotifications,
  showPolls,
  showPinned,
  showEvents,
  showSchedule,
  showInsights,
  onClose,
  onJump,
  onChat,
  pinnedMessages,
  setPinnedMessages,
  setShowPinned,
  setShowPolls,
  setShowEvents,
  setShowSchedule,
  setShowInsights
}: any) {
  const { currentConversationId } = useChatStore() as any
  const currentConv = useChatStore(s => s.conversations.find((c: any) => c.id === currentConversationId))

  if (!currentConv && !showProfile && !showSettings && !showNotifications) return null

  return (
    <aside className="absolute inset-y-0 right-0 w-full sm:w-[360px] border-l border-border z-30 flex flex-col overflow-hidden min-h-0 lg:relative lg:inset-auto lg:w-[360px] xl:w-[380px] shrink-0 bg-card modal-entrance">
      {showProfile && <ProfilePanel onClose={onClose} />}
      {showGroupInfo && currentConv && <GroupPanel conversation={currentConv} onClose={onClose} onUpdated={() => {}} />}
      {showSettings && <SettingsPanel onClose={onClose} />}
      {showNotifications && <NotificationPanel onClose={onClose} onSelect={(cid: number) => { onClose(); onJump(cid) }} />}
      {showPolls && currentConv && <PollPanel conversationId={currentConv.id} onClose={() => setShowPolls(false)} />}
      {showPinned && (
        <div className="flex flex-col h-full bg-background">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Pinned Messages</h3>
            <button onClick={() => setShowPinned(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {pinnedMessages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No pinned messages</p>
            ) : pinnedMessages.map((msg: any) => (
              <div key={msg.id} className="p-3 rounded-xl bg-muted border border-border text-sm cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => setShowPinned(false)}>
                <p className="text-xs text-muted-foreground">{msg.sender_display_name} • {new Date(msg.pinned_at || msg.created_at).toLocaleString()}</p>
                <p className="mt-1 line-clamp-3">{msg.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      {showEvents && currentConv && (
        <div className="flex flex-col h-full bg-background">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Events</h3>
            <button onClick={() => setShowEvents(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <EventPanel convId={currentConv.id} userId={0} />
          </div>
        </div>
      )}
      {showSchedule && currentConv && (
        <div className="flex flex-col h-full bg-background">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Scheduled</h3>
            <button onClick={() => setShowSchedule(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ScheduleMessage convId={currentConv.id} />
          </div>
        </div>
      )}
      {showInsights && currentConv && (
        <div className="flex flex-col h-full bg-background">
          <div className="flex items-center justify-between p-3 border-b border-border">
            <h3 className="font-semibold text-sm">Insights</h3>
            <button onClick={() => setShowInsights(false)} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <ChatInsights convId={currentConv.id} />
          </div>
        </div>
      )}
    </aside>
  )
}