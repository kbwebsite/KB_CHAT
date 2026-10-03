import { useEffect, useMemo, useState } from 'react'
import {
  Plus,
  X,
  Trash2,
  Users,
  Megaphone,
  UserPlus,
  Minus,
  ChevronRight,
  ChevronDown,
  MoreVertical,
} from 'lucide-react'
import { communityApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { formatTime } from '../utils/format'
import { prettyPreview } from '../utils/messageEffects'

/**
 * Communities — WhatsApp structure:
 * "New community" row, then per-community blocks: community header,
 * Announcements row with date + preview, group rows with circular
 * avatars + date + last-message preview, and "View all".
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
  const [announceOpen, setAnnounceOpen] = useState<Record<number, boolean>>({})
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [menuOpen, setMenuOpen] = useState(false)
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

  const convById = useMemo(() => {
    const m = new Map<number, any>()
    for (const c of conversations || []) m.set(c.id, c)
    return m
  }, [conversations])

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
    setMenuOpen(false)
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

  const fmtDay = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(/z$/i.test(iso) || /[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
    if (isNaN(d.getTime())) return ''
    const now = new Date()
    if (d.toDateString() === now.toDateString()) return formatTime(iso) || 'Today'
    const y = new Date(now)
    y.setDate(now.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return 'Yesterday'
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
  }

  const groupPreview = (g: any) => {
    const conv = convById.get(g.id)
    const last = conv?.last_message
    if (last?.content) {
      const sender = last.sender_username ? `~ ${last.sender_username}: ` : ''
      return `${sender}${prettyPreview(last.content)?.slice(0, 60) || 'Attachment'}`
    }
    return `${g.member_count ?? 0} members`
  }

  const groupDate = (g: any) => {
    const conv = convById.get(g.id)
    return fmtDay(conv?.last_message?.created_at)
  }

  const isExpanded = (id: number) => expanded[id] !== false

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center gap-1 px-2 py-2 border-b border-[var(--k-border)] shrink-0">
        <p className="font-bold text-[17px] flex-1 px-2 tracking-tight">Communities</p>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Communities menu">
            <MoreVertical className="w-5 h-5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-subtle bg-elevated shadow-xl py-1 z-20 text-sm">
                <button
                  onClick={() => { setShowCreate((v) => !v); setMenuOpen(false) }}
                  className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" /> New community
                </button>
              </div>
            </>
          )}
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {showCreate && (
          <div className="m-3 rounded-[18px] bg-elevated border border-subtle p-4 space-y-2.5">
            <p className="text-[15px] font-bold tracking-tight">New community</p>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Community name (e.g. Apartment Block)"
              maxLength={100}
              className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm"
              style={{ background: 'rgba(20,20,42,0.9)', borderColor: 'rgba(255,255,255,0.12)', color: '#f0f0ff', caretColor: '#f0f0ff' }}
            />
            <input
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="Description (optional)"
              maxLength={200}
              className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm"
              style={{ background: 'rgba(20,20,42,0.9)', borderColor: 'rgba(255,255,255,0.12)', color: '#f0f0ff', caretColor: '#f0f0ff' }}
            />
            <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50">
              {creating ? 'Creating…' : 'Create community'}
            </button>
          </div>
        )}

        {msg && <p className="mx-3 mt-2 text-xs text-center p-2 rounded-xl bg-muted">{msg}</p>}

        {/* New community row */}
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="w-full flex items-center gap-3.5 px-4 py-3.5 text-left hover:bg-muted/40 transition-colors"
        >
          <span className="relative shrink-0">
            <span className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
              <Users className="w-6 h-6 text-secondary" />
            </span>
            <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-green-500 flex items-center justify-center ring-2 ring-[var(--bg-card)]">
              <Plus className="w-4 h-4 text-white" />
            </span>
          </span>
          <span className="text-[15px] font-semibold">New community</span>
        </button>

        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-6">Loading…</p>
        ) : lists.length === 0 && !showCreate ? (
          <div className="text-center py-8 space-y-2 px-8">
            <p className="text-sm font-medium">No communities yet</p>
            <p className="text-xs text-muted-foreground">
              Gather related groups under one roof and announce to all of them at once.
            </p>
          </div>
        ) : (
          lists.map((c) => {
            const isOwner = user && c.owner_id === user.id
            const linkedIds = new Set((c.groups || []).map((g: any) => g.id))
            const groups = c.groups || []
            const showAll = expanded[c.id] === true
            const visible = showAll ? groups : groups.slice(0, 3)
            const open = isExpanded(c.id)
            return (
              <div key={c.id} className="border-t border-[var(--k-border)]">
                {/* Community header */}
                <div className="flex items-center gap-3.5 px-4 py-3">
                  <span className="w-12 h-12 rounded-2xl bg-teal-900/60 flex items-center justify-center shrink-0">
                    <Users className="w-6 h-6 text-teal-300" />
                  </span>
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: e[c.id] === false ? true : false }))}
                    className="flex-1 min-w-0 text-left"
                  >
                    <span className="block text-[15px] font-bold truncate tracking-tight">{c.name}</span>
                    {c.description && (
                      <span className="block text-xs text-muted-foreground truncate">{c.description}</span>
                    )}
                  </button>
                  {isOwner && (
                    <button onClick={() => remove(c.id)} className="p-2 rounded-full hover:bg-muted text-tertiary hover:text-destructive shrink-0" aria-label="Delete community">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [c.id]: open ? false : true }))}
                    className="p-1.5 rounded-full hover:bg-muted text-tertiary shrink-0"
                    aria-label={open ? 'Collapse' : 'Expand'}
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
                  </button>
                </div>

                {open && (
                  <>
                    {/* Announcements row */}
                    <button
                      onClick={() => isOwner && setAnnounceOpen((a) => ({ ...a, [c.id]: !a[c.id] }))}
                      className="w-full flex items-center gap-3.5 px-4 py-2.5 text-left hover:bg-muted/40 transition-colors"
                    >
                      <span className="w-12 h-12 rounded-full bg-green-900/70 flex items-center justify-center shrink-0">
                        <Megaphone className="w-5 h-5 text-green-300" />
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="flex items-baseline justify-between gap-2">
                          <span className="text-[15px] font-semibold truncate">Announcements</span>
                          <span className="text-xs text-tertiary shrink-0">{fmtDay(c.created_at) || ''}</span>
                        </span>
                        <span className="block text-[13px] text-muted-foreground truncate">
                          {isOwner ? `Announce to ${groups.length} group${groups.length === 1 ? '' : 's'}` : `${groups.length} group${groups.length === 1 ? '' : 's'}`}
                        </span>
                      </span>
                    </button>

                    {/* Owner announce composer */}
                    {isOwner && announceOpen[c.id] && (
                      <div className="px-4 pb-2 pl-[76px]">
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
                            className="flex-1 min-w-0 px-3.5 py-2 rounded-full border outline-none text-sm"
                            style={{ background: 'rgba(20,20,42,0.9)', borderColor: 'rgba(255,255,255,0.12)', color: '#f0f0ff', caretColor: '#f0f0ff' }}
                          />
                          <button
                            onClick={() => announce(c.id)}
                            disabled={sendingId === c.id || !(drafts[c.id] || '').trim()}
                            className="w-10 h-10 rounded-full btn-primary disabled:opacity-40 shrink-0 flex items-center justify-center"
                            aria-label="Send announcement"
                          >
                            <Megaphone className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Group rows */}
                    {groups.length === 0 && (
                      <p className="px-4 pl-[76px] py-1.5 text-[13px] text-muted-foreground">No groups linked yet.</p>
                    )}
                    {visible.map((g: any) => {
                      const conv = convById.get(g.id)
                      const avatar = g.avatar_url || conv?.avatar_url
                      return (
                        <div key={g.id} className="flex items-center gap-0.5 pl-4 pr-2">
                          <button
                            onClick={() => onOpenChat(g.id)}
                            className="flex-1 min-w-0 flex items-center gap-3.5 py-2.5 text-left hover:bg-muted/40 rounded-xl px-0 transition-colors"
                          >
                            {avatar ? (
                              <img src={avatar} alt="" className="w-12 h-12 rounded-full object-cover shrink-0" loading="lazy" />
                            ) : (
                              <span className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold shrink-0">
                                {(g.title || '?')[0].toUpperCase()}
                              </span>
                            )}
                            <span className="flex-1 min-w-0">
                              <span className="flex items-baseline justify-between gap-2">
                                <span className="text-[15px] font-medium truncate">{g.title || 'Group'}</span>
                                <span className="text-xs text-tertiary shrink-0">{groupDate(g)}</span>
                              </span>
                              <span className="block text-[13px] text-muted-foreground truncate">{groupPreview(g)}</span>
                            </span>
                          </button>
                          {isOwner && (
                            <button
                              onClick={() => removeGroup(c.id, g.id)}
                              className="p-2 rounded-full hover:bg-muted text-tertiary hover:text-destructive shrink-0"
                              aria-label="Unlink group"
                            >
                              <Minus className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {/* View all */}
                    {groups.length > 3 && (
                      <button
                        onClick={() => setExpanded((e) => ({ ...e, [c.id]: !showAll }))}
                        className="w-full flex items-center gap-3.5 px-4 py-2.5 text-muted-foreground hover:bg-muted/40 transition-colors"
                      >
                        <ChevronRight className="w-5 h-5 ml-3.5 shrink-0" />
                        <span className="text-[14px] font-medium">{showAll ? 'Show less' : 'View all'}</span>
                      </button>
                    )}

                    {/* Owner: add group */}
                    {isOwner && (
                      <div className="px-4 pb-3 pl-[76px]">
                        {addingTo === c.id ? (
                          <div className="rounded-xl border border-subtle bg-elevated p-2 space-y-1 max-h-44 overflow-y-auto">
                            {myGroups.filter((g: any) => !linkedIds.has(g.id)).length === 0 && (
                              <p className="text-xs text-muted-foreground px-2 py-1">All your groups are linked.</p>
                            )}
                            {myGroups
                              .filter((g: any) => !linkedIds.has(g.id))
                              .map((g: any) => (
                                <button
                                  key={g.id}
                                  onClick={() => addGroup(c.id, g.id)}
                                  className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-[13px] flex items-center gap-2"
                                >
                                  <UserPlus className="w-4 h-4 text-primary shrink-0" />
                                  <span className="truncate">{g.title || 'Group'}</span>
                                </button>
                              ))}
                            <button onClick={() => setAddingTo(null)} className="w-full text-center text-xs text-muted-foreground py-1">
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingTo(c.id)}
                            className="text-[13px] text-secondary hover:text-primary flex items-center gap-1.5 py-1"
                          >
                            <UserPlus className="w-4 h-4" /> Add one of your groups
                          </button>
                        )}
                      </div>
                    )}
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
