import { useEffect, useState } from 'react'
import { extendedApi, usersApi } from '../services/api'
import { Contact, Search, MessageCircle, X } from 'lucide-react'
import { initials } from '../utils/format'
import { useDebounce } from '../hooks/useDebounce'

export function ContactsPanel({ onClose, onChat }: { onClose:()=>void, onChat:(user:any)=>void }) {
  const [contacts, setContacts]=useState<any[]>([])
  const [q, setQ]=useState('')
  const debounced=useDebounce(q, 300)
  const [searchRes, setSearchRes]=useState<any[]>([])
  const [loading, setLoading]=useState(true)

  useEffect(()=>{
    extendedApi.contacts().then(r=>{ if(r.success) setContacts(r.data)}).finally(()=> setLoading(false))
  }, [])

  useEffect(()=>{
    if (!debounced) { setSearchRes([]); return }
    usersApi.search(debounced).then(r=>{ if(r.success) setSearchRes(r.data)})
  }, [debounced])

  const list = q ? searchRes : contacts

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2"><Contact className="w-4 h-4"/> Contacts</h2>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
      </div>
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground"/>
          <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search contacts..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted outline-none text-sm"/>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {loading ? <p className="text-sm text-muted-foreground p-4">Loading contacts...</p> : list.length===0 ? (
          <p className="text-sm text-muted-foreground p-4 text-center">{q ? 'No users found' : 'No contacts yet. Search to start chatting.'}</p>
        ) : list.map(u=> (
          <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center overflow-hidden">
              {u.avatar_url ? <img src={u.avatar_url} className="w-full h-full object-cover" alt=""/> : initials(u.display_name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.display_name}</p>
              <p className="text-xs text-muted-foreground truncate">@{u.username} • {u.is_online ? 'Online' : 'Offline'}</p>
            </div>
            <button onClick={()=> onChat(u)} className="p-2 rounded-full bg-primary text-primary-foreground"><MessageCircle className="w-4 h-4"/></button>
          </div>
        ))}
      </div>
    </div>
  )
}
