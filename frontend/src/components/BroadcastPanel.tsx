import { useEffect, useState } from 'react'
import { Megaphone, Plus, Send, Trash2, X, Users } from 'lucide-react'
import { broadcastApi } from '../services/api'

/**
 * Broadcast lists (WhatsApp-style): one message fanned out as individual
 * 1-1 chats. Recipients never see each other — no shared group.
 */
export function BroadcastPanel({ onClose }: { onClose: () => void }) {
  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [usernames, setUsernames] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => {
    broadcastApi
      .list()
      .then((r: any) => {
        if (r?.success) setLists(r.data || [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const create = async () => {
    if (!name.trim()) return setMsg('Name your list first')
    const member_usernames = usernames
      .split(/[\s,]+/)
      .map((u) => u.replace(/^@/, '').trim())
      .filter(Boolean)
    if (member_usernames.length === 0) return setMsg('Add at least one @username')
    setCreating(true)
    try {
      const r = await broadcastApi.create({ name: name.trim(), member_usernames })
      if (r?.success) {
        setLists((l) => [r.data, ...l])
        setName('')
        setUsernames('')
        setShowCreate(false)
        setMsg('Broadcast list created')
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this broadcast list?')) return
    try {
      await broadcastApi.remove(id)
      setLists((l) => l.filter((x) => x.id !== id))
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Failed')
    }
  }

  const send = async (id: number) => {
    const content = (drafts[id] || '').trim()
    if (!content || sendingId) return
    setSendingId(id)
    try {
      const r = await broadcastApi.send(id, content)
      if (r?.success) {
        setDrafts((d) => ({ ...d, [id]: '' }))
        setMsg(`Sent to ${r.data?.sent_to?.length ?? 0} chats`)
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setSendingId(null)
    }
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b border-[var(--k-border)]">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" /> Broadcast lists
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowCreate((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="New broadcast list">
            <Plus className="w-4 h-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {showCreate && (
          <div className="rounded-2xl border p-3 space-y-2 bg-muted/40">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="List name (e.g. Family)"
              maxLength={100}
              className="w-full px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm"
            />
            <input
              value={usernames}
              onChange={(e) => setUsernames(e.target.value)}
              placeholder="@usernames, comma separated"
              className="w-full px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm"
            />
            <button onClick={create} disabled={creating} className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {creating ? 'Creating…' : 'Create list'}
            </button>
          </div>
        )}
        {msg && <p className="text-xs text-center p-1.5 rounded-lg bg-muted">{msg}</p>}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
        ) : lists.length === 0 && !showCreate ? (
          <div className="text-center py-8 space-y-2">
            <Megaphone className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">No broadcast lists yet</p>
            <p className="text-xs text-muted-foreground px-6">
              Message many people at once — each gets it as a private 1-1 chat.
            </p>
          </div>
        ) : (
          lists.map((l) => (
            <div key={l.id} className="rounded-2xl border p-3 space-y-2 bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  {l.name}
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[11px] text-muted-foreground">{l.member_count} people</span>
                  <button onClick={() => remove(l.id)} className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-destructive" aria-label="Delete list">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div className="flex gap-2">
                <input
                  value={drafts[l.id] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send(l.id)
                    }
                  }}
                  placeholder={`Broadcast to ${l.name}…`}
                  maxLength={4000}
                  className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm"
                />
                <button
                  onClick={() => send(l.id)}
                  disabled={sendingId === l.id || !(drafts[l.id] || '').trim()}
                  className="px-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
                  aria-label="Send broadcast"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
