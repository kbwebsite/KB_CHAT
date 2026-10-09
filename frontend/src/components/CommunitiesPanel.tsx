import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  X,
  Trash2,
  Users,
  Megaphone,
  UserPlus,
  Minus,
  ChevronRight,
  MoreVertical,
  Search,
  Network,
  Flame,
  Sparkles,
  Send,
  ArrowLeft,
} from 'lucide-react'
import { communityApi } from '../services/api'
import { useAuthStore } from '../store/auth'
import { formatTime, compactPlural, plural } from '../utils/format'
import { prettyPreview } from '../utils/messageEffects'

/**
 * Communities — clubhouse-style social hub. Visually distinct from
 * Channels: warm member-centric identity, community home with
 * Home | Groups | Members | About tabs. Same backend, new presentation.
 */

const COVERS = [
  ['#0d9488', '#22d3ee'],
  ['#059669', '#34d399'],
  ['#0ea5e9', '#10b981'],
  ['#65a30d', '#14b8a6'],
  ['#0284c7', '#2dd4bf'],
  ['#16a34a', '#a3e635'],
]

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
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<'discover' | 'mine'>('discover')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [detailTab, setDetailTab] = useState<'home' | 'groups' | 'members' | 'about'>('home')
  const [menuOpen, setMenuOpen] = useState(false)
  const [drafts, setDrafts] = useState<Record<number, string>>({})
  const [sendingId, setSendingId] = useState<number | null>(null)
  const announceRefs = useRef<Record<number, HTMLTextAreaElement | null>>({})
  const [addingTo, setAddingTo] = useState<number | null>(null)
  const [announceOpen, setAnnounceOpen] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  // Create wizard
  const [wizard, setWizard] = useState<null | { step: number; name: string; desc: string }>(null)
  const [creating, setCreating] = useState(false)

  const fieldStyle = {
    background: 'rgba(20,20,42,0.9)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#f0f0ff',
    caretColor: '#f0f0ff',
  } as const

  const load = () => {
    setLoading(true)
    setLoadError(false)
    communityApi
      .list()
      .then((r: any) => {
        if (r?.success) setLists(r.data || [])
        else setLoadError(true)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const convById = useMemo(() => {
    const m = new Map<number, any>()
    for (const c of conversations || []) m.set(c.id, c)
    return m
  }, [conversations])

  const avatarLetter = (n: string) => (n || '?')[0].toUpperCase()
  const coverOf = (id: number) => COVERS[Math.abs(id) % COVERS.length]

  const groupConv = (gid: number) => convById.get(gid)
  const groupMembers = (gid: number): any[] => groupConv(gid)?.members || []
  const onlineCount = (gid: number) => groupMembers(gid).filter((m: any) => m.is_online).length

  const communityStats = (c: any) => {
    const groups = c.groups || []
    let members = 0
    let online = 0
    for (const g of groups) {
      members += g.member_count ?? groupMembers(g.id).length
      online += onlineCount(g.id)
    }
    return { groups: groups.length, members, online }
  }

  const communityMembers = (c: any) => {
    const map = new Map<number, any>()
    for (const g of c.groups || []) {
      for (const m of groupMembers(g.id)) {
        if (m?.user_id != null && !map.has(m.user_id)) map.set(m.user_id, m)
      }
    }
    return [...map.values()]
  }

  const communityActivity = (c: any) => {
    const items: { conv: any; last: any }[] = []
    for (const g of c.groups || []) {
      const conv = groupConv(g.id)
      if (conv?.last_message) items.push({ conv, last: conv.last_message })
    }
    return items
      .sort((a, b) => String(b.last.created_at || '').localeCompare(String(a.last.created_at || '')))
      .slice(0, 5)
  }

  const create = async () => {
    const name = (wizard?.name || '').trim()
    if (!name) return setMsg('Name your community first')
    setCreating(true)
    try {
      const r = await communityApi.create({ name, description: (wizard?.desc || '').trim() || undefined })
      if (r?.success) {
        setLists((l) => [r.data, ...l])
        setWizard(null)
        setMsg('Community created — add your groups to bring it alive')
        setOpenId(r.data.id)
        setDetailTab('groups')
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
      if (openId === id) setOpenId(null)
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
        // Reset after React commits the empty value (stale DOM otherwise).
        requestAnimationFrame(() => {
          const ta = announceRefs.current[id]
          if (ta) ta.style.height = 'auto'
        })
        setAnnounceOpen(false)
        setMsg(`Announced to ${plural(r.data?.reached?.length ?? 0, 'group')}`)
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
    const last = groupConv(g.id)?.last_message
    if (last?.content) {
      const sender = last.sender_username ? `~ ${last.sender_username}: ` : ''
      return `${sender}${prettyPreview(last.content)?.slice(0, 60) || 'Attachment'}`
    }
    return `${compactPlural(g.member_count ?? 0, 'member')}`
  }

  const openCommunity = (c: any) => {
    setOpenId(c.id)
    setDetailTab('home')
    setMenuOpen(false)
    setAnnounceOpen(false)
    setAddingTo(null)
  }

  /* ── Derived discovery (real data only) ── */
  const q = query.trim().toLowerCase()
  const searched = q
    ? lists.filter(
        (c: any) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      )
    : null
  const mine = lists.filter((c: any) => user && c.owner_id === user.id)
  const trending = useMemo(
    () => [...lists].sort((a, b) => communityStats(b).members - communityStats(a).members).slice(0, 3),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lists, conversations]
  )
  const trendingIds = new Set(trending.map((c: any) => c.id))
  // Directory lists only what Trending doesn't, so small datasets
  // never render the same card twice on one screen.
  const restLists = lists.filter((c: any) => !trendingIds.has(c.id))
  const openCommunityData = lists.find((c) => c.id === openId)

  const memberCluster = (members: any[], max = 4) => {
    const shown = members.slice(0, max)
    return (
      <span className="flex shrink-0" aria-hidden>
        {shown.map((m: any, i: number) => (
          <span
            key={m.user_id}
            style={{ zIndex: shown.length - i, marginLeft: i === 0 ? 0 : -8 }}
            className="w-6 h-6 rounded-full bg-muted border-2 border-[var(--bg-card)] flex items-center justify-center text-[10px] font-bold overflow-hidden shrink-0"
          >
            {m.avatar_url ? (
              <img src={m.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
            ) : (
              (m.display_name || m.username || '?')[0].toUpperCase()
            )}
          </span>
        ))}
      </span>
    )
  }

  /* ═══════════ DETAIL VIEW ═══════════ */
  if (openCommunityData) {
    const c = openCommunityData
    const isOwner = user && c.owner_id === user.id
    const st = communityStats(c)
    const members = communityMembers(c)
    const onlineMembers = members.filter((m: any) => m.is_online)
    const activity = communityActivity(c)
    const [c1, c2] = coverOf(c.id)
    const linkedIds = new Set((c.groups || []).map((g: any) => g.id))

    return (
      <div className="h-full flex flex-col bg-card">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--k-border)] shrink-0">
          <button onClick={() => setOpenId(null)} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Back to communities">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <p className="font-semibold text-[15px] flex-1 truncate">Community</p>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Community menu">
              <MoreVertical className="w-5 h-5" />
            </button>
            {menuOpen && isOwner && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-card kryzen-dropdown-glass shadow-2xl py-1 z-30 text-sm text-foreground overflow-hidden">
                  <button onClick={() => remove(c.id)} className="w-full text-left px-3 py-2 hover:bg-muted text-destructive flex items-center gap-2">
                    <Trash2 className="w-4 h-4" /> Delete community
                  </button>
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0 pb-4">
          {/* Clubhouse header */}
          <div className="m-3 rounded-[24px] overflow-hidden border border-subtle" style={{ background: 'linear-gradient(180deg, rgba(16,40,38,0.98), rgba(10,18,26,0.98))', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(120deg, ${c1}, ${c2})` }}>
              <span className="absolute -right-1 -bottom-6 text-[80px] leading-none font-extrabold text-white/10 select-none">
                <Users className="w-16 h-16" />
              </span>
              <div className="absolute w-36 h-36 rounded-full bg-white/10 blur-2xl -left-8 -top-14" />
            </div>
            <div className="px-4 pt-2.5 pb-3.5">
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg shrink-0 ring-2 ring-white/10" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
                  <Users className="w-7 h-7 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[17px] tracking-tight truncate">{c.name}</p>
                  <p className="text-[13px] text-secondary mt-0.5 truncate">{c.description || 'No description yet'}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 mt-3">
                {members.length > 0 && memberCluster(members)}
                <p className="text-[11px] text-tertiary">
                  {compactPlural(st.groups, 'group')} · {compactPlural(st.members, 'member')}
                  {st.online > 0 && <span className="text-emerald-400 font-semibold"> · {compactPlural(st.online, 'member')} online</span>}
                </p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="mx-3 mb-2 flex rounded-full bg-elevated border border-subtle p-1">
            {(['home', 'groups', 'members', 'about'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setDetailTab(t)}
                className={`flex-1 py-1.5 min-h-[44px] rounded-full text-[13px] font-semibold capitalize transition-all ${
                  detailTab === t ? 'bg-emerald-500/20 text-emerald-300 shadow' : 'text-tertiary'
                }`}
              >
                {t}
              </button>
            ))}
          </div>

          {msg && <p className="px-4 pt-1 text-xs text-muted-foreground">{msg}</p>}

          {detailTab === 'home' && (
            <div className="px-3 space-y-4 pt-1">
              {/* Announcements */}
              <section>
                <div className="flex items-center gap-1.5 px-1 pb-2">
                  <Megaphone className="w-3.5 h-3.5 text-emerald-400" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Announcements</p>
                </div>
                {isOwner ? (
                  announceOpen ? (
                    <div className="rounded-2xl bg-elevated border border-subtle p-2.5">
                      <div className="flex gap-2">
                        <textarea
                          autoFocus
                          ref={(el) => { announceRefs.current[c.id] = el }}
                          value={drafts[c.id] || ''}
                          rows={1}
                          onChange={(e) => {
                            setDrafts((d) => ({ ...d, [c.id]: e.target.value }))
                            const el = e.target
                            el.style.height = 'auto'
                            el.style.height = Math.min(el.scrollHeight, 128) + 'px'
                          }}
                          onKeyDown={(e) => {
                            if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                              e.preventDefault()
                              announce(c.id)
                            }
                          }}
                          placeholder={`Announce to ${c.name}… (Enter for new line)`}
                          maxLength={2000}
                          className="flex-1 min-w-0 px-3.5 py-2 rounded-2xl border outline-none text-sm resize-none max-h-32 overflow-y-auto"
                          style={fieldStyle}
                          aria-label="Write an announcement"
                        />
                        <button
                          onClick={() => announce(c.id)}
                          disabled={sendingId === c.id || !(drafts[c.id] || '').trim()}
                          className="w-10 h-10 rounded-full bg-emerald-500 text-white disabled:opacity-40 shrink-0 flex items-center justify-center transition-all active:scale-95 touch-44"
                          aria-label="Send announcement"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                      </div>
                      <button onClick={() => setAnnounceOpen(false)} className="w-full text-center text-xs text-muted-foreground py-1.5">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAnnounceOpen(true)}
                      className="w-full rounded-2xl bg-elevated border border-dashed border-subtle p-3.5 text-sm text-secondary hover:border-emerald-500/40 transition-colors flex items-center justify-center gap-2"
                    >
                      <Megaphone className="w-4 h-4 text-emerald-400" /> Announce to {compactPlural(st.groups, 'group')}
                    </button>
                  )
                ) : (
                  <p className="text-xs text-muted-foreground px-1">Owner announcements land in every group at once.</p>
                )}
              </section>

              {/* Activity */}
              <section>
                <div className="flex items-center gap-1.5 px-1 pb-2">
                  <Flame className="w-3.5 h-3.5 text-emerald-400" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Recent activity</p>
                </div>
                {activity.length === 0 ? (
                  <p className="text-xs text-muted-foreground px-1">Quiet for now — activity shows up here.</p>
                ) : (
                  <div className="rounded-2xl bg-elevated border border-subtle divide-y divide-[var(--k-border)]/40">
                    {activity.map(({ conv, last }: any) => (
                      <button key={last.id} onClick={() => onOpenChat(conv.id)} className="w-full text-left px-3.5 py-2.5 hover:bg-muted/40 transition-colors first:rounded-t-2xl last:rounded-b-2xl">
                        <p className="text-[13px] font-semibold truncate">
                          {conv.title || 'Group'} <span className="font-normal text-tertiary">· {fmtDay(last.created_at)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {last.sender_username ? `~ ${last.sender_username}: ` : ''}{prettyPreview(last.content)?.slice(0, 70) || 'Attachment'}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* Popular */}
              {st.groups > 0 && (
                <section>
                  <div className="flex items-center gap-1.5 px-1 pb-2">
                    <Users className="w-3.5 h-3.5 text-emerald-400" />
                    <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Popular groups</p>
                  </div>
                  <div className="space-y-2">
                    {(c.groups || []).slice(0, 3).map((g: any) => (
                      <GroupRow key={g.id} g={g} isOwner={!!isOwner} />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}

          {detailTab === 'groups' && (
            <div className="px-3 pt-1 space-y-2">
              {(c.groups || []).length === 0 && (
                <p className="text-[13px] text-muted-foreground text-center py-4">No groups linked yet.</p>
              )}
              {(c.groups || []).map((g: any) => (
                <GroupRow key={g.id} g={g} isOwner={!!isOwner} />
              ))}
              {isOwner && (
                <div className="pt-1">
                  {addingTo === c.id ? (
                    <div className="rounded-2xl border border-subtle bg-elevated p-2 space-y-1 max-h-44 overflow-y-auto">
                      {myGroups.filter((g: any) => ![...linkedIds].includes(g.id)).length === 0 && (
                        <p className="text-xs text-muted-foreground px-2 py-1">All your groups are linked.</p>
                      )}
                      {myGroups
                        .filter((g: any) => ![...linkedIds].includes(g.id))
                        .map((g: any) => (
                          <button
                            key={g.id}
                            onClick={() => addGroup(c.id, g.id)}
                            className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-muted text-[13px] flex items-center gap-2"
                          >
                            <UserPlus className="w-4 h-4 text-emerald-400 shrink-0" />
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
                      className="w-full py-2.5 rounded-2xl bg-elevated border border-dashed border-subtle text-[13px] text-secondary hover:border-emerald-500/40 transition-colors flex items-center justify-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4 text-emerald-400" /> Add one of your groups
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {detailTab === 'members' && (
            <div className="px-3 pt-1">
              {members.length === 0 ? (
                <p className="text-[13px] text-muted-foreground text-center py-4">No member info yet — open a group to sync its roster.</p>
              ) : (
                <>
                  {onlineMembers.length > 0 && (
                    <div className="mb-3">
                      <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">
                        Online now · {onlineMembers.length}
                      </p>
                      <div className="rounded-2xl bg-elevated border border-subtle divide-y divide-[var(--k-border)]/40">
                        {onlineMembers.slice(0, 10).map((m: any) => (
                          <MemberRow key={m.user_id} m={m} />
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">
                    All members · {members.length}
                  </p>
                  <div className="rounded-2xl bg-elevated border border-subtle divide-y divide-[var(--k-border)]/40">
                    {members.slice(0, 30).map((m: any) => (
                      <MemberRow key={m.user_id} m={m} />
                    ))}
                  </div>
                  {members.length > 30 && (
                    <p className="text-xs text-tertiary text-center py-2">+ {members.length - 30} more</p>
                  )}
                </>
              )}
            </div>
          )}

          {detailTab === 'about' && (
            <div className="m-3 rounded-[20px] bg-elevated border border-subtle p-4 space-y-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">About</p>
                <p className="text-sm text-secondary mt-1 leading-relaxed">{c.description || 'No description yet.'}</p>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {[
                  [String(st.groups), 'Groups'],
                  [String(st.members), 'Members'],
                  [String(st.online), 'Online'],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-xl bg-card border border-subtle p-2.5">
                    <p className="text-sm font-bold">{v}</p>
                    <p className="text-[11px] text-tertiary">{l}</p>
                  </div>
                ))}
              </div>
              {isOwner && (
                <button onClick={() => remove(c.id)} className="w-full py-2.5 rounded-xl border border-destructive/30 text-destructive text-sm font-medium hover:bg-destructive/10 transition-colors">
                  Delete community
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    )

    /* ── Group + member rows (detail) ── */
    function GroupRow({ g, isOwner }: { g: any; isOwner: boolean }) {
      const conv = groupConv(g.id)
      const avatar = g.avatar_url || conv?.avatar_url
      const online = onlineCount(g.id)
      return (
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => onOpenChat(g.id)}
            className="flex-1 min-w-0 flex items-center gap-3 rounded-2xl bg-elevated border border-subtle p-2.5 text-left transition-all hover:border-emerald-500/30 active:scale-[0.99]"
          >
            {avatar ? (
              <img src={avatar} alt="" className="w-11 h-11 rounded-full object-cover shrink-0" loading="lazy" />
            ) : (
              <span className="w-11 h-11 rounded-full bg-muted flex items-center justify-center text-base font-bold shrink-0">
                {(g.title || '?')[0].toUpperCase()}
              </span>
            )}
            <span className="flex-1 min-w-0">
              <span className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-semibold truncate">{g.title || 'Group'}</span>
                <span className="text-xs text-tertiary shrink-0">{fmtDay(conv?.last_message?.created_at)}</span>
              </span>
              <span className="block text-[13px] text-muted-foreground truncate mt-px">{groupPreview(g)}</span>
              <span className="block text-[11px] text-tertiary mt-px">
                {compactPlural(g.member_count ?? 0, 'member')}{online > 0 && <span className="text-emerald-400 font-semibold"> · {compactPlural(online, 'member')} online</span>}
              </span>
            </span>
          </button>
          {isOwner && (
            <button
              onClick={() => removeGroup(c.id, g.id)}
              className="p-2 rounded-full hover:bg-muted text-tertiary hover:text-destructive shrink-0 transition-all active:scale-90 touch-44"
              aria-label="Unlink group"
            >
              <Minus className="w-4 h-4" />
            </button>
          )}
        </div>
      )
    }

    function MemberRow({ m }: { m: any }) {
      return (
        <div className="flex items-center gap-2.5 px-3.5 py-2">
          <span className="relative shrink-0">
            <span className="w-9 h-9 rounded-full bg-muted flex items-center justify-center text-sm font-bold overflow-hidden block">
              {m.avatar_url ? (
                <img src={m.avatar_url} alt="" className="w-full h-full object-cover" loading="lazy" />
              ) : (
                (m.display_name || m.username || '?')[0].toUpperCase()
              )}
            </span>
            {m.is_online && (
              <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[var(--bg-card)]" />
            )}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-medium truncate">{m.display_name || m.username}</span>
            {m.username && m.display_name !== m.username && (
              <span className="block text-xs text-muted-foreground truncate">@{m.username}</span>
            )}
          </span>
        </div>
      )
    }
  }

  /* ═══════════ LIST VIEW ═══════════ */
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-[var(--k-border)] shrink-0">
        <p className="font-bold text-[17px] flex-1 px-2 tracking-tight flex items-center gap-1.5">
          <Network className="w-4 h-4 text-emerald-400" /> Communities
          {lists.length > 0 && (
            <span className="text-xs font-semibold text-tertiary align-middle">{lists.length}</span>
          )}
        </p>
        <button onClick={() => setWizard(wizard ? null : { step: 1, name: '', desc: '' })} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="New community">
          <Plus className="w-5 h-5" />
        </button>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-3 pt-2.5 shrink-0">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-elevated border border-subtle focus-within:border-emerald-500/50 transition-colors">
          <Search className="w-4 h-4 text-tertiary shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search communities…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            style={{ color: '#f0f0ff' }}
            aria-label="Search communities"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-0.5 rounded-full hover:bg-muted touch-44" aria-label="Clear search">
              <X className="w-3.5 h-3.5 text-tertiary" />
            </button>
          )}
        </div>
        {!q && (
          <div className="flex rounded-full bg-elevated border border-subtle p-1 mt-2.5">
            {(['discover', 'mine'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 min-h-[44px] rounded-full text-[13px] font-semibold capitalize transition-all ${
                  tab === t ? 'bg-emerald-500/20 text-emerald-300 shadow' : 'text-tertiary'
                }`}
              >
                {t}
                {t === 'mine' && mine.length > 0 && (
                  <span className="ml-1.5 text-[11px] opacity-80">{mine.length}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {msg && <p className="px-4 pt-1.5 text-xs text-muted-foreground shrink-0">{msg}</p>}

      <div className="flex-1 overflow-y-auto min-h-0 pb-4">
        {loading ? (
          <div className="px-3 py-3 space-y-3">
            {[0, 1].map((i) => (
              <div key={i} className="rounded-[22px] overflow-hidden border border-subtle animate-pulse">
                <div className="h-20 bg-muted" />
                <div className="p-3.5 space-y-2">
                  <div className="h-4 w-2/3 rounded bg-muted" />
                  <div className="h-3 w-1/3 rounded bg-muted" />
                </div>
              </div>
            ))}
          </div>
        ) : loadError ? (
          <div className="py-12 text-center px-8">
            <div className="w-16 h-16 rounded-[22px] bg-elevated border border-subtle flex items-center justify-center mx-auto">
              <Search className="w-7 h-7 text-tertiary" />
            </div>
            <p className="text-[16px] font-bold mt-4 tracking-tight">Couldn&apos;t load communities</p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-[240px] mx-auto">
              Check your connection and try again — nothing was lost.
            </p>
            <button onClick={load} className="mt-4 px-5 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold shadow-lg transition-all active:scale-95">
              Retry
            </button>
          </div>
        ) : lists.length === 0 ? (
          <div className="py-10 text-center px-8">
            <div className="w-16 h-16 rounded-[22px] flex items-center justify-center mx-auto shadow-lg" style={{ background: 'linear-gradient(135deg, #0d9488, #22d3ee)' }}>
              <Network className="w-7 h-7 text-white" />
            </div>
            <p className="text-[16px] font-bold mt-4 tracking-tight">Find your people</p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-[240px] mx-auto">
              Join communities built around the things you care about.
            </p>
            <button onClick={() => setWizard({ step: 1, name: '', desc: '' })} className="mt-4 px-5 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold shadow-lg transition-all active:scale-95">
              Start a community
            </button>
          </div>
        ) : searched ? (
          <div className="px-3 pt-2">
            {searched.length === 0 ? (
              <div className="py-10 text-center px-8">
                <p className="text-[15px] font-semibold">Nothing matches “{query}”</p>
                <p className="text-[13px] text-muted-foreground mt-1">Try a different search — or start the community yourself.</p>
                <button onClick={() => { setWizard({ step: 1, name: query, desc: '' }); setQuery('') }} className="mt-4 px-5 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-95">
                  Create “{query.trim().slice(0, 24)}”
                </button>
              </div>
            ) : (
              searched.map((c: any) => <CommunityCard key={c.id} c={c} />)
            )}
          </div>
        ) : tab === 'mine' ? (
          <div className="px-3 pt-2 space-y-3">
            {mine.length === 0 ? (
              <div className="py-10 text-center px-8">
                <p className="text-[15px] font-semibold">You own no communities yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">Communities you create will live here.</p>
                <button onClick={() => setWizard({ step: 1, name: '', desc: '' })} className="mt-4 px-5 py-2.5 rounded-full bg-emerald-500 text-white text-sm font-semibold transition-all active:scale-95">
                  Create one
                </button>
              </div>
            ) : (
              mine.map((c: any) => <CommunityCard key={c.id} c={c} />)
            )}
          </div>
        ) : (
          <div className="pt-3 space-y-5">
            <button
              onClick={() => setWizard({ step: 1, name: '', desc: '' })}
              className="mx-3 w-[calc(100%-24px)] flex items-center gap-3.5 rounded-2xl border border-dashed border-subtle p-3 text-left transition-all hover:border-emerald-500/40 active:scale-[0.99]"
            >
              <span className="relative shrink-0">
                <span className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center block">
                  <Users className="w-6 h-6 text-secondary" />
                </span>
                <span className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center ring-2 ring-[var(--bg-card)]">
                  <Plus className="w-4 h-4 text-white" />
                </span>
              </span>
              <span className="text-[15px] font-semibold">New community</span>
            </button>
            {trending.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 px-4 pb-2">
                  <Flame className="w-3.5 h-3.5 text-emerald-400" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Trending</p>
                </div>
                <div className="px-3 space-y-3">
                  {trending.map((c: any) => <CommunityCard key={c.id} c={c} />)}
                </div>
              </section>
            )}
            {restLists.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 px-4 pb-2">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">All communities</p>
              </div>
              <div className="px-3 space-y-3">
                {restLists.map((c: any) => <CommunityCard key={c.id} c={c} />)}
              </div>
            </section>
            )}
          </div>
        )}
      </div>

      {/* Create wizard */}
      {wizard && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => !creating && setWizard(null)}>
          <div className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 animate-slide-up max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <p className="font-bold text-[17px] tracking-tight">New community</p>
              <button onClick={() => !creating && setWizard(null)} className="p-2 rounded-full hover:bg-muted touch-44" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              {[1, 2, 3].map((s) => (
                <span key={s} className={`h-1 flex-1 rounded-full transition-all ${wizard.step >= s ? 'bg-emerald-500' : 'bg-muted'}`} />
              ))}
            </div>
            <p className="text-xs text-tertiary font-semibold uppercase tracking-wider mb-2">
              {wizard.step === 1 ? '01 · Identity' : wizard.step === 2 ? '02 · Details' : '03 · Review'}
            </p>
            {wizard.step === 1 && (
              <div className="flex items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/20 flex items-center justify-center shrink-0">
                  <Users className="w-7 h-7 text-emerald-400" />
                </div>
                <input
                  autoFocus
                  value={wizard.name}
                  onChange={(e) => setWizard({ ...wizard, name: e.target.value })}
                  onKeyDown={(e) => { if (e.key === 'Enter' && wizard.name.trim()) setWizard({ ...wizard, step: 2 }) }}
                  placeholder="Community name (e.g. Apartment Block)"
                  maxLength={100}
                  className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border outline-none text-sm"
                  style={fieldStyle}
                />
              </div>
            )}
            {wizard.step === 2 && (
              <input
                autoFocus
                value={wizard.desc}
                onChange={(e) => setWizard({ ...wizard, desc: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') setWizard({ ...wizard, step: 3 }) }}
                placeholder="What is this community about?"
                maxLength={500}
                className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm"
                style={fieldStyle}
              />
            )}
            {wizard.step === 3 && (
              <div className="rounded-2xl bg-elevated border border-subtle p-4">
                <p className="font-bold">{wizard.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{wizard.desc || 'No description'}</p>
                <p className="text-[11px] text-tertiary mt-1.5">Umbrella over groups · you announce to all at once</p>
              </div>
            )}
            <div className="flex gap-2 mt-4">
              {wizard.step > 1 && (
                <button onClick={() => setWizard({ ...wizard, step: wizard.step - 1 })} disabled={creating} className="px-4 py-2.5 rounded-xl bg-muted text-sm font-medium disabled:opacity-50">
                  Back
                </button>
              )}
              {wizard.step < 3 ? (
                <button
                  onClick={() => wizard.name.trim() && setWizard({ ...wizard, step: wizard.step + 1 })}
                  disabled={!wizard.name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  Continue
                </button>
              ) : (
                <button onClick={create} disabled={creating} className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create community'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  /* ── Shared community card ── */
  function CommunityCard({ c }: { c: any }) {
    const st = communityStats(c)
    const members = communityMembers(c)
    const [c1, c2] = coverOf(c.id)
    return (
      <div
        onClick={() => openCommunity(c)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openCommunity(c) } }}
        aria-label={`Open ${c.name}`}
        className="rounded-[22px] overflow-hidden border border-subtle cursor-pointer transition-all hover:border-emerald-500/30 active:scale-[0.99]"
        style={{ background: 'linear-gradient(180deg, rgba(20,38,36,0.98), rgba(12,20,28,0.98))', boxShadow: '0 8px 28px rgba(0,0,0,0.45)' }}
      >
        <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(120deg, ${c1}, ${c2})` }}>
          <Users className="absolute -right-2 -bottom-5 w-24 h-24 text-white/10" />
        </div>
        <div className="p-3.5">
          <div className="flex items-center gap-2.5 -mt-9 mb-2">
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg ring-2 ring-[var(--bg-card)] shrink-0" style={{ background: `linear-gradient(135deg, ${c1}, ${c2})` }}>
              <Users className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1 min-w-0 pt-7">
              <p className="text-[15px] font-bold truncate tracking-tight">{c.name}</p>
            </div>
            <ChevronRight className="w-4 h-4 text-tertiary shrink-0 mt-7" />
          </div>
          {c.description
            ? <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-8">{c.description}</p>
            : <p className="text-xs text-tertiary italic min-h-8">No description</p>}
          <div className="flex items-center justify-between gap-2 mt-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              {members.length > 0 && memberCluster(members)}
              <p className="text-[11px] text-tertiary truncate">
                {compactPlural(st.members, 'member')}{st.online > 0 && <span className="text-emerald-400 font-semibold"> · {compactPlural(st.online, 'member')} online</span>}
              </p>
            </div>
            <p className="text-[11px] text-tertiary shrink-0">{compactPlural(st.groups, 'group')}</p>
          </div>
        </div>
      </div>
    )
  }
}
