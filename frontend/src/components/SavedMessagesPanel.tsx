import { useEffect, useState } from 'react'
import { savedApi } from '../services/api'
import { Bookmark, Trash2, X } from 'lucide-react'
import { formatTime } from '../utils/format'

export function SavedMessagesPanel({ onClose, onJump }: { onClose:()=>void, onJump:(cid:number, mid:number)=>void }) {
  const [items, setItems]=useState<any[]>([])
  const [loading, setLoading]=useState(true)

  const load=async ()=>{
    setLoading(true)
    try {
      const res=await savedApi.list()
      if (res.success) setItems(res.data)
    } finally { setLoading(false) }
  }
  useEffect(()=>{ load() }, [])

  const handleUnsave=async (mid:number)=>{
    await savedApi.unsave(mid)
    setItems(prev=> prev.filter(i=> i.message_id!==mid))
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2"><Bookmark className="w-4 h-4"/> Saved Messages</h2>
        <button onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? <p className="text-sm text-muted-foreground p-4">Loading...</p> : items.length===0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-30"/>
            <p>No saved messages yet</p>
            <p className="text-xs">Tap bookmark on any message to save it.</p>
          </div>
        ) : items.map(it=> (
          <div key={it.id} className="p-3 rounded-xl bg-muted border flex justify-between gap-2">
            <button onClick={()=> onJump(it.conversation_id, it.message_id)} className="flex-1 text-left">
              <p className="text-xs text-primary font-medium">{it.sender_display_name} • {formatTime(it.created_at)}</p>
              <p className="text-sm line-clamp-2">{it.content}</p>
            </button>
            <button onClick={()=> handleUnsave(it.message_id)} className="p-2 hover:bg-background rounded-full h-fit"><Trash2 className="w-4 h-4 text-destructive"/></button>
          </div>
        ))}
      </div>
    </div>
  )
}
