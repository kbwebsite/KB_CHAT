import { useEffect, useRef, useState } from 'react'
import { extendedApi, usersApi } from '../services/api'
import { Contact, Search, MessageCircle, X, Users } from 'lucide-react'
import { initials } from '../utils/format'
import { useDebounce } from '../hooks/useDebounce'
import { useChatStore } from '../store/chat'
import { useAuthStore } from '../store/auth'

export function ContactsPanel({ onClose, onChat, onSelectConversation }: { onClose:()=>void, onChat:(user:any)=>void, onSelectConversation?:(cid:number)=>void }) {
  const [contacts, setContacts]=useState<any[]>([])
  const [q, setQ]=useState('')
  const debounced=useDebounce(q, 300)
  const [searchRes, setSearchRes]=useState<any[]>([])
  const [loading, setLoading]=useState(true)
  const searchSeq = useRef(0)
  const conversations = useChatStore(s => s.conversations)
  const fetchConversations = useChatStore(s => s.fetchConversations)
  const currentUserId = useAuthStore(s => s.user?.id)

  // Map contact user_id -> total unread across 1-1 conversations with them,
  // plus the full group list (unread-first) so contacts AND groups show.
  const unreadByUser: Record<number, number> = {}
  const groups: any[] = []
  for (const c of conversations as any[]) {
    if (c.is_group) { groups.push(c); continue }
    if (!c.unread_count) continue
    const other = (c.members || []).find((m: any) => m.user_id !== currentUserId)
    if (other) unreadByUser[other.user_id] = (unreadByUser[other.user_id] || 0) + c.unread_count
  }
  groups.sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0))

  // Make sure we have conversation data even if the panel opens first.
  useEffect(() => {
    if (conversations.length === 0) fetchConversations().catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(()=>{
    extendedApi.contacts().then(r=>{ if(r.success) setContacts(r.data)}).finally(()=> setLoading(false))
  }, [])

  useEffect(()=>{
    if (!debounced) { setSearchRes([]); return }
    // Guard against out-of-order responses: only the latest query wins.
    const seq = ++searchSeq.current
    usersApi.search(debounced).then(r=>{
      if (seq === searchSeq.current && r.success) setSearchRes(r.data)
    })
  }, [debounced])

  const list = q ? searchRes : contacts
  const visibleGroups = q
    ? groups.filter(g => (g.title || '').toLowerCase().includes(q.toLowerCase()))
    : groups

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="panel-head flex items-center justify-between p-4">
        <h2 className="panel-title"><Contact className="w-4 h-4"/> Contacts</h2>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
      </div>
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted outline-none text-sm"/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {visibleGroups.length > 0 && (
          <div className="pb-1">
            <p className="px-2 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Groups{q ? ' • matching' : ''}</p>
            {visibleGroups.map(g => (
              <button key={`g-${g.id}`} onClick={() => onSelectConversation?.(g.id)} className="panel-row w-full text-left flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted" aria-label={g.unread_count > 0 ? `Open ${g.title}, ${g.unread_count} unread` : `Open ${g.title}`}>
                <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-white flex items-center justify-center overflow-visible shrink-0">
                  <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden">
                  {g.avatar_url ? <img src={g.avatar_url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt="" /> : <Users className="w-4 h-4" />}
                  </div>
                  {g.unread_count > 0 && (
                    <span className="conv-unread" style={{ position: 'absolute', top: -6, right: -8 }} aria-label={`${g.unread_count} unread messages`}>
                      {g.unread_count > 99 ? '99+' : g.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{g.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{(g.members || []).length} members{g.unread_count > 0 ? ` • ${g.unread_count} new` : g.last_message?.content ? ` • ${(g.last_message.content as string).slice(0, 30)}` : ''}</p>
                </div>
              </button>
            ))}
          </div>
        )}
        <p className="px-2 pt-1 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Contacts</p>
        {loading ? <p className="text-sm text-muted-foreground p-4">Loading contacts...</p> : list.length===0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">{q ? 'No users found' : 'No contacts yet. Search to start chatting.'}</p>
        ) : list.map(u=> {
          const unread = unreadByUser[u.id] || 0
          return (
          <div key={u.id} className="panel-row flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted">
            <div className="relative w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center overflow-visible shrink-0">
              <div className="w-full h-full rounded-full flex items-center justify-center overflow-hidden">
                {u.avatar_url ? <img src={u.avatar_url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt=""/> : initials(u.display_name)}
              </div>
              {unread > 0 && (
                <span className="conv-unread" style={{ position: 'absolute', top: -6, right: -8 }} aria-label={`${unread} unread messages`}>
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.display_name}</p>
              <p className="text-xs text-muted-foreground truncate">@{u.username} • {u.is_online ? 'Online' : 'Offline'}</p>
            </div>
            <button onClick={()=> onChat(u)} className="p-2 rounded-full bg-primary text-primary-foreground" aria-label={`Chat with ${u.display_name}`}><MessageCircle className="w-4 h-4"/></button>
          </div>
          )
        })}
      </div>
    </div>
  )
}
