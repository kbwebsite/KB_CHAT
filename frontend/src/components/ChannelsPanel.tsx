import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Send,
  Trash2,
  X,
  Check,
  ArrowLeft,
  BadgeCheck,
  BellOff,
  Bell,
  Link2,
  MoreVertical,
  Search,
  Smile,
  Paperclip,
  Camera,
  Mic,
  Forward,
  ChevronRight,
  Sparkles,
  Flame,
  Compass,
} from 'lucide-react'
import { channelApi, uploadApi } from '../services/api'
import { compact, compactPlural } from '../utils/format'

/**
 * Channels — discovery-first creator experience.
 * Discover (Featured / Trending / All + search) → Follow → Consume.
 * Same backend, same flows — new presentation only.
 */

const COVERS = [
  ['#7c5cfc', '#22d3ee'],
  ['#a855f7', '#f472b6'],
  ['#0ea5e9', '#6366f1'],
  ['#f43f5e', '#f59e0b'],
  ['#10b981', '#06b6d4'],
  ['#8b5cf6', '#ec4899'],
  ['#06b6d4', '#3b82f6'],
  ['#f59e0b', '#ef4444'],
]

const MUTE_KEY = 'kb_channel_muted'

function readMuted(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(MUTE_KEY)
    const m = raw ? JSON.parse(raw) : {}
    return m && typeof m === 'object' ? m : {}
  } catch {
    return {}
  }
}

export function ChannelsPanel({ onClose }: { onClose: () => void }) {
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [tab, setTab] = useState<'discover' | 'following'>('discover')
  const [query, setQuery] = useState('')
  const [openId, setOpenId] = useState<number | null>(null)
  const [profileTab, setProfileTab] = useState<'posts' | 'media' | 'about'>('posts')
  const [posts, setPosts] = useState<any[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showJump, setShowJump] = useState(false)
  const [mutedMap, setMutedMap] = useState<Record<string, boolean>>(readMuted)
  // Create wizard
  const [wizard, setWizard] = useState<null | { step: number; name: string; desc: string }>(null)
  const [creating, setCreating] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fieldStyle = {
    background: 'rgba(20,20,42,0.9)',
    borderColor: 'rgba(255,255,255,0.12)',
    color: '#f0f0ff',
    caretColor: '#f0f0ff',
  } as const

  const focusComposer = () => {
    composerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    setTimeout(() => composerRef.current?.focus({ preventScroll: true }), 250)
  }

  const autogrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 128) + 'px'
  }

  // Collapse the composer once React commits a cleared draft. A direct
  // reset inside post() measures the stale pre-commit DOM under
  // concurrent rendering, leaving the box stuck tall.
  useEffect(() => {
    if (draft === '') autogrow(composerRef.current)
  }, [draft])

  const load = () => {
    setLoading(true)
    setLoadError(false)
    channelApi
      .list()
      .then((r: any) => {
        if (r?.success) setChannels(r.data || [])
        else setLoadError(true)
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const toggleMute = (id: number) => {
    setMutedMap((m) => {
      const next = { ...m, [id]: !m[id] }
      if (!next[id]) delete next[id]
      try {
        localStorage.setItem(MUTE_KEY, JSON.stringify(next))
      } catch {}
      return next
    })
  }

  const refreshOne = async (id: number) => {
    try {
      const r = await channelApi.list()
      if (r?.success) {
        const found = (r.data || []).find((c: any) => c.id === id)
        if (found) setChannels((l) => l.map((x) => (x.id === id ? found : x)))
      }
    } catch {}
  }

  const create = async () => {
    const name = (wizard?.name || '').trim()
    if (!name) return setMsg('Name your channel first')
    setCreating(true)
    try {
      const r = await channelApi.create({ name, description: (wizard?.desc || '').trim() || undefined })
      if (r?.success) {
        setChannels((l) => [r.data, ...l])
        setWizard(null)
        setMsg('Channel created')
        setTab('following')
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setCreating(false)
    }
  }

  const remove = async (id: number) => {
    if (!confirm('Delete this channel? Its posts go with it.')) return
    try {
      await channelApi.remove(id)
      setChannels((l) => l.filter((x) => x.id !== id))
      if (openId === id) {
        setOpenId(null)
        setPosts([])
      }
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Failed')
    }
    setMenuOpen(false)
  }

  const follow = async (id: number, on: boolean) => {
    try {
      const r = on ? await channelApi.follow(id) : await channelApi.unfollow(id)
      if (r?.success) {
        setChannels((l) => l.map((x) => (x.id === id ? r.data : x)))
        if (!on && openId === id) {
          setOpenId(null)
          setPosts([])
        }
      }
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    }
    setMenuOpen(false)
  }

  const open = async (c: any) => {
    if (!(c.followed || c.is_owner)) return
    setOpenId(c.id)
    setProfileTab('posts')
    setMenuOpen(false)
    setShowJump(false)
    setPostsLoading(true)
    try {
      const r = await channelApi.posts(c.id)
      if (r?.success) {
        setPosts(r.data || [])
        requestAnimationFrame(() => scrollFeedToBottom(false))
      } else setMsg(r?.message || 'Failed to load posts')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed to load posts')
    } finally {
      setPostsLoading(false)
    }
  }

  const backToList = () => {
    setOpenId(null)
    setPosts([])
    setDraft('')
    setShowEmoji(false)
  }

  const post = async (id: number, contentOverride?: string) => {
    const content = (contentOverride ?? draft).trim()
    if (!content || sending) return
    setSending(true)
    try {
      const r = await channelApi.post(id, content)
      if (r?.success) {
        setPosts((p) => [...p, r.data])
        setDraft('')
        setShowEmoji(false)
        refreshOne(id)
        requestAnimationFrame(() => scrollFeedToBottom(true))
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setSending(false)
    }
  }

  const handleFile = async (f: File | undefined) => {
    if (!f || !openChannel || uploading) return
    setUploading(true)
    try {
      const r: any = await uploadApi.upload(f)
      const url = r?.data?.cloudinary_url || r?.data?.url
      if (!url) {
        setMsg('Upload unavailable — paste an image link instead')
        return
      }
      const caption = draft.trim()
      await post(openChannel.id, caption ? `${caption}\n${url}` : url)
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const forwardPost = async (p: any) => {
    const text = postText(p)
    try {
      if (navigator.share) {
        await navigator.share({ title: openChannel?.name || 'Channel post', text })
      } else {
        await navigator.clipboard.writeText(text)
        setMsg('Post copied — share it anywhere')
      }
    } catch {
      /* user cancelled share */
    }
  }

  const copyInviteLink = async () => {
    const link = `${window.location.origin}/chat#channel-${openChannel?.id}`
    try {
      await navigator.clipboard.writeText(link)
      setMsg('Channel link copied')
    } catch {
      setMsg(link)
    }
    setMenuOpen(false)
  }

  const scrollFeedToBottom = (smooth: boolean) => {
    const el = feedRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  const onFeedScroll = () => {
    const el = feedRef.current
    if (!el) return
    setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 320)
  }

  const openChannel = channels.find((c) => c.id === openId)

  const avatarLetter = (n: string) => (n || '?')[0].toUpperCase()

  const coverOf = (id: number) => COVERS[Math.abs(id) % COVERS.length]

  const asDate = (iso?: string) => {
    if (!iso) return null
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
    const d = new Date(normalized)
    return isNaN(d.getTime()) ? null : d
  }

  const fmtDatePill = (iso?: string) => {
    const d = asDate(iso)
    if (!d) return ''
    return d
      .toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
      .toUpperCase()
  }

  const fmtPostTime = (iso?: string) => {
    const d = asDate(iso)
    if (!d) return ''
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  }

  const fmtDate = (iso?: string) => {
    const d = asDate(iso)
    if (!d) return ''
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const IMAGE_RE = /https?:\/\/[^\s)]+?\.(?:jpg|jpeg|png|gif|webp)(?:\?[^\s)]*)?/gi
  const URL_RE = /(https?:\/\/[^\s)]+)/gi

  const postImages = (content: string): string[] => {
    if (!content) return []
    const m = content.match(IMAGE_RE)
    return m ? [...new Set(m)] : []
  }

  const postText = (p: any): string => {
    const content: string = p?.content || ''
    const imgs = postImages(content)
    let text = content
    for (const u of imgs) text = text.split(u).join('').trim()
    return text.replace(/\n{3,}/g, '\n\n').trim() || (imgs.length ? '' : content)
  }

  const renderRichText = (text: string) => {
    if (!text) return null
    const parts = text.split(URL_RE)
    return parts.map((part, i) => {
      if (/^https?:\/\//i.test(part)) {
        return (
          <a
            key={i}
            href={part}
            target="_blank"
            rel="noreferrer"
            className="underline break-all"
            onClick={(e) => e.stopPropagation()}
          >
            {part}
          </a>
        )
      }
      return <span key={i}>{part}</span>
    })
  }

  /* ── Discovery derivations (all from real data) ── */
  const q = query.trim().toLowerCase()
  const searched = q
    ? channels.filter(
        (c: any) =>
          (c.name || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
      )
    : null
  const byFollowers = useMemo(
    () => [...channels].sort((a, b) => (b.follower_count ?? 0) - (a.follower_count ?? 0)),
    [channels]
  )
  const trending = useMemo(
    () =>
      [...channels].sort(
        (a, b) =>
          (b.follower_count ?? 0) + (b.post_count ?? 0) * 2 -
          ((a.follower_count ?? 0) + (a.post_count ?? 0) * 2)
      ),
    [channels]
  )
  const featured = byFollowers.slice(0, 3)
  const featuredIds = new Set(featured.map((c: any) => c.id))
  const trendingRows = trending.filter((c: any) => !featuredIds.has(c.id)).slice(0, 5)
  // Directory lists only what the sections above don't, so small
  // datasets never render the same card twice on one screen.
  const highlightedIds = new Set([
    ...featured.map((c: any) => c.id),
    ...trendingRows.map((c: any) => c.id),
  ])
  const restChannels = channels.filter((c: any) => !highlightedIds.has(c.id))
  const following = channels.filter((c: any) => c.followed || c.is_owner)

  const grouped = useMemo(() => {
    const groups: { key: string; label: string; items: any[] }[] = []
    for (const p of posts) {
      const label = fmtDatePill(p.created_at) || 'UPDATES'
      const last = groups[groups.length - 1]
      if (last && last.label === label) last.items.push(p)
      else groups.push({ key: `${label}-${groups.length}`, label, items: [p] })
    }
    return groups
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [posts])

  const mediaPosts = useMemo(() => posts.filter((p: any) => postImages(p.content || '').length > 0), [posts])

  const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🎉', '❤️', '🔥']

  const followBtn = (c: any, big = false) =>
    c.is_owner ? null : (
      <button
        onClick={(e) => {
          e.stopPropagation()
          follow(c.id, !c.followed)
        }}
        className={
          c.followed
            ? `${big ? 'px-5 py-2 text-sm' : 'px-3.5 py-1.5 text-[13px]'} rounded-full border border-subtle text-secondary font-semibold shrink-0 transition-all active:scale-95 min-h-[44px] inline-flex items-center`
            : `${big ? 'px-5 py-2 text-sm' : 'px-3.5 py-1.5 text-[13px]'} rounded-full gradient-primary text-white font-semibold shrink-0 shadow transition-all active:scale-95 min-h-[44px] inline-flex items-center`
        }
      >
        {c.followed ? 'Following' : 'Follow'}
      </button>
    )

  /* ═══════════ PROFILE VIEW ═══════════ */
  if (openChannel) {
    const [c1, c2] = coverOf(openChannel.id)
    const shownPosts = profileTab === 'media' ? mediaPosts : posts
    return (
      <div className="h-full flex flex-col bg-card">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--k-border)] shrink-0">
          <button onClick={backToList} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Back to channels">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white text-base font-extrabold shrink-0 ring-2 ring-[var(--k-border)]">
            {avatarLetter(openChannel.name)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-[15px] flex items-center gap-1 truncate tracking-tight">
              <span className="truncate">{openChannel.name}</span>
              {openChannel.is_owner && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {compactPlural(openChannel.follower_count ?? 0, 'follower')}
              {openChannel.is_owner ? ' · you own this channel' : ''}
            </p>
          </div>
          <button
            onClick={() => toggleMute(openChannel.id)}
            className="p-2 rounded-full hover:bg-muted transition-colors touch-44 text-secondary"
            aria-label={mutedMap[openChannel.id] ? 'Unmute channel' : 'Mute channel'}
          >
            {mutedMap[openChannel.id] ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Channel menu">
              <MoreVertical className="w-5 h-5" />
            </button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-subtle bg-elevated shadow-xl py-1 z-20 text-sm">
                  {!openChannel.is_owner && (
                    <button
                      onClick={() => follow(openChannel.id, !openChannel.followed)}
                      className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2"
                    >
                      {openChannel.followed ? <Check className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                      {openChannel.followed ? 'Unfollow' : 'Follow'}
                    </button>
                  )}
                  <button onClick={copyInviteLink} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
                    <Link2 className="w-4 h-4" /> Copy invite link
                  </button>
                  {openChannel.is_owner && (
                    <button onClick={() => remove(openChannel.id)} className="w-full text-left px-3 py-2 hover:bg-muted text-destructive flex items-center gap-2">
                      <Trash2 className="w-4 h-4" /> Delete channel
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 flex flex-col min-h-0 relative">
          <div ref={feedRef} onScroll={onFeedScroll} className="flex-1 overflow-y-auto min-h-0" style={{ background: 'radial-gradient(ellipse at 20% 0%, rgba(var(--accent-rgb), 0.10) 0%, transparent 55%), var(--bg-primary)' }}>
            {/* Identity */}
            <div className="m-3 rounded-[24px] overflow-hidden border border-subtle" style={{ background: 'linear-gradient(180deg, rgba(34,34,68,0.98), rgba(20,20,42,0.98))', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              <div className="relative h-24 overflow-hidden" style={{ background: `linear-gradient(120deg, ${c1}, ${c2})` }}>
                <span className="absolute -right-2 -bottom-7 text-[104px] leading-none font-extrabold text-white/10 select-none">
                  {avatarLetter(openChannel.name)}
                </span>
                <div className="absolute w-40 h-40 rounded-full bg-white/10 blur-2xl -left-10 -top-16" />
              </div>
              <div className="px-4 pt-2.5 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-white text-xl font-extrabold shadow-lg shrink-0 ring-2 ring-white/10">
                    {avatarLetter(openChannel.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[17px] tracking-tight flex items-center gap-1.5 truncate">
                      <span className="truncate">{openChannel.name}</span>
                      {openChannel.is_owner && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
                    </p>
                    <p className="text-[11px] text-tertiary mt-0.5">
                      {compactPlural(openChannel.follower_count ?? 0, 'follower')} · {compactPlural(openChannel.post_count ?? 0, 'post')}
                      {openChannel.created_at ? ` · since ${fmtDate(openChannel.created_at)}` : ''}
                    </p>
                  </div>
                </div>
                {openChannel.description && (
                  <p className="text-[13px] text-secondary leading-relaxed mt-2">{openChannel.description}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  {followBtn(openChannel, true)}
                  {!openChannel.is_owner && (
                    <button
                      onClick={() => toggleMute(openChannel.id)}
                      className={`p-2 rounded-full border border-subtle transition-all active:scale-95 touch-44 ${mutedMap[openChannel.id] ? 'text-tertiary' : 'text-primary'}`}
                      aria-label="Toggle notifications"
                    >
                      {mutedMap[openChannel.id] ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                    </button>
                  )}
                  {openChannel.is_owner && (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary border border-subtle px-2.5 py-1 rounded-full">Owner</span>
                  )}
                </div>
              </div>
            </div>

            {/* Profile tabs */}
            <div className="mx-3 mb-1 flex rounded-full bg-elevated border border-subtle p-1">
              {(['posts', 'media', 'about'] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setProfileTab(t)}
                  className={`flex-1 py-1.5 min-h-[44px] rounded-full text-[13px] font-semibold capitalize transition-all ${
                    profileTab === t ? 'gradient-primary text-white shadow' : 'text-tertiary'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            {msg && <p className="px-4 pt-1 text-xs text-muted-foreground">{msg}</p>}

            {profileTab === 'about' ? (
              <div className="m-3 rounded-[20px] bg-elevated border border-subtle p-4 space-y-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">About</p>
                  <p className="text-sm text-secondary mt-1 leading-relaxed">{openChannel.description || 'No description yet.'}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  {[
                    [compact(openChannel.follower_count ?? 0), 'Followers'],
                    [String(openChannel.post_count ?? 0), 'Posts'],
                    [openChannel.created_at && asDate(openChannel.created_at)
                      ? asDate(openChannel.created_at)!.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
                      : '—', 'Created'],
                  ].map(([v, l]) => (
                    <div key={l} className="rounded-xl bg-card border border-subtle p-2.5">
                      <p className="text-sm font-bold truncate">{v}</p>
                      <p className="text-[11px] text-tertiary">{l}</p>
                    </div>
                  ))}
                </div>
                {openChannel.is_owner ? (
                  <button onClick={focusComposer} className="w-full py-2.5 rounded-xl btn-primary text-sm font-semibold">
                    Post an update
                  </button>
                ) : (
                  <button onClick={() => follow(openChannel.id, !openChannel.followed)} className={`w-full py-2.5 rounded-xl text-sm font-semibold min-h-[44px] ${openChannel.followed ? 'border border-subtle text-secondary' : 'btn-primary'}`}>
                    {openChannel.followed ? 'Following' : 'Follow channel'}
                  </button>
                )}
              </div>
            ) : postsLoading ? (
              <div className="px-3 py-2 space-y-3">
                {[0, 1].map((i) => (
                  <div key={i} className="rounded-[20px] bg-elevated border border-subtle p-4 space-y-2.5 animate-pulse">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-muted" />
                      <div className="h-3 w-28 rounded bg-muted" />
                    </div>
                    <div className="h-3 w-full rounded bg-muted" />
                    <div className="h-3 w-2/3 rounded bg-muted" />
                  </div>
                ))}
              </div>
            ) : shownPosts.length === 0 ? (
              <div className="py-12 text-center px-8">
                <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-white text-2xl font-extrabold mx-auto shadow-lg">
                  {avatarLetter(openChannel.name)}
                </div>
                <p className="text-[15px] font-semibold mt-3">{profileTab === 'media' ? 'No media yet' : 'No posts yet'}</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {openChannel.is_owner ? 'Share the first update with your followers.' : 'New updates will appear here.'}
                </p>
                {openChannel.is_owner && profileTab === 'posts' && (
                  <button onClick={focusComposer} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold shadow-lg transition-all active:scale-95">
                    Post your first update
                  </button>
                )}
              </div>
            ) : (
              <div className="px-3 py-2 pb-6">
                {grouped
                  .map((g) => ({
                    ...g,
                    items: profileTab === 'media' ? g.items.filter((p: any) => postImages(p.content || '').length > 0) : g.items,
                  }))
                  .filter((g) => g.items.length > 0)
                  .map((g) => (
                    <div key={g.key}>
                      <div className="flex justify-center my-4">
                        <span className="px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-primary border border-subtle" style={{ background: 'rgba(28,28,56,0.9)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}>
                          {g.label}
                        </span>
                      </div>
                      <div className="space-y-4">
                        {g.items.map((p: any, i: number) => {
                          const imgs = postImages(p.content || '')
                          const text = postText(p)
                          const isLatest = i === g.items.length - 1 && g.key === grouped[grouped.length - 1].key
                          return (
                            <div key={p.id}>
                              <article
                                className="channel-post-enter rounded-[20px] border overflow-hidden transition-transform hover:scale-[1.005]"
                                style={
                                  isLatest
                                    ? {
                                        animationDelay: `${Math.min(i * 70, 350)}ms`,
                                        background: 'linear-gradient(180deg, rgba(34,34,68,0.98), rgba(22,22,46,0.98))',
                                        borderColor: 'rgba(var(--accent-rgb), 0.45)',
                                        boxShadow: '0 8px 32px rgba(0,0,0,0.5), 0 0 24px rgba(var(--accent-rgb), 0.12)',
                                      }
                                    : {
                                        animationDelay: `${Math.min(i * 70, 350)}ms`,
                                        background: 'linear-gradient(180deg, rgba(28,28,56,0.95), rgba(20,20,42,0.95))',
                                        borderColor: 'rgba(255,255,255,0.07)',
                                        boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
                                      }
                                }
                              >
                                {isLatest && <div className="h-1 kryzen-accent-gradient" />}
                                <div className="flex items-center gap-2.5 px-3.5 pt-3">
                                  <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-extrabold shrink-0 shadow">
                                    {avatarLetter(openChannel.name)}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="text-[13px] font-bold truncate tracking-tight flex items-center gap-1">
                                      <span className="truncate">{openChannel.name}</span>
                                      {openChannel.is_owner && <BadgeCheck className="w-3.5 h-3.5 text-sky-500 shrink-0" />}
                                    </p>
                                    <p className="text-[11px] text-tertiary">{fmtPostTime(p.created_at)}</p>
                                  </div>
                                  {isLatest && (
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-white gradient-primary px-2.5 py-1 rounded-full shrink-0 shadow">New</span>
                                  )}
                                </div>
                                {imgs.length > 0 && (
                                  <div className="mt-2.5 bg-black/40">
                                    {imgs.map((u) => (
                                      <a key={u} href={u} target="_blank" rel="noreferrer">
                                        <img src={u} alt="" loading="lazy" decoding="async" className="w-full max-h-80 object-cover" />
                                      </a>
                                    ))}
                                  </div>
                                )}
                                {text ? (
                                  <div className="px-3.5 pt-2.5 pb-1">
                                    <p className="text-[15px] leading-[1.6] whitespace-pre-wrap break-words">{renderRichText(text)}</p>
                                  </div>
                                ) : (
                                  <div className="h-1.5" />
                                )}
                                <div className="px-3 pb-2.5 pt-1 flex items-center gap-1">
                                  <button
                                    onClick={() => forwardPost(p)}
                                    className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-tertiary hover:text-primary transition-all active:scale-90 touch-44"
                                    aria-label="Forward post"
                                    title="Forward / share"
                                  >
                                    <Forward className="w-4 h-4" />
                                  </button>
                                  <span className="flex-1" />
                                  <span className="text-[11px] text-tertiary">{fmtPostTime(p.created_at)}</span>
                                  {openChannel.is_owner && <Check className="w-3.5 h-3.5 text-tertiary" />}
                                </div>
                              </article>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {showJump && (
            <button
              onClick={() => scrollFeedToBottom(true)}
              className="absolute bottom-24 right-4 w-10 h-10 rounded-full bg-elevated border border-subtle shadow-xl flex items-center justify-center text-secondary z-10 transition-all active:scale-90 touch-44"
              aria-label="Jump to latest"
            >
              <ChevronRight className="w-5 h-5 rotate-90" />
            </button>
          )}

          {openChannel.is_owner ? (
            <div className="shrink-0 px-2.5 pt-1.5 channel-composer">
              {showEmoji && (
                <div className="flex gap-1.5 px-1 pb-2">
                  {EMOJIS.map((e) => (
                    <button key={e} onClick={() => { setDraft((d) => d + e); requestAnimationFrame(() => autogrow(composerRef.current)) }} className="text-xl p-1.5 rounded-lg hover:bg-muted transition-all active:scale-90">
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div className="flex-1 flex items-center gap-1 rounded-full border px-1.5 py-1 transition-shadow focus-within:border-primary/60" style={{ ...fieldStyle, boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}>
                  <button onClick={() => setShowEmoji((v) => !v)} className="p-2 rounded-full text-tertiary hover:text-secondary touch-44" aria-label="Emoji">
                    <Smile className="w-5 h-5" />
                  </button>
                  <textarea
                    ref={composerRef}
                    value={draft}
                    rows={1}
                    onChange={(e) => { setDraft(e.target.value); autogrow(e.target) }}
                    onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') post(openChannel.id) }}
                    placeholder="Write an update… (Enter for new line)"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[15px] py-1.5 resize-none max-h-32 overflow-y-auto"
                    style={{ color: '#f0f0ff', caretColor: '#f0f0ff' }}
                    aria-label="Write an update"
                  />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="p-2 rounded-full text-tertiary hover:text-secondary touch-44 disabled:opacity-40" aria-label="Attach">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="p-2 rounded-full text-tertiary hover:text-secondary touch-44 disabled:opacity-40" aria-label="Photo">
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                {draft.trim() || uploading ? (
                  <button
                    onClick={() => post(openChannel.id)}
                    disabled={sending || uploading || !draft.trim()}
                    className="w-12 h-12 rounded-full btn-primary disabled:opacity-50 flex items-center justify-center shrink-0 transition-all active:scale-95"
                    aria-label="Post"
                    style={{ boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.45)' }}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button onClick={focusComposer} className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shrink-0" aria-label="Write" title="Write an update">
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
              {uploading && <p className="text-[11px] text-tertiary px-2 pt-1">Uploading media…</p>}
            </div>
          ) : (
            <div className="shrink-0 p-3 border-t border-[var(--k-border)]">
              {!openChannel.followed ? (
                <button onClick={() => follow(openChannel.id, true)} className="w-full py-2.5 rounded-full btn-primary text-sm font-semibold transition-all active:scale-[0.99] min-h-[44px]">
                  Follow channel
                </button>
              ) : (
                <p className="text-xs text-tertiary text-center">You follow this channel — only the owner can post.</p>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  /* ═══════════ DISCOVER VIEW ═══════════ */
  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--k-border)] shrink-0">
        <p className="font-bold text-[17px] flex-1 px-2 tracking-tight flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-primary" /> Channels
          {channels.length > 0 && (
            <span className="text-xs font-semibold text-tertiary align-middle">{channels.length}</span>
          )}
        </p>
        <button onClick={() => setWizard({ step: 1, name: '', desc: '' })} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="New channel">
          <Plus className="w-5 h-5" />
        </button>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-3 pt-2.5 shrink-0">
        <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-full bg-elevated border border-subtle focus-within:border-primary/50 transition-colors">
          <Search className="w-4 h-4 text-tertiary shrink-0" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels…"
            className="flex-1 min-w-0 bg-transparent outline-none text-sm"
            style={{ color: '#f0f0ff' }}
            aria-label="Search channels"
          />
          {query && (
            <button onClick={() => setQuery('')} className="p-0.5 rounded-full hover:bg-muted touch-44" aria-label="Clear search">
              <X className="w-3.5 h-3.5 text-tertiary" />
            </button>
          )}
        </div>
        {!q && (
          <div className="flex rounded-full bg-elevated border border-subtle p-1 mt-2.5">
            {(['discover', 'following'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`flex-1 py-1.5 min-h-[44px] rounded-full text-[13px] font-semibold capitalize transition-all ${
                  tab === t ? 'gradient-primary text-white shadow' : 'text-tertiary'
                }`}
              >
                {t}
                {t === 'following' && following.length > 0 && (
                  <span className="ml-1.5 text-[11px] opacity-80">{following.length}</span>
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
            <div className="rounded-[22px] overflow-hidden border border-subtle animate-pulse">
              <div className="h-28 bg-muted" />
              <div className="p-3.5 space-y-2">
                <div className="h-4 w-2/3 rounded bg-muted" />
                <div className="h-3 w-1/3 rounded bg-muted" />
              </div>
            </div>
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-1 py-2 animate-pulse">
                <div className="w-12 h-12 rounded-full bg-muted shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-1/2 rounded bg-muted" />
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
            <p className="text-[16px] font-bold mt-4 tracking-tight">Couldn&apos;t load channels</p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-[240px] mx-auto">
              Check your connection and try again — nothing was lost.
            </p>
            <button onClick={load} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold shadow-lg transition-all active:scale-95">
              Retry
            </button>
          </div>
        ) : channels.length === 0 ? (
          <div className="py-12 text-center px-8">
            <div className="w-16 h-16 rounded-[22px] gradient-primary flex items-center justify-center mx-auto shadow-lg">
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <p className="text-[16px] font-bold mt-4 tracking-tight">Discover something new</p>
            <p className="text-[13px] text-muted-foreground mt-1 max-w-[240px] mx-auto">
              Follow channels that match your interests and build your feed.
            </p>
            <button onClick={() => setWizard({ step: 1, name: '', desc: '' })} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold shadow-lg transition-all active:scale-95">
              Create a channel
            </button>
          </div>
        ) : searched ? (
          <div className="px-3 pt-2">
            {searched.length === 0 ? (
              <div className="py-10 text-center px-8">
                <p className="text-[15px] font-semibold">Nothing matches “{query}”</p>
                <p className="text-[13px] text-muted-foreground mt-1">Try a different search — or start the channel yourself.</p>
                <button onClick={() => { setWizard({ step: 1, name: query, desc: '' }); setQuery('') }} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold transition-all active:scale-95">
                  Create “{query.trim().slice(0, 24)}”
                </button>
              </div>
            ) : (
              searched.map((c: any) => <ChannelRow key={c.id} c={c} />)
            )}
          </div>
        ) : tab === 'following' ? (
          <div className="px-3 pt-2">
            {following.length === 0 ? (
              <div className="py-10 text-center px-8">
                <div className="w-16 h-16 rounded-full bg-elevated border border-subtle flex items-center justify-center mx-auto">
                  <Bell className="w-7 h-7 text-tertiary" />
                </div>
                <p className="text-[15px] font-semibold mt-3">You follow nothing yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">Channels you follow will live here.</p>
                <button onClick={() => setTab('discover')} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold transition-all active:scale-95">
                  Explore channels
                </button>
              </div>
            ) : (
              following.map((c: any) => <ChannelRow key={c.id} c={c} />)
            )}
          </div>
        ) : (
          <div className="pt-3 space-y-5">
            {featured.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 px-4 pb-2">
                  <Sparkles className="w-3.5 h-3.5 text-primary" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Featured</p>
                </div>
                <div className="flex gap-3 overflow-x-auto px-4 pb-1 snap-x no-scrollbar">
                  {featured.map((c: any) => {
                    const [f1, f2] = coverOf(c.id)
                    const canOpen = c.followed || c.is_owner
                    return (
                      <div
                        key={c.id}
                        onClick={() => open(c)}
                        role={canOpen ? 'button' : undefined}
                        tabIndex={canOpen ? 0 : undefined}
                        onKeyDown={(e) => { if (canOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(c) } }}
                        aria-label={canOpen ? `Open ${c.name}` : undefined}
                        className={`snap-start shrink-0 w-64 rounded-[22px] overflow-hidden border border-subtle transition-all active:scale-[0.98] ${canOpen ? 'cursor-pointer hover:border-primary/40' : ''}`}
                        style={{ background: 'linear-gradient(180deg, rgba(34,34,68,0.98), rgba(20,20,42,0.98))', boxShadow: '0 8px 28px rgba(0,0,0,0.45)' }}
                      >
                        <div className="relative h-20 overflow-hidden" style={{ background: `linear-gradient(120deg, ${f1}, ${f2})` }}>
                          <span className="absolute -right-1 -bottom-5 text-[72px] leading-none font-extrabold text-white/10 select-none">
                            {avatarLetter(c.name)}
                          </span>
                        </div>
                        <div className="p-3">
                          <div className="flex items-center gap-2.5 -mt-9 mb-2">
                            <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white text-lg font-extrabold shadow-lg ring-2 ring-[var(--bg-card)] shrink-0">
                              {avatarLetter(c.name)}
                            </div>
                            <div className="flex-1 min-w-0 pt-7">
                              <p className="text-[15px] font-bold truncate tracking-tight flex items-center gap-1">
                                <span className="truncate">{c.name}</span>
                                {c.is_owner && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
                              </p>
                            </div>
                          </div>
                          {c.description
                            ? <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed min-h-8">{c.description}</p>
                            : <p className="text-xs text-tertiary italic min-h-8">No description</p>}
                          <div className="flex items-center justify-between mt-2.5">
                            <p className="text-[11px] text-tertiary">
                              {compactPlural(c.follower_count ?? 0, 'follower')} · {compactPlural(c.post_count ?? 0, 'post')}
                            </p>
                            {followBtn(c)}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
            {trendingRows.length > 0 && (
              <section>
                <div className="flex items-center gap-1.5 px-4 pb-1">
                  <Flame className="w-3.5 h-3.5 text-primary" />
                  <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Trending</p>
                </div>
                <div className="px-3">
                  {trendingRows.map((c: any) => <ChannelRow key={c.id} c={c} />)}
                </div>
              </section>
            )}
            {restChannels.length > 0 && (
            <section>
              <div className="flex items-center gap-1.5 px-4 pb-1">
                <Compass className="w-3.5 h-3.5 text-primary" />
                <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">All channels</p>
              </div>
              <div className="px-3">
                {restChannels.map((c: any) => <ChannelRow key={c.id} c={c} />)}
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
              <p className="font-bold text-[17px] tracking-tight">New channel</p>
              <button onClick={() => !creating && setWizard(null)} className="p-2 rounded-full hover:bg-muted touch-44" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              {[1, 2, 3].map((s) => (
                <span key={s} className={`h-1 flex-1 rounded-full transition-all ${wizard.step >= s ? 'gradient-primary' : 'bg-muted'}`} />
              ))}
            </div>
            <p className="text-xs text-tertiary font-semibold uppercase tracking-wider mb-2">
              {wizard.step === 1 ? '01 · Identity' : wizard.step === 2 ? '02 · Details' : '03 · Review'}
            </p>
            {wizard.step === 1 && (
              <div className="space-y-2.5">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-white text-xl font-extrabold shrink-0 shadow-lg">
                    {avatarLetter(wizard.name || '?')}
                  </div>
                  <input
                    autoFocus
                    value={wizard.name}
                    onChange={(e) => setWizard({ ...wizard, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter' && wizard.name.trim()) setWizard({ ...wizard, step: 2 }) }}
                    placeholder="Channel name"
                    maxLength={100}
                    className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border outline-none text-sm"
                    style={fieldStyle}
                  />
                </div>
              </div>
            )}
            {wizard.step === 2 && (
              <input
                autoFocus
                value={wizard.desc}
                onChange={(e) => setWizard({ ...wizard, desc: e.target.value })}
                onKeyDown={(e) => { if (e.key === 'Enter') setWizard({ ...wizard, step: 3 }) }}
                placeholder="What is this channel about?"
                maxLength={500}
                className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm"
                style={fieldStyle}
              />
            )}
            {wizard.step === 3 && (
              <div className="rounded-2xl bg-elevated border border-subtle p-4 flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0">
                  {avatarLetter(wizard.name || '?')}
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{wizard.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{wizard.desc || 'No description'}</p>
                  <p className="text-[11px] text-tertiary mt-0.5">One-way feed · only you can post</p>
                </div>
              </div>
            )}
            {msg && wizard.step === 1 && <p className="text-xs text-muted-foreground mt-2">{msg}</p>}
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
                  className="flex-1 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50"
                >
                  Continue
                </button>
              ) : (
                <button onClick={create} disabled={creating} className="flex-1 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50">
                  {creating ? 'Creating…' : 'Create channel'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )

  /* ── Shared channel row ── */
  function ChannelRow({ c }: { c: any }) {
    const canOpen = c.followed || c.is_owner
    return (
      <div className="flex items-center gap-3 px-1 py-2.5 border-b border-[var(--k-border)]/60 last:border-0">
        <button onClick={() => open(c)} disabled={!canOpen} className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0 disabled:cursor-default shadow ring-2 ring-[var(--k-border)] transition-transform active:scale-95">
          {avatarLetter(c.name)}
        </button>
        <button onClick={() => open(c)} disabled={!canOpen} className="flex-1 min-w-0 text-left disabled:cursor-default">
          <p className="text-[15px] font-semibold flex items-center gap-1 truncate tracking-tight">
            <span className="truncate">{c.name}</span>
            {c.is_owner && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
          </p>
          <p className="text-[13px] text-muted-foreground truncate mt-px">
            {c.description || compactPlural(c.follower_count ?? 0, 'follower')}
          </p>
          {c.description && (
            <p className="text-xs text-tertiary mt-px">{compactPlural(c.follower_count ?? 0, 'follower')} · {compactPlural(c.post_count ?? 0, 'post')}</p>
          )}
        </button>
        {!c.is_owner ? (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => toggleMute(c.id)}
              className={`p-2 rounded-full hover:bg-muted transition-all active:scale-90 touch-44 ${mutedMap[c.id] ? 'text-tertiary' : 'text-primary'}`}
              aria-label={mutedMap[c.id] ? 'Unmute' : 'Mute'}
            >
              {mutedMap[c.id] ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
            </button>
            {followBtn(c)}
          </div>
        ) : (
          <button onClick={() => remove(c.id)} className="p-2 rounded-full hover:bg-muted transition-colors touch-44 text-tertiary shrink-0" aria-label="Delete channel">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
        {canOpen && <ChevronRight className="w-4 h-4 text-tertiary shrink-0 opacity-60" />}
      </div>
    )
  }
}
