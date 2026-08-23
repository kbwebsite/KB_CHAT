import { Conversation } from '../types'
import { formatTime, initials } from '../utils/format'
import { Users, Search, Pin, BellOff, Archive, Check, CheckCheck } from 'lucide-react'

export function ConversationItem({ conv, active, onClick, isTyping, currentUserId, onPin, onMute, onArchive }: { conv:Conversation, active:boolean, onClick:()=>void, isTyping?:boolean, currentUserId?:number, onPin?:(id:number)=>void, onMute?:(id:number)=>void, onArchive?:(id:number)=>void }) {
  const isGroup = conv.is_group
  const title = conv.title || 'Unknown'
  const avatar = conv.avatar_url
  const last = conv.last_message
  const hasUnread = conv.unread_count > 0
  const isPinned = (conv as any).is_pinned
  const isMuted = (conv as any).is_muted
  const isArchived = (conv as any).is_archived
  const isOwnLast = last?.sender_id === currentUserId

  return (
    <div className={`group relative w-full flex gap-3 p-3 rounded-xl text-left transition ${active ? 'bg-primary text-primary-foreground shadow-sm' : 'hover:bg-muted'} ${isPinned ? 'ring-1 ring-primary/20 bg-primary/5' : ''}`}>
      {isPinned && <span className="absolute top-1 right-1"><Pin className="w-3 h-3 text-primary opacity-70" /></span>}
      <button onClick={onClick} className="flex gap-3 flex-1 min-w-0 text-left">
        <div className="relative shrink-0">
          <div className={`w-11 h-11 rounded-full flex items-center justify-center overflow-hidden ${active ? 'bg-white/20' : 'bg-gradient-to-br from-violet-500 to-indigo-600 text-white'}`}>
            {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : isGroup ? <Users className="w-5 h-5"/> : <span className="text-sm font-semibold">{initials(title)}</span>}
          </div>
          {!isGroup && conv.members.some(m=>m.is_online) && <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-background rounded-full animate-pulse" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-center gap-2">
            <p className={`font-medium truncate text-sm flex items-center gap-1.5 ${active?'text-primary-foreground':'text-foreground'}`}>{title} {isMuted && <BellOff className="w-3 h-3 opacity-60" />} {isArchived && <Archive className="w-3 h-3 opacity-40" />}</p>
            <span className={`text-[11px] shrink-0 flex items-center gap-1 ${active?'text-white/70':'text-muted-foreground'}`}>
              {isOwnLast && last && <span className="hidden sm:inline">{hasUnread ? <CheckCheck className="w-3 h-3" /> : <CheckCheck className="w-3 h-3 opacity-60" />}</span>}
              {last ? formatTime(last.created_at) : ''}
            </span>
          </div>
          <div className="flex justify-between items-center gap-2 mt-0.5">
            <p className={`truncate text-xs flex-1 ${isTyping ? 'text-primary font-medium animate-pulse' : active ? 'text-white/80' : 'text-muted-foreground'}`}>
              {isTyping ? 'typing...' : last ? (isGroup && !isOwnLast && last.sender_username ? `${last.sender_username}: ` : '') + (last.content?.slice(0,38) || '📎 Attachment') : isGroup ? `${conv.members.length} members` : 'Start conversation'}
            </p>
            <span className="flex items-center gap-1 shrink-0">
              {hasUnread && <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-bold leading-none ${active?'bg-white text-primary':'bg-primary text-primary-foreground'} ${isMuted ? 'opacity-60' : ''}`}>{conv.unread_count}</span>}
            </span>
          </div>
        </div>
      </button>
      <div className="hidden group-hover:flex items-center gap-1 absolute right-1 top-1/2 -translate-y-1/2 bg-card border rounded-full p-1 shadow-md">
        <button onClick={(e)=>{ e.stopPropagation(); onPin?.(conv.id)}} title={isPinned?"Unpin":"Pin"} className={`p-1 rounded-full hover:bg-muted ${isPinned?'text-primary':''}`}><Pin className="w-3.5 h-3.5"/></button>
        <button onClick={(e)=>{ e.stopPropagation(); onMute?.(conv.id)}} title={isMuted?"Unmute":"Mute"} className={`p-1 rounded-full hover:bg-muted ${isMuted?'text-amber-500':''}`}><BellOff className="w-3.5 h-3.5"/></button>
        <button onClick={(e)=>{ e.stopPropagation(); onArchive?.(conv.id)}} title={isArchived?"Unarchive":"Archive"} className="p-1 rounded-full hover:bg-muted"><Archive className="w-3.5 h-3.5"/></button>
      </div>
    </div>
  )
}

export function ConversationList({ conversations, activeId, onSelect, search, onSearch, typingMap, currentUserId, onPin, onArchive, onMute, loading }: { conversations:Conversation[], activeId:number|null, onSelect:(id:number)=>void, search:string, onSearch:(v:string)=>void, typingMap?: Record<number, Set<number>>, currentUserId?:number, onPin?:(id:number)=>void, onArchive?:(id:number)=>void, onMute?:(id:number)=>void, loading?:boolean }) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={e=>onSearch(e.target.value)} placeholder="Search conversations..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-sm transition" />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-1 scrollbar-thin">
        {loading ? (
          <div className="p-3 space-y-3">
            {Array.from({length:5}).map((_,i)=><div key={i} className="flex gap-3 animate-pulse"><div className="w-11 h-11 rounded-full bg-muted"/><div className="flex-1 space-y-2"><div className="h-3 w-24 bg-muted rounded"/><div className="h-3 w-full bg-muted rounded"/></div></div>)}
          </div>
        ) : conversations.length===0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">No conversations yet.<br/>Search users to start chatting.</div>
        ) : conversations.map(c=> (
          <ConversationItem key={c.id} conv={c} active={c.id===activeId} onClick={()=>onSelect(c.id)} isTyping={!!typingMap?.[c.id]?.size} currentUserId={currentUserId} onPin={onPin} onMute={onMute} onArchive={onArchive} />
        ))}
      </div>
    </div>
  )
}
