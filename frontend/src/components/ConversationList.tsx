import { Conversation } from '../types'
import { formatTime, initials } from '../utils/format'
import { Users, Search } from 'lucide-react'

export function ConversationItem({ conv, active, onClick }: { conv:Conversation, active:boolean, onClick:()=>void }) {
  const isGroup = conv.is_group
  const title = conv.title || 'Unknown'
  const avatar = conv.avatar_url
  const last = conv.last_message
  const hasUnread = conv.unread_count > 0
  return (
    <button onClick={onClick} className={`w-full flex gap-3 p-3 rounded-xl text-left transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'}`}>
      <div className="relative shrink-0">
        <div className={`w-11 h-11 rounded-full flex items-center justify-center overflow-hidden ${active ? 'bg-white/20' : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'}`}>
          {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : isGroup ? <Users className="w-5 h-5"/> : <span className="text-sm font-semibold">{initials(title)}</span>}
        </div>
        {!isGroup && conv.members.some(m=>m.is_online) && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex justify-between items-center gap-2">
          <p className={`font-medium truncate text-sm ${active?'text-primary-foreground':'text-foreground'}`}>{title}</p>
          <span className={`text-[11px] shrink-0 ${active?'text-white/70':'text-muted-foreground'}`}>{last ? formatTime(last.created_at) : ''}</span>
        </div>
        <div className="flex justify-between items-center gap-2 mt-0.5">
          <p className={`truncate text-xs ${active ? 'text-white/80' : 'text-muted-foreground'}`}>{last ? (last.content?.slice(0,40) || '📎 Attachment') : isGroup ? `${conv.members.length} members` : 'Start conversation'}</p>
          {hasUnread && <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none ${active?'bg-white text-primary':'bg-primary text-primary-foreground'}`}>{conv.unread_count}</span>}
        </div>
      </div>
    </button>
  )
}

export function ConversationList({ conversations, activeId, onSelect, search, onSearch }: { conversations:Conversation[], activeId:number|null, onSelect:(id:number)=>void, search:string, onSearch:(v:string)=>void }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search conversations..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-sm transition" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1">
        {conversations.length===0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No conversations yet.<br/>Search users to start chatting.</div>
        ) : conversations.map(c=> (
          <ConversationItem key={c.id} conv={c} active={c.id===activeId} onClick={()=>onSelect(c.id)} />
        ))}
      </div>
    </div>
  )
}
