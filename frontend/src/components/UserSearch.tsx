import { useState, useEffect } from 'react'
import { Search, UserPlus } from 'lucide-react'
import { usersApi } from '../services/api'
import { useDebounce } from '../hooks/useDebounce'
import { initials } from '../utils/format'

export function UserSearch({ onSelect }: { onSelect:(user:any)=>void }) {
  const [q, setQ]=useState('')
  const debounced=useDebounce(q, 350)
  const [results, setResults]=useState<any[]>([])
  const [loading, setLoading]=useState(false)

  useEffect(()=>{
    if (!debounced || debounced.length<1) { setResults([]); return }
    setLoading(true)
    usersApi.search(debounced).then(res=>{
      if (res.success) setResults(res.data)
    }).finally(()=> setLoading(false))
  }, [debounced])

  return (
    <div className="p-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search by username or name..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-muted border border-transparent focus:border-primary focus:bg-background outline-none text-sm" />
      </div>
      <div className="mt-3 space-y-2 max-h-72 overflow-y-auto">
        {loading && <p className="text-xs text-muted-foreground p-2">Searching...</p>}
        {!loading && results.map(u=> (
          <div key={u.id} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 text-white flex items-center justify-center overflow-hidden">
              {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : <span className="text-sm font-semibold">{initials(u.display_name)}</span>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{u.display_name}</p>
              <p className="text-xs text-muted-foreground truncate">@{u.username}</p>
            </div>
            <button onClick={()=>onSelect(u)} className="px-3 py-1.5 rounded-full bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1 hover:bg-primary/90"><UserPlus className="w-3 h-3"/> Chat</button>
          </div>
        ))}
        {!loading && debounced && results.length===0 && <p className="text-xs text-muted-foreground p-2 text-center">No users found.</p>}
      </div>
    </div>
  )
}
