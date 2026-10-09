import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Send,
  Trash2,
  X,
  Check,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BellOff,
  Bell,
  Link2,
  MoreVertical,
  MoreHorizontal,
  Search,
  SlidersHorizontal,
  Smile,
  Paperclip,
  Camera,
  Mic,
  Forward,
  ChevronRight,
  Sparkles,
  Flame,
  Compass,
  Pencil,
  Users,
  Star,
  Zap,
  Menu,
  Crown,
  Gamepad2,
  Palette,
  Cpu,
  Music,
  Code2,
  LayoutGrid,
  Rocket,
  Calendar,
  MessageSquare,
} from 'lucide-react'
import { channelApi, uploadApi } from '../services/api'
import { useEscapeKey } from '../hooks/useDismiss'
import { compact, compactPlural } from '../utils/format'

/**
 * Channels — discovery-first creator experience.
 * Discover (Featured / Trending / All + search) → Follow → Consume.
 * Same backend, same flows — new presentation only.
 */

const COVERS: [string, string][] = [
  ['#7c5cfc', '#22d3ee'],
  ['#a855f7', '#f472b6'],
  ['#0ea5e9', '#6366f1'],
  ['#f43f5e', '#f59e0b'],
  ['#10b981', '#06b6d4'],
  ['#8b5cf6', '#ec4899'],
  ['#06b6d4', '#3b82f6'],
  ['#f59e0b', '#ef4444'],
]

// Customizable channel identity: emoji icons + image cover themes (sample mathiri).
// cover_theme stores the theme id; avatar_url / cover_url store uploads.
const CHANNEL_ICONS = ['🚀', '🔥', '⭐', '💜', '🌊', '🌿', '🎮', '🎨', '📢', '💡', '🎵', '⚽', '📚', '🍔', '✈️', '💰']
const CHANNEL_THEMES = [
  { id: 'neon-peaks', name: 'Neon Peaks', url: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=800&q=80&auto=format&fit=crop' },
  { id: 'purple-dusk', name: 'Purple Dusk', url: 'https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?w=800&q=80&auto=format&fit=crop' },
  { id: 'emerald-forest', name: 'Emerald Forest', url: 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=800&q=80&auto=format&fit=crop' },
  { id: 'alpine-lake', name: 'Alpine Lake', url: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=800&q=80&auto=format&fit=crop' },
  { id: 'golden-valley', name: 'Golden Valley', url: 'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80&auto=format&fit=crop' },
  { id: 'ocean-wave', name: 'Ocean Wave', url: 'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=800&q=80&auto=format&fit=crop' },
  { id: 'misty-hills', name: 'Misty Hills', url: 'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=800&q=80&auto=format&fit=crop' },
  { id: 'tropical-beach', name: 'Tropical Beach', url: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=800&q=80&auto=format&fit=crop' },
]

const MUTE_KEY = 'kb_channel_muted'

const CATEGORIES = [
  { id: 'tech', label: 'Technology', icon: Code2, color: '#f472b6' },
  { id: 'gaming', label: 'Gaming', icon: Gamepad2, color: '#22d3ee' },
  { id: 'design', label: 'Design', icon: Palette, color: '#f472b6' },
  { id: 'ai', label: 'AI & Tools', icon: Cpu, color: '#22d3ee' },
  { id: 'music', label: 'Music', icon: Music, color: '#fb923c' },
]

const HERO_IMG = 'https://images.unsplash.com/photo-1519681393784-d120267933ba?w=1200&q=80&auto=format&fit=crop'

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
  const [tab, setTab] = useState<'discover' | 'following' | 'all'>('discover')
  const [query, setQuery] = useState('')
  const [activeCat, setActiveCat] = useState<string | null>(null)
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
  // Create wizard — everything customizable: name, desc, icon, theme, images.
  const [wizard, setWizard] = useState<null | { step: number; name: string; desc: string; icon: string; cover_theme: string; avatar_url: string; cover_url: string }>(null)
  const [creating, setCreating] = useState(false)
  // Owner edit dialog (PATCH): preloaded from the open channel — all fields editable.
  const [edit, setEdit] = useState<null | { name: string; desc: string; icon: string; cover_theme: string; avatar_url: string; cover_url: string }>(null)
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  useEscapeKey(() => { if (edit && !savingEdit) setEdit(null) }, !!edit)
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
      const r = await channelApi.create({
        name,
        description: (wizard?.desc || '').trim() || undefined,
        icon: wizard?.icon?.trim() || undefined,
        cover_theme: wizard?.cover_theme?.trim() || undefined,
        avatar_url: wizard?.avatar_url?.trim() || undefined,
        cover_url: wizard?.cover_url?.trim() || undefined,
      })
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

  const saveEdit = async () => {
    if (!openChannel || !edit || savingEdit) return
    const name = edit.name.trim()
    if (!name) {
      setEditError('Channel name is required')
      return
    }
    setSavingEdit(true)
    setEditError(null)
    try {
      const r = await channelApi.update(openChannel.id, {
        name,
        description: edit.desc.trim() ? edit.desc.trim() : null,
        icon: edit.icon.trim() ? edit.icon.trim() : null,
        cover_theme: edit.cover_theme.trim() ? edit.cover_theme.trim() : null,
        avatar_url: edit.avatar_url.trim() ? edit.avatar_url.trim() : null,
        cover_url: edit.cover_url.trim() ? edit.cover_url.trim() : null,
      })
      if (r?.success && r.data) {
        // Server returns the full channel dict: swap it in place so the
        // header, rows, counts, and follow state update immediately.
        setChannels((l) => l.map((x) => (x.id === openChannel.id ? r.data : x)))
        setEdit(null)
        setMsg('Channel updated')
      } else {
        setEditError(r?.message || 'Failed')
      }
    } catch (e: any) {
      setEditError(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setSavingEdit(false)
    }
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

  const deletePost = async (p: any) => {
    if (!openChannel?.is_owner) return
    if (!confirm('Delete this post?')) return
    try {
      const r = await channelApi.deletePost(openChannel.id, p.id)
      if (r?.success) {
        setPosts((list) => list.filter((x: any) => x.id !== p.id))
        refreshOne(openChannel.id)
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
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

  // Image cover wins: custom upload > picked image theme > id-based image fallback.
  // Plain gradients are never shown as covers now — only images (sample mathiri).
  const coverImageOf = (c: any): string => {
    if (c?.cover_url?.trim()) return c.cover_url.trim()
    if (c?.cover_theme) {
      const t = CHANNEL_THEMES.find((t) => t.id === c.cover_theme)
      if (t) return t.url
    }
    // Legacy ids like 'violet-cyan' (old gradient themes) fall back to images by id.
    return CHANNEL_THEMES[Math.abs(c?.id ?? 0) % CHANNEL_THEMES.length].url
  }

  // Tint for borders/shadows derived from the id-based gradient (avatar stays gradient).
  const coverOfChannel = (c: any): [string, string] => coverOf(c?.id ?? 0)

  const channelIcon = (c: any): string => (c?.icon || '').trim()

  const uploadChannelImage = async (f: File | undefined, target: 'avatar' | 'cover') => {
    if (!f || uploadingAvatar) return
    setUploadingAvatar(true)
    try {
      const r: any = await uploadApi.upload(f)
      const url = r?.data?.cloudinary_url || r?.data?.url
      if (!url) {
        setMsg('Upload unavailable — try again')
        return
      }
      if (edit) setEdit({ ...edit, ...(target === 'avatar' ? { avatar_url: url } : { cover_url: url }) })
      else if (wizard) setWizard({ ...wizard, ...(target === 'avatar' ? { avatar_url: url } : { cover_url: url }) })
    } catch (e: any) {
      setMsg(e.response?.data?.message || 'Upload failed')
    } finally {
      setUploadingAvatar(false)
    }
  }

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
    const openCover = coverImageOf(openChannel)
    const openIcon = channelIcon(openChannel)
    const shownPosts = profileTab === 'media' ? mediaPosts : posts
    return (
      <div className="h-full min-h-0 flex flex-col bg-card overflow-hidden">
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-[var(--k-border)] shrink-0">
          <button onClick={backToList} className="p-2 rounded-full hover:bg-muted transition-colors touch-44" aria-label="Back to channels">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white text-base font-extrabold shrink-0 ring-2 ring-[var(--k-border)] overflow-hidden">
            {openChannel.avatar_url ? <img src={openChannel.avatar_url} alt="" className="w-full h-full object-cover" /> : openIcon ? <span className="text-lg">{openIcon}</span> : avatarLetter(openChannel.name)}
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
                <div className="absolute right-0 top-full mt-1 w-48 rounded-xl border border-border bg-card kryzen-dropdown-glass shadow-2xl py-1 z-30 text-sm text-foreground overflow-hidden">
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
                    <button onClick={() => { setEdit({ name: openChannel.name || '', desc: openChannel.description || '', icon: openChannel.icon || '', cover_theme: openChannel.cover_theme || '', avatar_url: openChannel.avatar_url || '', cover_url: openChannel.cover_url || '' }); setEditError(null); setMenuOpen(false) }} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
                      <Pencil className="w-4 h-4" /> Edit channel
                    </button>
                  )}
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
              <div className="relative h-24 overflow-hidden" style={{ backgroundImage: `url(${openCover})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(0,0,0,0.35))' }} />
                <span className="absolute -right-2 -bottom-7 text-[104px] leading-none font-extrabold text-white/10 select-none">
                  {openIcon || avatarLetter(openChannel.name)}
                </span>
              </div>
              <div className="px-4 pt-2.5 pb-3.5">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-white text-xl font-extrabold shadow-lg shrink-0 ring-2 ring-white/10 overflow-hidden">
                    {openChannel.avatar_url ? <img src={openChannel.avatar_url} alt="" className="w-full h-full object-cover" /> : openIcon ? <span className="text-2xl">{openIcon}</span> : avatarLetter(openChannel.name)}
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
                                  {openChannel.is_owner && (
                                    <button
                                      onClick={() => deletePost(p)}
                                      className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-tertiary hover:text-destructive transition-all active:scale-90 touch-44"
                                      aria-label="Delete post"
                                      title="Delete post"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
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
            <div className="shrink-0 px-2.5 pt-1.5 channel-composer bg-card border-t border-border">
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
                    placeholder="Write an update…"
                    title="Enter for new line"
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
              <input ref={fileRef} type="file" accept="image/*,video/*" className="hidden" hidden aria-hidden="true" tabIndex={-1} style={{ display: 'none' }} onChange={(e) => handleFile(e.target.files?.[0])} />
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

        {/* Owner edit dialog (PATCH) — name, desc, icon, theme, avatar, cover */}
        {edit && openChannel?.is_owner && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4" onClick={() => !savingEdit && setEdit(null)}>
            <div role="dialog" aria-label="Edit channel" className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 animate-slide-up max-h-[90dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <p className="font-bold text-[17px] tracking-tight">Edit channel</p>
                <button onClick={() => !savingEdit && setEdit(null)} className="p-2 rounded-full hover:bg-muted touch-44" aria-label="Cancel editing">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Live preview */}
              <div className="rounded-2xl overflow-hidden border border-subtle mb-3">
                <div className="h-16" style={{ backgroundImage: `url(${edit.cover_url || (edit.cover_theme ? (CHANNEL_THEMES.find((x) => x.id === edit.cover_theme)?.url || CHANNEL_THEMES[0].url) : CHANNEL_THEMES[0].url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div className="p-3 flex items-center gap-3" style={{ background: 'rgba(20,20,42,0.9)' }}>
                  <div className="w-11 h-11 rounded-xl gradient-primary flex items-center justify-center text-white font-extrabold shrink-0 overflow-hidden">
                    {edit.avatar_url ? <img src={edit.avatar_url} alt="" className="w-full h-full object-cover" /> : edit.icon ? <span className="text-xl">{edit.icon}</span> : avatarLetter(edit.name || '?')}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold truncate text-sm">{edit.name || 'Channel name'}</p>
                    <p className="text-xs text-muted-foreground truncate">{edit.desc || 'No description'}</p>
                  </div>
                </div>
              </div>
              <div className="space-y-3">
                <div>
                  <label htmlFor="channel-edit-name" className="text-xs font-semibold text-muted-foreground">Name</label>
                  <input
                    id="channel-edit-name"
                    autoFocus
                    value={edit.name}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit() }}
                    placeholder="Channel name"
                    maxLength={100}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border outline-none text-sm min-h-[44px]"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <label htmlFor="channel-edit-desc" className="text-xs font-semibold text-muted-foreground">Description</label>
                  <input
                    id="channel-edit-desc"
                    value={edit.desc}
                    onChange={(e) => setEdit({ ...edit, desc: e.target.value })}
                    onKeyDown={(e) => { if (e.key === 'Enter') void saveEdit() }}
                    placeholder="What is this channel about? (optional)"
                    maxLength={500}
                    className="mt-1 w-full px-4 py-2.5 rounded-xl border outline-none text-sm min-h-[44px]"
                    style={fieldStyle}
                  />
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Icon — emoji</p>
                  <div className="grid grid-cols-8 gap-1.5">
                    {CHANNEL_ICONS.map((em) => (
                      <button key={em} onClick={() => setEdit({ ...edit, icon: edit.icon === em ? '' : em })} className={`text-xl p-1.5 rounded-lg transition-all active:scale-90 min-h-[44px] ${edit.icon === em ? 'ring-2 ring-primary' : 'hover:bg-muted'}`} style={edit.icon === em ? { background: 'rgba(var(--accent-rgb),0.15)' } : undefined} aria-label={`Icon ${em}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Cover theme — image</p>
                  <div className="grid grid-cols-4 gap-2">
                    {CHANNEL_THEMES.map((t) => (
                      <button key={t.id} onClick={() => setEdit({ ...edit, cover_theme: edit.cover_theme === t.id ? '' : t.id, cover_url: '' })} className={`h-12 rounded-xl overflow-hidden transition-all active:scale-95 ${edit.cover_theme === t.id && !edit.cover_url ? 'ring-2 ring-primary' : 'hover:opacity-90'}`} title={t.name} aria-label={`Theme ${t.name}`}>
                        <img src={t.url} alt={t.name} loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-subtle p-2.5">
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Avatar photo</p>
                    {edit.avatar_url && <img src={edit.avatar_url} alt="" className="w-full h-16 object-cover rounded-lg mb-1.5" />}
                    <div className="flex gap-1.5">
                      <button onClick={() => document.getElementById('edit-avatar-input')?.click()} disabled={savingEdit || uploadingAvatar} className="flex-1 px-2 py-2 rounded-lg bg-muted text-xs font-semibold disabled:opacity-50 min-h-[44px]">
                        {uploadingAvatar ? '…' : edit.avatar_url ? 'Change' : 'Upload'}
                      </button>
                      {edit.avatar_url && (
                        <button onClick={() => setEdit({ ...edit, avatar_url: '' })} disabled={savingEdit} className="px-2 py-2 rounded-lg text-xs text-destructive hover:bg-muted min-h-[44px]">X</button>
                      )}
                    </div>
                    <input id="edit-avatar-input" type="file" accept="image/*" className="hidden" hidden style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadChannelImage(f, 'avatar'); e.target.value = '' }} />
                  </div>
                  <div className="rounded-xl border border-subtle p-2.5">
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">Cover photo</p>
                    {edit.cover_url && <img src={edit.cover_url} alt="" className="w-full h-16 object-cover rounded-lg mb-1.5" />}
                    <div className="flex gap-1.5">
                      <button onClick={() => document.getElementById('edit-cover-input')?.click()} disabled={savingEdit || uploadingAvatar} className="flex-1 px-2 py-2 rounded-lg bg-muted text-xs font-semibold disabled:opacity-50 min-h-[44px]">
                        {uploadingAvatar ? '…' : edit.cover_url ? 'Change' : 'Upload'}
                      </button>
                      {edit.cover_url && (
                        <button onClick={() => setEdit({ ...edit, cover_url: '' })} disabled={savingEdit} className="px-2 py-2 rounded-lg text-xs text-destructive hover:bg-muted min-h-[44px]">X</button>
                      )}
                    </div>
                    <input id="edit-cover-input" type="file" accept="image/*" className="hidden" hidden style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadChannelImage(f, 'cover'); e.target.value = '' }} />
                  </div>
                </div>
              </div>
              {editError && <p className="text-xs text-destructive mt-2">{editError}</p>}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setEdit(null)} disabled={savingEdit} className="px-4 py-2.5 rounded-xl bg-muted text-sm font-medium disabled:opacity-50 min-h-[44px]">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={savingEdit || !edit.name.trim()} className="flex-1 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50 min-h-[44px]">
                  {savingEdit ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ═══════════ DISCOVER VIEW ═══════════ */
  return (
    <div className="h-full min-h-0 flex flex-col overflow-hidden" style={{ background: '#08081a' }}>
      {/* Header — new mock: hamburger, avatar, title, bell, menu, close */}
      <div className="px-4 pt-4 pb-1 flex items-center gap-3 shrink-0">
        <button onClick={onClose} className="text-slate-200 touch-44" aria-label="Menu">
          <Menu className="w-6 h-6" />
        </button>
        <div className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center text-white text-xl font-extrabold" style={{ background: 'linear-gradient(135deg,#a855f7,#22d3ee)', boxShadow: '0 4px 20px rgba(168,85,247,0.45)' }}>
          {channels[0]?.avatar_url ? <img src={channels[0].avatar_url} alt="" className="w-full h-full object-cover rounded-full" /> : channels[0]?.icon ? <span className="text-2xl">{channels[0].icon}</span> : 'K'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold text-[22px] tracking-tight flex items-center gap-2 text-white">
            Channels
            {channels.length > 0 && (
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ background: 'rgba(168,85,247,0.55)' }}>{channels.length}</span>
            )}
          </p>
          <p className="text-[13px] mt-0.5 truncate" style={{ color: '#9ca3af' }}>Discover. Follow. Be part of the conversation.</p>
        </div>
        <button onClick={() => setMsg('You are all caught up')} className="relative p-1 text-slate-200 touch-44" aria-label="Notifications">
          <Bell className="w-6 h-6" />
          <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 rounded-full" style={{ background: '#f472b6' }} />
        </button>
        <div className="relative">
          <button onClick={() => setMenuOpen((v) => !v)} className="p-1 text-slate-200 touch-44" aria-label="Channels menu">
            <MoreVertical className="w-6 h-6" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-52 rounded-xl border border-border bg-card kryzen-dropdown-glass shadow-2xl py-1 z-30 text-sm text-foreground overflow-hidden">
                <button onClick={() => { setWizard({ step: 1, name: '', desc: '', icon: '', cover_theme: '', avatar_url: '', cover_url: '' }); setMenuOpen(false) }} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
                  <Plus className="w-4 h-4" /> New channel
                </button>
                <button onClick={() => { setTab('all'); setMenuOpen(false) }} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
                  <LayoutGrid className="w-4 h-4" /> All channels
                </button>
                <button onClick={copyInviteLink} className="w-full text-left px-3 py-2 hover:bg-muted flex items-center gap-2">
                  <Link2 className="w-4 h-4" /> Copy invite link
                </button>
              </div>
            </>
          )}
        </div>
        <button onClick={onClose} className="w-10 h-10 rounded-full flex items-center justify-center text-slate-200 transition-all active:scale-95 touch-44" style={{ background: 'rgba(255,255,255,0.06)' }} aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-4 pt-2.5 shrink-0">
        <div className="flex items-center gap-2 pl-4 pr-2 py-2 rounded-full transition-colors" style={{ background: '#12122e', border: '1px solid rgba(168,85,247,0.25)' }}>
          <Search className="w-5 h-5 shrink-0" style={{ color: '#9ca3af' }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search channels..."
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px]"
            style={{ color: '#f0f0ff' }}
            aria-label="Search channels"
          />
          {query ? (
            <button onClick={() => setQuery('')} className="p-2 rounded-full hover:bg-white/10 touch-44" aria-label="Clear search">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          ) : (
            <button className="p-2 rounded-full hover:bg-white/10 touch-44" aria-label="Filter">
              <SlidersHorizontal className="w-5 h-5 text-slate-300" />
            </button>
          )}
        </div>
        {!q && (
          <div className="flex rounded-full p-1.5 mt-3 gap-1" style={{ background: '#12122e', border: '1px solid rgba(255,255,255,0.06)' }}>
            {([
              { id: 'discover', label: 'Discover', icon: Compass, count: channels.length },
              { id: 'following', label: 'Following', icon: Users, count: following.length },
              { id: 'all', label: 'All Channels', icon: LayoutGrid, count: 0 },
            ] as const).map((t) => {
              const Icon = t.icon
              const active = tab === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className="flex-1 py-2.5 min-h-[48px] rounded-full text-[14px] font-bold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap px-2"
                  style={active ? { background: 'linear-gradient(90deg,#3b82f6,#d946ef)', boxShadow: '0 4px 20px rgba(217,70,239,0.35), inset 0 -2px 0 rgba(34,211,238,0.8)', color: '#fff' } : { color: '#9ca3af' }}
                >
                  <Icon className="w-5 h-5 shrink-0" /> {t.label}
                  {t.count > 0 && (
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md" style={active ? { background: 'rgba(217,70,239,0.6)', color: '#fff' } : { background: 'rgba(168,85,247,0.3)', color: '#fff' }}>{t.count}</span>
                  )}
                </button>
              )
            })}
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
            <button onClick={() => setWizard({ step: 1, name: '', desc: '', icon: '', cover_theme: '', avatar_url: '', cover_url: '' })} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold shadow-lg transition-all active:scale-95">
              Create a channel
            </button>
          </div>
        ) : searched ? (
          <div className="px-3 pt-2">
            {searched.length === 0 ? (
              <div className="py-10 text-center px-8">
                <p className="text-[15px] font-semibold">Nothing matches “{query}”</p>
                <p className="text-[13px] text-muted-foreground mt-1">Try a different search — or start the channel yourself.</p>
                <button onClick={() => { setWizard({ step: 1, name: query, desc: '', icon: '', cover_theme: '', avatar_url: '', cover_url: '' }); setQuery('') }} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold transition-all active:scale-95">
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
        ) : tab === 'all' ? (
          <div className="px-4 pt-3 pb-6">
            <div className="flex items-center gap-2 pb-2.5">
              <LayoutGrid className="w-4 h-4 text-purple-300" />
              <p className="text-[15px] font-extrabold text-white">All Channels</p>
              <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md text-white" style={{ background: 'rgba(168,85,247,0.35)' }}>{channels.length}</span>
            </div>
            <div className="rounded-[20px] overflow-hidden" style={{ background: '#0d0d24', border: '1px solid rgba(255,255,255,0.06)' }}>
              {channels.map((c: any) => <ChannelRow key={c.id} c={c} />)}
            </div>
          </div>
        ) : (
          <div className="pt-3 space-y-5 pb-6">
            {/* HERO — Discover Amazing Communities & Creators */}
            <section className="px-4">
              <div className="relative rounded-[24px] overflow-hidden" style={{ border: '1px solid rgba(168,85,247,0.3)', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
                <img src={HERO_IMG} alt="" className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0" style={{ background: 'linear-gradient(90deg, rgba(8,8,26,0.92) 30%, rgba(8,8,26,0.45) 60%, rgba(8,8,26,0.15) 100%)' }} />
                <div className="relative p-5 min-h-[190px] flex flex-col justify-center">
                  <p className="text-[11px] font-extrabold uppercase tracking-[0.15em] text-orange-300 flex items-center gap-1.5">🔥 Featured</p>
                  <p className="text-[24px] leading-[1.15] font-extrabold text-white mt-1.5">Discover Amazing<br /><span style={{ background: 'linear-gradient(90deg,#c4b5fd,#f472b6)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Communities & Creators</span></p>
                  <p className="text-[13px] mt-1.5 max-w-[230px]" style={{ color: '#cbd5e1' }}>Join channels, meet new people, and be part of something great.</p>
                  <div className="flex items-end justify-between mt-3 gap-3">
                    <button onClick={() => document.getElementById('trending-channels')?.scrollIntoView({ behavior: 'smooth' })} className="px-5 py-2.5 rounded-full text-[14px] font-bold text-white flex items-center gap-2 transition-all active:scale-95" style={{ background: 'linear-gradient(90deg,#3b82f6,#e879f9)', boxShadow: '0 4px 20px rgba(217,70,239,0.4)' }}>
                      Explore Now <ArrowRight className="w-4 h-4" />
                    </button>
                    <div className="flex items-center gap-2">
                      <div className="flex -space-x-2">
                        {['#f472b6', '#22d3ee', '#a855f7', '#fb923c'].map((g, i) => (
                          <span key={i} className="w-7 h-7 rounded-full border-2 shrink-0" style={{ background: `linear-gradient(135deg, ${g}, #4f46e5)`, borderColor: 'rgba(8,8,26,0.9)' }} />
                        ))}
                      </div>
                      <div>
                        <p className="text-[13px] font-extrabold text-white leading-none">+12k</p>
                        <p className="text-[11px] mt-0.5 flex items-center gap-1" style={{ color: '#9ca3af' }}>active now <span className="w-1.5 h-1.5 rounded-full inline-block" style={{ background: '#22c55e' }} /></p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute bottom-3 right-4 flex gap-1.5">
                  <span className="w-5 h-1.5 rounded-full" style={{ background: '#c4b5fd' }} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.35)' }} />
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'rgba(255,255,255,0.35)' }} />
                </div>
              </div>
            </section>
            {featured.length > 0 && (
              <section id="trending-channels">
                <div className="flex items-center justify-between px-4 pb-2.5">
                  <div className="flex items-center gap-2">
                    <Rocket className="w-5 h-5 text-pink-300" />
                    <p className="text-[17px] font-extrabold text-white">Trending Channels</p>
                  </div>
                  <button onClick={() => setTab('all')} className="text-[14px] font-semibold text-purple-400 flex items-center gap-1">
                    View all <span>→</span>
                  </button>
                </div>
                <div className="flex gap-4 overflow-x-auto px-4 pb-2 snap-x no-scrollbar">
                  {[...featured, ...trendingRows.slice(0, 2)].map((c: any, idx: number) => {
                    const isFeatured = idx < featured.length
                    const cardCover = coverImageOf(c)
                    const cIcon = channelIcon(c)
                    const canOpen = c.followed || c.is_owner
                    const created = c.created_at && asDate(c.created_at)
                      ? asDate(c.created_at)!.toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
                      : '—'
                    return (
                      <div
                        key={c.id}
                        onClick={() => open(c)}
                        role={canOpen ? 'button' : undefined}
                        tabIndex={canOpen ? 0 : undefined}
                        onKeyDown={(e) => { if (canOpen && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); open(c) } }}
                        aria-label={canOpen ? `Open ${c.name}` : undefined}
                        className="snap-start shrink-0 w-[240px] rounded-[20px] overflow-hidden transition-all active:scale-[0.98]"
                        style={{ background: '#0d0d24', border: `1px solid ${isFeatured ? 'rgba(168,85,247,0.4)' : 'rgba(52,211,153,0.35)'}`, boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }}
                      >
                        <div className="relative h-28 overflow-hidden" style={{ backgroundImage: `url(${cardCover})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                          <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(0,0,0,0.1), rgba(13,13,36,0.55))' }} />
                          {isFeatured && (
                            <span className="absolute top-2.5 left-2.5 w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(168,85,247,0.55)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.2)' }}>
                              <Crown className="w-4 h-4 text-amber-300" fill="currentColor" />
                            </span>
                          )}
                          <button
                            onClick={(e) => { e.stopPropagation(); setMenuOpen(false) }}
                            className="absolute top-2.5 right-2.5 w-8 h-8 rounded-full flex items-center justify-center text-white"
                            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(10px)' }}
                            aria-label="More options"
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                        <div className="px-3.5 pb-3.5">
                          <div className="flex items-center gap-2.5 -mt-7 mb-1">
                            <div className="relative shrink-0">
                              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-white text-xl font-extrabold shadow-xl overflow-hidden" style={{ border: '3px solid #0d0d24' }}>
                                {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : cIcon ? <span className="text-2xl">{cIcon}</span> : avatarLetter(c.name)}
                              </div>
                              <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center" style={{ background: '#0ea5e9' }}>
                                <BadgeCheck className="w-3.5 h-3.5 text-white" fill="currentColor" />
                              </span>
                            </div>
                          </div>
                          <p className="text-[16px] font-extrabold truncate tracking-tight flex items-center gap-1 text-white">
                            <span className="truncate">{c.name}</span>
                            <BadgeCheck className="w-4 h-4 text-sky-400 shrink-0" fill="currentColor" />
                          </p>
                          <p className="text-[13px] truncate" style={{ color: '#9ca3af' }}>{(c.description || '').split('\n')[0] || 'Build. Share. Grow.'}</p>
                          <div className="flex items-center gap-3 mt-2.5 text-[12px] font-bold text-white">
                            <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" style={{ color: '#f472b6' }} /> {compact(c.follower_count ?? 0)}</span>
                            <span className="flex items-center gap-1"><MessageSquare className="w-3.5 h-3.5" style={{ color: '#9ca3af' }} /> {c.post_count ?? 0}</span>
                            <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" style={{ color: '#9ca3af' }} /> {created}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-[11px]" style={{ color: '#6b7280' }}>
                            <span>Followers</span><span>Posts</span><span>Created</span>
                          </div>
                          {!c.is_owner && !c.followed ? (
                            <button onClick={(e) => { e.stopPropagation(); follow(c.id, true) }} className="w-full mt-3 py-2.5 rounded-full text-[14px] font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-[0.98]" style={{ background: 'linear-gradient(90deg,#3b82f6,#8b5cf6)' }}>
                              <Users className="w-4 h-4" /> Follow
                            </button>
                          ) : (
                            <button onClick={(e) => { e.stopPropagation(); if (!c.is_owner) follow(c.id, false) }} className="w-full mt-3 py-2.5 rounded-full text-[14px] font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98]" style={c.is_owner ? { background: 'rgba(168,85,247,0.15)', border: '1px solid rgba(168,85,247,0.4)', color: '#c4b5fd' } : { background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#6ee7b7' }}>
                              <Check className="w-4 h-4" /> {c.is_owner ? 'Owner' : 'Following'}
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}
            {/* Categories — Popular Right Now */}
            <section>
              <div className="flex items-center gap-2 px-4 pb-2.5">
                <Flame className="w-5 h-5 text-pink-400" fill="currentColor" />
                <p className="text-[17px] font-extrabold text-white">Popular Right Now</p>
              </div>
              <div className="flex gap-2.5 overflow-x-auto px-4 pb-1 no-scrollbar">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon
                  const active = activeCat === cat.id
                  return (
                    <button
                      key={cat.id}
                      onClick={() => {
                        if (active) { setActiveCat(null); setQuery('') }
                        else { setActiveCat(cat.id); setQuery(cat.label.split(' ')[0]) }
                      }}
                      className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-bold transition-all active:scale-95"
                      style={active ? { background: 'linear-gradient(90deg,#3b82f6,#d946ef)', color: '#fff' } : { background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: cat.color }}
                    >
                      <Icon className="w-4 h-4" /> <span style={{ color: active ? '#fff' : '#cbd5e1' }}>{cat.label}</span>
                    </button>
                  )
                })}
                <button onClick={() => setTab('all')} className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-slate-300" style={{ background: 'rgba(255,255,255,0.05)' }} aria-label="More categories">
                  <ChevronRight className="w-5 h-5" />
                </button>
              </div>
            </section>
            {restChannels.length > 0 && (
            <section id="all-channels">
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
              {wizard.step === 1 ? '01 · Name & icon' : wizard.step === 2 ? '02 · Theme & details' : '03 · Review'}
            </p>
            {wizard.step === 1 && (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-white text-xl font-extrabold shrink-0 shadow-lg overflow-hidden">
                    {wizard.avatar_url ? <img src={wizard.avatar_url} alt="" className="w-full h-full object-cover" /> : wizard.icon ? <span className="text-2xl">{wizard.icon}</span> : avatarLetter(wizard.name || '?')}
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
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Icon — pick an emoji</p>
                  <div className="grid grid-cols-8 gap-1.5">
                    {CHANNEL_ICONS.map((em) => (
                      <button key={em} onClick={() => setWizard({ ...wizard, icon: wizard.icon === em ? '' : em })} className={`text-xl p-1.5 rounded-lg transition-all active:scale-90 min-h-[44px] ${wizard.icon === em ? 'ring-2 ring-primary' : 'hover:bg-muted'}`} style={wizard.icon === em ? { background: 'rgba(var(--accent-rgb),0.15)' } : undefined} aria-label={`Icon ${em}`}>
                        {em}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => document.getElementById('wizard-avatar-input')?.click()} disabled={uploadingAvatar} className="px-3 py-2 rounded-xl bg-muted text-xs font-semibold disabled:opacity-50 min-h-[44px]">
                    {uploadingAvatar ? 'Uploading…' : wizard.avatar_url ? 'Change photo' : 'Upload photo'}
                  </button>
                  {wizard.avatar_url && (
                    <button onClick={() => setWizard({ ...wizard, avatar_url: '' })} className="px-3 py-2 rounded-xl text-xs text-destructive hover:bg-muted min-h-[44px]">Remove</button>
                  )}
                  <input id="wizard-avatar-input" type="file" accept="image/*" className="hidden" hidden style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadChannelImage(f, 'avatar'); e.target.value = '' }} />
                </div>
              </div>
            )}
            {wizard.step === 2 && (
              <div className="space-y-3">
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
                <div>
                  <p className="text-xs font-semibold text-muted-foreground mb-1.5">Cover theme — image</p>
                  <div className="grid grid-cols-4 gap-2">
                    {CHANNEL_THEMES.map((t) => (
                      <button key={t.id} onClick={() => setWizard({ ...wizard, cover_theme: wizard.cover_theme === t.id ? '' : t.id, cover_url: '' })} className={`h-14 rounded-xl overflow-hidden transition-all active:scale-95 ${wizard.cover_theme === t.id && !wizard.cover_url ? 'ring-2 ring-primary' : 'hover:opacity-90'}`} title={t.name} aria-label={`Theme ${t.name}`}>
                        <img src={t.url} alt={t.name} loading="lazy" className="w-full h-full object-cover" />
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => document.getElementById('wizard-cover-input')?.click()} disabled={uploadingAvatar} className="px-3 py-2 rounded-xl bg-muted text-xs font-semibold disabled:opacity-50 min-h-[44px]">
                    {uploadingAvatar ? 'Uploading…' : wizard.cover_url ? 'Change cover' : 'Upload cover'}
                  </button>
                  {wizard.cover_url && (
                    <button onClick={() => setWizard({ ...wizard, cover_url: '' })} className="px-3 py-2 rounded-xl text-xs text-destructive hover:bg-muted min-h-[44px]">Remove</button>
                  )}
                  <input id="wizard-cover-input" type="file" accept="image/*" className="hidden" hidden style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadChannelImage(f, 'cover'); e.target.value = '' }} />
                </div>
                {wizard.cover_url && <img src={wizard.cover_url} alt="" className="w-full h-20 object-cover rounded-xl" />}
              </div>
            )}
            {wizard.step === 3 && (
              <div className="rounded-2xl bg-elevated border border-subtle overflow-hidden">
                <div className="h-16" style={{ backgroundImage: `url(${wizard.cover_url || (wizard.cover_theme ? (CHANNEL_THEMES.find((x) => x.id === wizard.cover_theme)?.url || CHANNEL_THEMES[0].url) : CHANNEL_THEMES[0].url)})`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
                <div className="p-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0 overflow-hidden">
                    {wizard.avatar_url ? <img src={wizard.avatar_url} alt="" className="w-full h-full object-cover" /> : wizard.icon ? <span className="text-2xl">{wizard.icon}</span> : avatarLetter(wizard.name || '?')}
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold truncate">{wizard.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{wizard.desc || 'No description'}</p>
                    <p className="text-[11px] text-tertiary mt-0.5">One-way feed · only you can post</p>
                  </div>
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
    const cIcon = channelIcon(c)
    return (
      <div className="flex items-center gap-3 px-1 py-2.5 border-b border-[var(--k-border)]/60 last:border-0">
        <button onClick={() => open(c)} disabled={!canOpen} className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0 disabled:cursor-default shadow ring-2 ring-[var(--k-border)] transition-transform active:scale-95 overflow-hidden">
          {c.avatar_url ? <img src={c.avatar_url} alt="" className="w-full h-full object-cover" /> : cIcon ? <span className="text-xl">{cIcon}</span> : avatarLetter(c.name)}
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
