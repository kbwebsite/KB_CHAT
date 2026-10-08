import { useEffect, useState } from 'react'
import { Megaphone, Plus, Send, Trash2, X, Users } from 'lucide-react'
import { broadcastApi } from '../services/api'

function isCancel(err: any): boolean {
  return !!err && (err.code === 'ERR_CANCELED' || err.name === 'CanceledError' || err.name === 'AbortError')
}

/**
 * Broadcast lists, PE-2E pass + PE-2G membership (WhatsApp-style: one
 * message fanned out as individual 1-1 chats; recipients never see each
 * other). Real contract (`api/broadcasts.py` + `services/broadcasts.py`):
 * list / create / delete / send / members / add-member / remove-member.
 * All lists shown are owner-scoped server-side, so the members section
 * needs no additional visibility gating.
 */
export function BroadcastPanel({ onClose }: { onClose: () => void }) {
  const [lists, setLists] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retryTick, setRetryTick] = useState(0)
  const [name, setName] = useState('')
  const [usernames, setUsernames] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [sendingId, setSendingId] = useState<number | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  // PE-2G membership: per-list expand + member cache + add inputs.
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [members, setMembers] = useState<Record<number, { loading: boolean; error: boolean; items: any[] }>>({})
  const [addName, setAddName] = useState<Record<number, string>>({})
  const [addingId, setAddingId] = useState<number | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    let live = true
    setLoading(true)
    setLoadError(false)
    broadcastApi
      .list(ctrl.signal)
      .then((r: any) => {
        if (!live || ctrl.signal.aborted) return
        if (r?.success) setLists(r.data || [])
        else setLoadError(true)
      })
      .catch((e: any) => {
        if (!live || ctrl.signal.aborted || isCancel(e)) return
        setLoadError(true)
      })
      .finally(() => {
        if (live && !ctrl.signal.aborted) setLoading(false)
      })
    return () => { live = false; ctrl.abort() }
  }, [retryTick])

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

  const remove = async (id: number, listName: string) => {
    if (!confirm(`Delete broadcast list "${listName}"?`)) return
    try {
      await broadcastApi.remove(id)
      setLists((l) => l.filter((x) => x.id !== id))
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
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

  const toggleMembersRefresh = async (id: number) => {
    setMembers((m) => ({ ...m, [id]: { loading: true, error: false, items: [] } }))
    try {
      const r = await broadcastApi.members(id)
      if (r?.success) {
        setMembers((m) => ({ ...m, [id]: { loading: false, error: false, items: r.data?.members || [] } }))
      } else {
        setMembers((m) => ({ ...m, [id]: { loading: false, error: true, items: [] } }))
      }
    } catch (e: any) {
      if (isCancel(e)) return
      setMembers((m) => ({ ...m, [id]: { loading: false, error: true, items: [] } }))
    }
  }

  const toggleMembers = async (id: number) => {
    const open = !expanded[id]
    setExpanded((e) => ({ ...e, [id]: open }))
    if (!open || members[id]?.items) return
    await toggleMembersRefresh(id)
  }

  const addMember = async (id: number) => {
    const username = (addName[id] || '').trim().replace(/^@/, '')
    if (!username || addingId) return
    setAddingId(id)
    try {
      const r = await broadcastApi.addMember(id, { username })
      if (r?.success) {
        setLists((l) => l.map((x) => (x.id === id ? r.data : x)))
        setAddName((a) => ({ ...a, [id]: '' }))
        setMsg(r?.message || 'Added to list')
        if (expanded[id]) await toggleMembersRefresh(id)
        else setMembers((m) => ({ ...m, [id]: undefined as any }))
      } else {
        setMsg(r?.message || 'Failed')
      }
    } catch (e: any) {
      setMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed')
    } finally {
      setAddingId(null)
    }
  }

  const removeMember = async (id: number, userId: number, username: string) => {
    if (!confirm(`Remove @${username} from this list?`)) return
    try {
      const r = await broadcastApi.removeMember(id, userId)
      if (r?.success) {
        setLists((l) => l.map((x) => (x.id === id ? r.data : x)))
        setMembers((m) => {
          const cur = m[id]
          if (!cur) return m
          return { ...m, [id]: { ...cur, items: cur.items.filter((u: any) => u.id !== userId) } }
        })
        setMsg(r?.message || 'Removed from list')
      } else {
        setMsg(r?.message || 'Failed')
      }
    } catch (e: any) {
      setMsg(e.response?.data?.detail || e.response?.data?.message || 'Failed')
    }
  }

  return (
    <div className="h-full flex flex-col bg-card" role="dialog" aria-label="Broadcast lists">
      <div className="flex items-center justify-between p-4 border-b border-[var(--k-border)] shrink-0">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-primary" aria-hidden="true" />
          Broadcast lists
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setShowCreate((v) => !v)}
            aria-expanded={showCreate}
            aria-label="New broadcast list"
            className="w-11 h-11 rounded-full hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onClose}
            aria-label="Close broadcast lists"
            className="w-11 h-11 rounded-full hover:bg-muted transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {showCreate && (
          <div className="rounded-2xl border border-border p-3 space-y-2 bg-muted/40">
            <label htmlFor="broadcast-name" className="sr-only">List name</label>
            <input
              id="broadcast-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
              placeholder="List name (e.g. Family)"
              maxLength={100}
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm min-h-[44px]"
            />
            <label htmlFor="broadcast-members" className="sr-only">Member usernames</label>
            <input
              id="broadcast-members"
              value={usernames}
              onChange={(e) => setUsernames(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void create() }}
              placeholder="@usernames, comma separated"
              className="w-full px-3 py-2.5 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm min-h-[44px]"
            />
            <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 min-h-[44px]">
              {creating ? 'Creating…' : 'Create list'}
            </button>
          </div>
        )}
        {msg && <p className="text-xs text-center p-1.5 rounded-lg bg-muted">{msg}</p>}
        {loading ? (
          <div aria-label="Loading broadcast lists" aria-busy="true" className="space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-2xl border border-border p-3 space-y-2 animate-pulse">
                <div className="h-3.5 w-1/2 rounded bg-elevated" />
                <div className="h-9 w-full rounded-xl bg-elevated" />
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="py-8 text-center px-8">
            <p className="text-sm font-semibold">Couldn&apos;t load broadcast lists</p>
            <p className="text-xs text-muted-foreground mt-1">Check your connection and try again.</p>
            <button
              onClick={() => setRetryTick((n) => n + 1)}
              className="mt-3 px-4 py-2.5 rounded-xl btn-primary text-sm font-bold min-h-[44px]"
            >
              Retry
            </button>
          </div>
        ) : lists.length === 0 && !showCreate ? (
          <div className="text-center py-8 space-y-2">
            <Megaphone className="w-8 h-8 mx-auto text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-semibold">No broadcast lists yet</p>
            <p className="text-xs text-muted-foreground px-6">
              Message many people at once — each gets it as a private 1-1 chat.
            </p>
          </div>
        ) : (
          lists.map((l) => (
            <div key={l.id} className="rounded-2xl border border-border p-3 space-y-2 bg-muted/40">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate flex items-center gap-1.5 min-w-0">
                  <Users className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <span className="truncate">{l.name}</span>
                </p>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => void toggleMembers(l.id)}
                    aria-expanded={!!expanded[l.id]}
                    aria-label={`${expanded[l.id] ? 'Hide' : 'Show'} members of ${l.name}`}
                    className="text-[11px] text-muted-foreground hover:text-foreground underline-offset-2 hover:underline min-h-[44px] px-1"
                  >
                    {l.member_count ?? (l.member_ids || []).length} people
                  </button>
                  <button
                    onClick={() => void remove(l.id, l.name)}
                    aria-label={`Delete broadcast list ${l.name}`}
                    className="w-11 h-11 rounded-full hover:bg-background text-muted-foreground hover:text-destructive flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {expanded[l.id] && (
                <div className="border-t border-border pt-2 space-y-2">
                  {(() => {
                    const st = members[l.id]
                    if (!st || st.loading) {
                      return <p className="text-xs text-muted-foreground py-1" aria-label="Loading members">Loading…</p>
                    }
                    if (st.error) {
                      return (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-muted-foreground flex-1">Couldn&apos;t load members.</p>
                          <button
                            onClick={() => void toggleMembersRefresh(l.id)}
                            className="px-3 py-2 rounded-xl bg-muted text-xs font-semibold min-h-[44px]"
                          >
                            Retry
                          </button>
                        </div>
                      )
                    }
                    return (
                      <>
                        {st.items.length === 0 ? (
                          <p className="text-xs text-muted-foreground py-1">No members — add one below.</p>
                        ) : (
                          st.items.map((u: any) => (
                            <div key={u.id} className="flex items-center gap-2.5">
                              <span className="w-8 h-8 rounded-full kryzen-accent-gradient text-white flex items-center justify-center text-xs font-bold shrink-0" aria-hidden="true">
                                {(u.display_name || u.username || '?')[0]?.toUpperCase()}
                              </span>
                              <span className="flex-1 min-w-0">
                                <span className="block text-[13px] font-medium truncate">{u.display_name || u.username}</span>
                                <span className="block text-[11px] text-muted-foreground truncate">@{u.username}</span>
                              </span>
                              <button
                                onClick={() => void removeMember(l.id, u.id, u.username)}
                                aria-label={`Remove @${u.username} from ${l.name}`}
                                className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-background hover:text-destructive shrink-0"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))
                        )}
                        <div className="flex gap-2">
                          <label htmlFor={`broadcast-add-${l.id}`} className="sr-only">Add member to {l.name}</label>
                          <input
                            id={`broadcast-add-${l.id}`}
                            value={addName[l.id] || ''}
                            onChange={(e) => setAddName((a) => ({ ...a, [l.id]: e.target.value }))}
                            onKeyDown={(e) => { if (e.key === 'Enter') void addMember(l.id) }}
                            placeholder="@username to add"
                            className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-xs min-h-[44px]"
                          />
                          <button
                            onClick={() => void addMember(l.id)}
                            disabled={addingId === l.id || !(addName[l.id] || '').trim()}
                            className="px-3 rounded-xl bg-muted text-xs font-semibold disabled:opacity-40 shrink-0 min-h-[44px] min-w-[44px]"
                            aria-label={`Add member to ${l.name}`}
                          >
                            {addingId === l.id ? '…' : 'Add'}
                          </button>
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}
              <div className="flex gap-2">
                <label htmlFor={`broadcast-draft-${l.id}`} className="sr-only">Message to {l.name}</label>
                <input
                  id={`broadcast-draft-${l.id}`}
                  value={drafts[l.id] || ''}
                  onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      void send(l.id)
                    }
                  }}
                  placeholder={`Broadcast to ${l.name}…`}
                  maxLength={4000}
                  className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-background border border-transparent focus:border-primary outline-none text-sm min-h-[44px]"
                />
                <button
                  onClick={() => void send(l.id)}
                  disabled={sendingId === l.id || !(drafts[l.id] || '').trim()}
                  className="px-3 rounded-xl bg-primary text-primary-foreground disabled:opacity-40 shrink-0 min-h-[44px] min-w-[44px] flex items-center justify-center"
                  aria-label={`Send broadcast to ${l.name}`}
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
