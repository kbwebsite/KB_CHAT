import { useEffect, useState } from 'react'
import { Star, Trash2, X, Plus, Image as ImageIcon } from 'lucide-react'
import { statusApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { useToastStore } from '../store/toast'

function isCancel(err: any): boolean {
  return !!err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError')
}

/**
 * Highlights manager (PE-2D, PATH B). Status Highlights are Instagram-style
 * permanent collections of the user's own statuses: backend
 * (`api/highlights.py`) + client (`statusApi.highlights`) fully existed,
 * zero UI consumed them. This panel exposes exactly that contract —
 * list/create/delete highlights, add/remove items, view items in the
 * existing StatusViewer. No message involvement: highlight items reference
 * Status rows, so there is no conversation to open and no message to jump
 * to; item taps reuse the existing status-viewer flow.
 */
export function HighlightsPanel({ onClose, onViewer }: {
  onClose: () => void
  onViewer: (statuses: any[], idx: number) => void
}) {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [myStatuses, setMyStatuses] = useState<any[] | null>(null)
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const toast = useToastStore((s) => s.push)
  const user = useAuthStore((s) => s.user)

  useEffect(() => {
    const ctrl = new AbortController()
    let live = true
    setLoading(true)
    setError(false)
    statusApi.highlights.list(ctrl.signal).then((res: any) => {
      if (!live || ctrl.signal.aborted) return
      if (res?.success && Array.isArray(res.data)) setItems(res.data)
      else if (!res?.success) setError(true)
    }).catch((e) => {
      if (!live || ctrl.signal.aborted || isCancel(e)) return
      setError(true)
    }).finally(() => {
      if (live && !ctrl.signal.aborted) setLoading(false)
    })
    return () => { live = false; ctrl.abort() }
  }, [retryTick])

  const refresh = async () => {
    try {
      const res = await statusApi.highlights.list()
      if (res?.success && Array.isArray(res.data)) {
        setItems(res.data)
        return res.data
      }
    } catch {}
    return null
  }

  const handleCreate = async () => {
    const title = newTitle.trim()
    if (!title || creating) return
    setCreating(true)
    try {
      const res = await statusApi.highlights.create(title)
      if (res?.success) {
        setNewTitle('')
        await refresh()
        toast('Highlight created', 'success')
      } else {
        toast('Could not create it. Try again.', 'error')
      }
    } catch {
      toast('Could not create it. Try again.', 'error')
    }
    setCreating(false)
  }

  const handleDelete = async (hid: number) => {
    if (!confirm('Delete this highlight?')) return
    try {
      await statusApi.highlights.delete(hid)
    } catch {
      toast('Could not delete it. Try again.', 'error')
      return
    }
    if (expanded === hid) setExpanded(null)
    await refresh()
    toast('Highlight deleted', 'success')
  }

  const openAdder = async (hid: number) => {
    if (addingTo === hid) { setAddingTo(null); return }
    setAddingTo(hid)
    if (myStatuses) return
    try {
      const m = await statusApi.my()
      if (m?.success) setMyStatuses(Array.isArray(m.data) ? m.data : [])
    } catch {}
  }

  const handleAddItem = async (hid: number, sid: number) => {
    if (busy) return
    setBusy(true)
    try {
      const res = await statusApi.highlights.addItem(hid, sid)
      if (res?.success) {
        await refresh()
        toast('Added to highlight', 'success')
      } else {
        toast('Could not add it. Try again.', 'error')
      }
    } catch {
      toast('Could not add it. Try again.', 'error')
    }
    setBusy(false)
  }

  const handleRemoveItem = async (hid: number, sid: number) => {
    try {
      const res = await statusApi.highlights.removeItem(hid, sid)
      if (res?.success) {
        const data = await refresh()
        if (data) toast('Removed from highlight', 'success')
      } else {
        toast('Could not remove it. Try again.', 'error')
      }
    } catch {
      toast('Could not remove it. Try again.', 'error')
    }
  }

  // Highlight item dicts carry no viewer fields (no display_name/avatar);
  // enrich from the signed-in user (items are always one's own statuses —
  // the backend enforces status ownership on add) so StatusViewer never
  // sees an undefined display_name.
  const viewable = (statuses: any[]) =>
    statuses.map((s: any) => ({
      ...s,
      display_name: s.display_name || user?.display_name || user?.username || 'You',
      avatar_url: s.avatar_url || user?.avatar_url || null,
      is_own: true,
    }))

  return (
    <div className="h-full flex flex-col bg-card" role="dialog" aria-label="Highlights">
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <h2 className="font-semibold flex items-center gap-2">
          <Star className="w-4 h-4" aria-hidden="true" />
          Highlights
        </h2>
        <button
          onClick={onClose}
          aria-label="Close highlights"
          className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        <div className="flex gap-2">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleCreate() }}
            placeholder="New highlight title"
            aria-label="New highlight title"
            maxLength={50}
            className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-muted border border-border outline-none text-sm min-h-[44px]"
          />
          <button
            onClick={() => void handleCreate()}
            disabled={!newTitle.trim() || creating}
            aria-label="Create highlight"
            className="px-4 rounded-xl btn-primary text-sm font-bold min-h-[44px] min-w-[44px] disabled:opacity-40 flex items-center justify-center gap-1"
          >
            <Plus className="w-4 h-4" aria-hidden="true" />
            New
          </button>
        </div>

        {loading ? (
          <div aria-label="Loading highlights" aria-busy="true" className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-3 rounded-xl bg-muted border border-border animate-pulse">
                <div className="h-3 w-32 rounded bg-elevated" />
                <div className="h-3 w-full rounded bg-elevated mt-2" />
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm font-semibold">Could not load highlights</p>
            <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="mt-3 px-4 py-2.5 rounded-xl btn-primary text-sm font-bold min-h-[44px]"
            >
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center">
            <Star className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
            <p className="text-sm font-semibold">No highlights yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create one above, then add your statuses to keep them forever.
            </p>
          </div>
        ) : (
          items.map((h: any) => {
            const isOpen = expanded === h.id
            const inIds = new Set((h.statuses || []).map((s: any) => s.id))
            return (
              <div key={h.id} className="rounded-xl bg-muted border border-border overflow-hidden">
                <div className="flex items-center gap-2.5 p-3">
                  <button
                    onClick={() => setExpanded(isOpen ? null : h.id)}
                    aria-expanded={isOpen}
                    aria-label={`${isOpen ? 'Collapse' : 'Expand'} highlight ${h.title}`}
                    className="flex-1 flex items-center gap-3 text-left min-w-0 min-h-[44px]"
                  >
                    <span className="w-10 h-10 rounded-full overflow-hidden bg-background flex items-center justify-center shrink-0" aria-hidden="true">
                      {h.cover ? (
                        <img src={h.cover} alt="" loading="lazy" className="w-full h-full object-cover" />
                      ) : (
                        <Star className="w-4 h-4 text-primary" />
                      )}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-semibold truncate">{h.title}</span>
                      <span className="block text-xs text-muted-foreground">
                        {h.status_count ?? (h.statuses || []).length} item{((h.status_count ?? (h.statuses || []).length) === 1) ? '' : 's'}
                      </span>
                    </span>
                  </button>
                  <button
                    onClick={() => void handleDelete(h.id)}
                    aria-label={`Delete highlight ${h.title}`}
                    className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-background hover:text-destructive shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {isOpen && (
                  <div className="px-3 pb-3 space-y-2 border-t border-border pt-2">
                    {(h.statuses || []).length === 0 ? (
                      <p className="text-xs text-muted-foreground py-1">Nothing here yet — add a status below.</p>
                    ) : (
                      (h.statuses || []).map((s: any, i: number) => (
                        <div key={s.id} className="flex items-center gap-2.5 p-2 rounded-xl bg-background border border-border">
                          <button
                            onClick={() => onViewer(viewable(h.statuses), i)}
                            aria-label={`View highlight item ${i + 1} in ${h.title}`}
                            className="flex-1 flex items-center gap-2.5 text-left min-w-0 min-h-[44px]"
                          >
                            <span className="w-9 h-9 rounded-lg overflow-hidden bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
                              {s.media_url ? (
                                <img src={s.media_url} alt="" loading="lazy" className="w-full h-full object-cover" />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-muted-foreground" />
                              )}
                            </span>
                            <span className="flex-1 min-w-0 text-xs truncate">
                              {s.media_type === 'text' ? (s.content || '').slice(0, 80) : (s.content || s.caption || s.media_type || 'Status')}
                            </span>
                          </button>
                          <button
                            onClick={() => void handleRemoveItem(h.id, s.id)}
                            aria-label={`Remove item from highlight ${h.title}`}
                            className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-destructive shrink-0"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                    <button
                      onClick={() => void openAdder(h.id)}
                      aria-expanded={addingTo === h.id}
                      aria-label={`Add a status to highlight ${h.title}`}
                      className="w-full py-2.5 rounded-xl bg-background border border-dashed border-border text-xs font-semibold text-muted-foreground hover:text-foreground min-h-[44px] flex items-center justify-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                      Add from my statuses
                    </button>
                    {addingTo === h.id && (
                      <div className="space-y-1 max-h-52 overflow-y-auto">
                        {myStatuses === null ? (
                          <p className="text-xs text-muted-foreground py-1">Loading…</p>
                        ) : myStatuses.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">No statuses to add — post one first.</p>
                        ) : (
                          myStatuses.map((s: any) => (
                            <button
                              key={s.id}
                              disabled={inIds.has(s.id) || busy}
                              onClick={() => void handleAddItem(h.id, s.id)}
                              className="w-full text-left px-2.5 py-2 rounded-lg hover:bg-background border border-transparent hover:border-border text-xs min-h-[44px] disabled:opacity-40 truncate"
                            >
                              {inIds.has(s.id) ? '✓ ' : ''}
                              {(s.content || s.caption || s.media_type || 'Status').slice(0, 80)}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
