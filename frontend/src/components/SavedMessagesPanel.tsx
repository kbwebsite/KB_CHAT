import { useEffect, useState } from 'react'
import { savedApi } from '../services/api'
import { Bookmark, Trash2, X } from 'lucide-react'
import { formatTime } from '../utils/format'
import { useToastStore } from '../store/toast'

function isCancel(err: any): boolean {
  return !!err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError')
}

/**
 * Saved Messages manager (PE-2C). Renders the REAL backend-backed list
 * (`GET /api/saved-messages`, `saved_at DESC`, no pagination) and reuses
 * the existing save/unsave endpoints. Conversation titles come from the
 * already-loaded conversation list (the API returns only
 * `conversation_id`); unknown conversations fall back to "Chat".
 * Row taps call `onJump(cid, mid)` with BOTH ids so the shell can perform
 * the exact PE-2A `jumpToMessageId` scroll+flash instead of dropping `mid`
 * (the old P1-5 gap).
 */
export function SavedMessagesPanel({ onClose, onJump, onUnsave, conversations }: {
  onClose:()=>void
  onJump:(cid:number, mid:number)=>void
  onUnsave?:(mid:number)=>void
  conversations?: any[]
}) {
  const [items, setItems]=useState<any[]>([])
  const [loading, setLoading]=useState(true)
  const [error, setError]=useState(false)
  const [retryTick, setRetryTick]=useState(0)
  const toast = useToastStore((s) => s.push)

  useEffect(()=>{
    const ctrl = new AbortController()
    let live = true
    setLoading(true)
    setError(false)
    savedApi.list(ctrl.signal).then((res:any)=>{
      if (!live || ctrl.signal.aborted) return
      if (res?.success && Array.isArray(res.data)) setItems(res.data)
      else if (!res?.success) setError(true)
    }).catch((e)=>{
      if (!live || ctrl.signal.aborted || isCancel(e)) return
      setError(true)
    }).finally(()=>{
      if (live && !ctrl.signal.aborted) setLoading(false)
    })
    return ()=>{ live = false; ctrl.abort() }
  }, [retryTick])

  const titleOf = (cid:number) =>
    (conversations || []).find((c:any)=> c.id === cid)?.title || 'Chat'

  const handleUnsave=async (mid:number)=>{
    try {
      await savedApi.unsave(mid)
    } catch {
      toast('Could not remove it. Try again.', 'error')
      return
    }
    setItems(prev=> prev.filter(i=> i.message_id!==mid))
    try { onUnsave?.(mid) } catch {}
    toast('Removed from saved', 'success')
  }

  return (
    <div className="h-full flex flex-col bg-card" role="dialog" aria-label="Saved messages">
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <h2 className="font-semibold flex items-center gap-2"><Bookmark className="w-4 h-4" aria-hidden="true" /> Saved Messages</h2>
        <button
          onClick={onClose}
          aria-label="Close saved messages"
          className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {loading ? (
          <div aria-label="Loading saved messages" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-muted border border-border animate-pulse">
                <div className="h-3 w-32 rounded bg-elevated" />
                <div className="h-3 w-full rounded bg-elevated mt-2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">Could not load saved messages</p>
            <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="mt-3 px-4 py-2.5 rounded-xl btn-primary text-sm font-bold min-h-[44px]"
            >
              Retry
            </button>
          </div>
        ) : items.length===0 ? (
          <div className="p-8 text-center">
            <Bookmark className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
            <p className="text-sm font-semibold">No saved messages yet</p>
            <p className="text-xs text-muted-foreground mt-1">Tap bookmark on any message to save it.</p>
          </div>
        ) : items.map(it=> (
          <div key={it.id} className="p-3 rounded-xl bg-muted border border-border flex justify-between gap-2">
            <button
              onClick={()=> onJump(it.conversation_id, it.message_id)}
              aria-label={`Open saved message from ${it.sender_display_name || it.sender_username || 'unknown'} in ${titleOf(it.conversation_id)}`}
              className="flex-1 text-left min-w-0 min-h-[44px]"
            >
              <p className="text-xs text-muted-foreground truncate">
                <span className="text-primary font-medium">{it.sender_display_name || it.sender_username || 'Unknown'}</span>
                {' in '}{titleOf(it.conversation_id)}
                {it.created_at ? ` • ${formatTime(it.created_at)}` : ''}
              </p>
              <p className="text-sm line-clamp-2 break-words">{it.content}</p>
            </button>
            <button
              onClick={()=> handleUnsave(it.message_id)}
              aria-label={`Remove saved message from ${it.sender_display_name || it.sender_username || 'unknown'}`}
              className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-background hover:text-destructive shrink-0"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
