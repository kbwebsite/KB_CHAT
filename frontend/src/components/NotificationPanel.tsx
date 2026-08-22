import { useEffect, useState } from 'react'
import { useChatStore } from '../store/chat'
import { Bell, X, CheckCheck } from 'lucide-react'
import { extendedApi } from '../services/api'

export function NotificationPanel({ onClose, onSelect }: { onClose:()=>void, onSelect:(cid:number)=>void }) {
  const conversations = useChatStore(s=> s.conversations)
  const unread = conversations.filter(c=> c.unread_count>0)
  const total = unread.reduce((a,b)=> a+b.unread_count, 0)

  const handleMarkAll=async ()=>{
    await extendedApi.markNotificationsRead()
    useChatStore.getState().fetchConversations()
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2"><Bell className="w-4 h-4"/> Notifications {total>0 && <span className="px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-xs">{total}</span>}</h2>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {unread.length===0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Bell className="w-8 h-8 mx-auto mb-2 opacity-30"/>
            <p>No new notifications</p>
            <p className="text-xs">You're all caught up!</p>
          </div>
        ) : unread.map(c=> (
          <button key={c.id} onClick={()=> onSelect(c.id)} className="w-full text-left p-3 rounded-xl bg-muted hover:bg-accent border">
            <p className="text-sm font-medium">{c.title}</p>
            <p className="text-xs text-muted-foreground truncate">{c.last_message?.content?.slice(0,60)}</p>
            <p className="text-[11px] mt-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground inline-block">{c.unread_count} new</p>
          </button>
        ))}
      </div>
      {total>0 && <div className="p-3 border-t"><button onClick={handleMarkAll} className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm flex items-center justify-center gap-2"><CheckCheck className="w-4 h-4"/> Mark all as read</button></div>}
    </div>
  )
}
