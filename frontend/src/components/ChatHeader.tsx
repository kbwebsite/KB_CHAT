import { Conversation } from '../types'
import { formatLastSeen, initials } from '../utils/format'
import { Users, MoreVertical, ArrowLeft, Phone, Video, Search, BellOff, Trash2, Download, FileText, Image as ImageIcon, Link as LinkIcon, Mic } from 'lucide-react'

export function ChatHeader({ conv, currentUserId, onBack, onInfo, onCall, onMute, onSearch, activeTab, onTabChange }: {
  conv:Conversation|null, currentUserId?:number, onBack?:()=>void, onInfo?:()=>void,
  onCall?:(type:'voice'|'video')=>void,
  onMute?:()=>void,
  onSearch?:()=>void,
  activeTab?: string,
  onTabChange?:(tab:string)=>void
}) {
  if (!conv) return <div className="h-[64px] border-b bg-card flex items-center px-4">Select a conversation</div>
  const title = conv.title || 'Unknown'
  const isOnline = !conv.is_group && conv.members.some(m=> m.user_id !== currentUserId && m.is_online)
  const subtitle = conv.is_group ? `${conv.members.length} members` : isOnline ? 'Online' : formatLastSeen(conv.members.find(m=> m.user_id!==currentUserId)?.is_online ? undefined : undefined, false)

  const tabs = [
    {id:'chat', label:'Chat'},
    {id:'files', label:'Files', icon: FileText},
    {id:'media', label:'Media', icon: ImageIcon},
    {id:'links', label:'Links', icon: LinkIcon},
    {id:'voice', label:'Voice', icon: Mic},
  ]

  return (
    <div className="border-b bg-card/80 backdrop-blur shrink-0">
      <div className="h-[64px] flex items-center justify-between px-3 sm:px-4">
        <div className="flex items-center gap-3 min-w-0">
          {onBack && <button onClick={onBack} className="lg:hidden p-2 rounded-full hover:bg-muted"><ArrowLeft className="w-5 h-5"/></button>}
          <div className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center bg-gradient-to-br from-violet-500 to-indigo-600 text-white shrink-0">
            {conv.avatar_url ? <img src={conv.avatar_url} className="w-full h-full object-cover" alt="" /> : conv.is_group ? <Users className="w-5 h-5"/> : <span className="text-sm font-semibold">{initials(title)}</span>}
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-sm leading-tight truncate">{title}</p>
            <p className={`text-xs truncate ${isOnline?'text-emerald-600 dark:text-emerald-400': 'text-muted-foreground'}`}>{conv.is_group? subtitle : (isOnline ? 'Online' : subtitle)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onSearch} className="p-2 rounded-full hover:bg-muted" title="Search (Ctrl+K)"><Search className="w-4 h-4"/></button>
          <button onClick={onMute} className="p-2 rounded-full hover:bg-muted hidden sm:flex" title="Mute"><BellOff className="w-4 h-4"/></button>
          <button onClick={()=> onCall?.('voice')} className="p-2 rounded-full hover:bg-muted" title="Voice call"><Phone className="w-4 h-4"/></button>
          <button onClick={()=> onCall?.('video')} className="p-2 rounded-full hover:bg-muted" title="Video call"><Video className="w-4 h-4"/></button>
          <button onClick={onInfo} className="p-2 rounded-full hover:bg-muted" title="Info"><MoreVertical className="w-4 h-4"/></button>
        </div>
      </div>
      {onTabChange && (
        <div className="flex gap-1 px-2 pb-2 overflow-x-auto">
          {tabs.map(t=> (
            <button key={t.id} onClick={()=> onTabChange(t.id)} className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${activeTab===t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>
              {t.icon && <t.icon className="w-3 h-3"/>}{t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
