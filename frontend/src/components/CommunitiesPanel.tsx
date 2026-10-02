import { useEffect, useState } from 'react'
import { Network, Plus, Send, Trash2, X, Users, Megaphone, UserPlus, Minus } from 'lucide-react'
import { communityApi } from '../services/api'
import { useAuthStore } from '../store/auth'

/**
 * Communities (WhatsApp-style): umbrellas over groups. Owners link groups
 * in and broadcast announcements that land in every group at once.
 */
export function CommunitiesPanel({
  onClose,
  conversations,
  onOpenChat,
}: {
  onClose: () => void
  conversations: any[]
  onOpenChat: (id: number) => void
}) {
  const { user } = useAuthStore()
  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const load = () => {
    communityApi
      .list()
      .then((r: any) => {
        if (r?.success) setLists(r.data || [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const create = async () => {
    if (!name.trim()) return setMsg('Name your community first')
    setCreating(true)
    try {
      const r = await communityApi.create({ name: name.trim(), description: desc.trim() || undefined })
      if (r?.success) {
        setLists((l) => [r.data, ...l])
        setName('')
        setDesc('')
        setShowCreate(false)
        setMsg('Community created')
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this community? Its groups stay untouched.')) return
    try {
      await communityApi.remove(id)
      setLists((l) => l.filter((x) => x.id !== id))
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Failed')
    }
  }

  const addGroup = async (communityId: number, convId: number) => {
    try {
      const r = await communityApi.addGroup(communityId, convId)
      if (r?.success) {
        setLists((l) => l.map((x) => (x.id === communityId ? r.data : x)))
        setAddingTo(null)
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    }
  }

  const removeGroup = async (communityId: number, convId: number) => {
    try {
      const r = await communityApi.removeGroup(communityId, convId)
      if (r?.success) setLists((l) => l.map((x) => (x.id === communityId ? r.data : x)))
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Failed')
    }
  }

  const announce = async (id: number) => {
    const content = (drafts[id] || '').trim()
    if (!content || sendingId) return
    setSendingId(id)
    try {
      const r = await communityApi.announce(id, content)
      if (r?.success) {
        setDrafts((d) => ({ ...d, [id]: '' }))
        setMsg(`Announced to ${r.data?.reached?.length ?? 0} groups`)
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setSendingId(null)
    }
  }

  const myGroups = conversations.filter((c: any) => c.is_group)

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b border-[var(--k-border)]">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          <Network className="w-4 h-4 text-primary" /> Communities
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowCreate((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="New community">
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
              placeholder="Community name (e.g. Apartment Block)"
              maxLength={100}
              className="w-full px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm"
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
              maxLength={200}
              className="w-full px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm"
            />
            <button onClick={create} disabled={creating} className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50">
              {creating ? 'Creating…' : 'Create community'}
            </button>
          </div>
        )}
        {msg && <p className="text-xs text-center p-1.5 rounded-lg bg-muted">{msg}</p>}
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
        ) : lists.length === 0 && !showCreate ? (
          <div className="text-center py-8 space-y-2">
            <Network className="w-8 h-8 mx-auto text-muted-foreground" />
            <p className="text-sm font-medium">No communities yet</p>
            <p className="text-xs text-muted-foreground px-6">
              Gather related groups under one roof and announce to all of them at once.
            </p>
          </div>
        ) : (
          lists.map((c) => {
            const isOwner = user && c.owner_id === user.id
            const linkedIds = new Set((c.groups || []).map((g: any) => g.id))
            return (
              <div key={c.id} className="rounded-2xl border p-3 space-y-2 bg-muted/40">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold truncate">{c.name}</p>
                  {isOwner && (
                    <button onClick={() => remove(c.id)} className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-destructive shrink-0" aria-label="Delete community">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                {c.description && <p className="text-xs text-muted-foreground">{c.description}</p>}
                <div className="space-y-1">
                  {(c.groups || []).length === 0 && (
                    <p className="text-[11px] text-muted-foreground">No groups linked yet.</p>
                  )}
                  {(c.groups || []).map((g: any) => (
                    <div key={g.id} className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => onOpenChat(g.id)}
                        className="flex-1 min-w-0 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-background text-left transition"
                      >
                        <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <span className="truncate font-medium">{g.title || 'Group'}</span>
                        <span className="text-muted-foreground shrink-0">{g.member_count} members</span>
                      </button>
                      {isOwner && (
                        <button
                          onClick={() => removeGroup(c.id, g.id)}
                          className="p-1.5 rounded-full hover:bg-background text-muted-foreground hover:text-destructive shrink-0"
                          aria-label="Unlink group"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                {isOwner && (
                  <>
                    {addingTo === c.id ? (
                      <div className="rounded-xl border bg-background p-2 space-y-1 max-h-40 overflow-y-auto">
                        {myGroups.filter((g: any) => !linkedIds.has(g.id)).length === 0 && (
                          <p className="text-[11px] text-muted-foreground px-2 py-1">All your groups are linked.</p>
                        )}
                        {myGroups
                          .filter((g: any) => !linkedIds.has(g.id))
                          .map((g: any) => (
                            <button
                              key={g.id}
                              onClick={() => addGroup(c.id, g.id)}
                              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-xs flex items-center gap-2"
                            >
                              <UserPlus className="w-3.5 h-3.5 text-primary shrink-0" />
                              <span className="truncate">{g.title || 'Group'}</span>
                            </button>
                          ))}
                        <button onClick={() => setAddingTo(null)} className="w-full text-center text-[11px] text-muted-foreground py-1">
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setAddingTo(c.id)}
                        className="w-full py-1.5 rounded-xl bg-background border border-[var(--k-border)] text-xs hover:bg-muted transition flex items-center justify-center gap-1.5"
                      >
                        <UserPlus className="w-3.5 h-3.5" /> Add one of your groups
                      </button>
                    )}
                    <div className="flex gap-2">
                      <input
                        value={drafts[c.id] || ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [c.id]: e.target.value }))}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault()
                            announce(c.id)
                          }
                        }}
                        placeholder={`Announce to ${c.name}…`}
                        maxLength={2000}
                        className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm"
                      />
                      <button
                        onClick={() => announce(c.id)}
                        disabled={sendingId === c.id || !(drafts[c.id] || '').trim()}
                        className="px-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 shrink-0"
                        aria-label="Send announcement"
                      >
                        <Megaphone className="w-4 h-4" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
