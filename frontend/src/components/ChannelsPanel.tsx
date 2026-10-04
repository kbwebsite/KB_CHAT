import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  Send,
  Trash2,
  X,
  ArrowLeft,
  Check,
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
  Eye,
  Users,
  FileText,
  ChevronsDown,
  QrCode,
} from 'lucide-react'
import { channelApi, uploadApi } from '../services/api'

/**
 * Channels — WhatsApp channel-feed structure:
 * header (avatar, name + verified, followers, mute/link/menu),
 * dismissible description banner, date pills, media+text post cards
 * with forward + time footer, WA-style composer.
 */
export function ChannelsPanel({ onClose }: { onClose: () => void }) {
  const [channels, setChannels] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState('')
  const [desc, setDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [showCreate, setShowCreate] = useState(false)
  const [openId, setOpenId] = useState<number | null>(null)
  const [posts, setPosts] = useState<any[]>([])
  const [postsLoading, setPostsLoading] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [muted, setMuted] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [showEmoji, setShowEmoji] = useState(false)
  const [showJump, setShowJump] = useState(false)
  const composerRef = useRef<HTMLInputElement>(null)
  const feedRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // Inline input styling: immune to Bootstrap utility conflicts, always
  // dark surface with light text (mirrors the main chat composer).
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

  const load = () => {
    channelApi
      .list()
      .then((r: any) => {
        if (r?.success) setChannels(r.data || [])
      })
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

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
    if (!name.trim()) return setMsg('Name your channel first')
    setCreating(true)
    try {
      const r = await channelApi.create({ name: name.trim(), description: desc.trim() || undefined })
      if (r?.success) {
        setChannels((l) => [r.data, ...l])
        setName('')
        setDesc('')
        setShowCreate(false)
        setMsg('Channel created')
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
    const shareData = { title: openChannel?.name || 'Channel post', text }
    try {
      if (navigator.share) {
        await navigator.share(shareData)
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

  const formatFollowers = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
    return `${n ?? 0}`
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

  const fmtRowDate = (iso?: string) => {
    const d = asDate(iso)
    if (!d) return ''
    const now = new Date()
    const sameDay = d.toDateString() === now.toDateString()
    if (sameDay) return fmtPostTime(iso)
    const y = new Date(now)
    y.setDate(now.getDate() - 1)
    if (d.toDateString() === y.toDateString()) return 'Yesterday'
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
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
    // Collapse leftover blank lines from stripping image URLs.
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

  const EMOJIS = ['😀', '😂', '😍', '👍', '🙏', '🎉', '❤️', '🔥']

  return (
    <div className="h-full flex flex-col bg-card">
      {/* ── List header ─────────────────────────────────────────── */}
      {!openChannel && (
        <div className="flex items-center gap-1.5 px-2 py-2 border-b border-[var(--k-border)] shrink-0">
          <p className="font-bold text-[17px] flex-1 px-2 tracking-tight">
            Channels
            {channels.length > 0 && (
              <span className="ml-2 text-xs font-semibold text-tertiary align-middle">{channels.length}</span>
            )}
          </p>
          <button onClick={() => setShowCreate((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="New channel">
            <Plus className="w-5 h-5" />
          </button>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* ── Channel header (WhatsApp style) ─────────────────────── */}
      {openChannel && (
        <div className="flex items-center gap-2.5 px-2 py-1.5 border-b border-[var(--k-border)] shrink-0">
          <button onClick={backToList} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back to channels">
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
              {formatFollowers(openChannel.follower_count ?? 0)} followers
              {openChannel.is_owner ? ' · you own this channel' : ''}
            </p>
          </div>
          <button
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-full hover:bg-muted transition-colors text-secondary"
            aria-label={muted ? 'Unmute channel' : 'Mute channel'}
            title={muted ? 'Unmute' : 'Mute'}
          >
            {muted ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
          </button>
          <div className="relative">
            <button onClick={() => setMenuOpen((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Channel menu">
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
        </div>
      )}

      {msg && !openChannel && (
        <p className="px-4 py-2 text-xs text-muted-foreground border-b border-[var(--k-border)]">{msg}</p>
      )}

      {/* ── Open channel: feed ──────────────────────────────────── */}
      {openChannel ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div
            ref={feedRef}
            onScroll={onFeedScroll}
            className="flex-1 overflow-y-auto min-h-0 relative"
            style={{
              background:
                'radial-gradient(ellipse at 20% 0%, rgba(var(--accent-rgb), 0.10) 0%, transparent 55%), radial-gradient(ellipse at 85% 30%, rgba(var(--cyan-rgb), 0.06) 0%, transparent 50%), var(--bg-primary)',
            }}
          >
            {/* Cover art + profile card */}
            <div
              className="m-3 rounded-[24px] overflow-hidden border border-subtle"
              style={{
                background: 'linear-gradient(180deg, rgba(34,34,68,0.98), rgba(20,20,42,0.98))',
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
              }}
            >
              <div className="channel-cover-art relative h-24 overflow-hidden">
                <span className="absolute -right-2 -bottom-7 text-[110px] leading-none font-extrabold text-white/10 select-none">
                  {avatarLetter(openChannel.name)}
                </span>
                <div className="absolute w-40 h-40 rounded-full bg-white/10 blur-2xl -left-10 -top-16" />
                <div className="absolute w-24 h-24 rounded-full bg-black/20 blur-xl right-16 -top-8" />
              </div>
              <div className="px-4 pt-3 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 rounded-2xl gradient-primary flex items-center justify-center text-white text-xl font-extrabold shadow-lg shrink-0 ring-2 ring-white/10">
                    {avatarLetter(openChannel.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-[17px] tracking-tight flex items-center gap-1.5 truncate">
                      <span className="truncate">{openChannel.name}</span>
                      {openChannel.is_owner && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
                    </p>
                    <p className="text-[13px] text-secondary mt-0.5 truncate">
                      {openChannel.description || 'No description yet'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 mt-2.5">
                  <span className="text-[11px] text-tertiary flex items-center gap-1">
                    <Users className="w-3 h-3" />{formatFollowers(openChannel.follower_count ?? 0)} followers
                  </span>
                  <span className="text-[11px] text-tertiary flex items-center gap-1">
                    <FileText className="w-3 h-3" />{openChannel.post_count ?? 0} posts
                  </span>
                  <span className="flex-1" />
                  {!openChannel.is_owner ? (
                    <button
                      onClick={() => follow(openChannel.id, !openChannel.followed)}
                      className={openChannel.followed
                        ? 'px-4 py-1.5 rounded-full bg-muted text-secondary text-xs font-semibold'
                        : 'px-4 py-1.5 rounded-full gradient-primary text-white text-xs font-semibold shadow'}
                    >
                      {openChannel.followed ? 'Following' : 'Follow'}
                    </button>
                  ) : (
                    <span className="text-[10px] font-bold uppercase tracking-wider text-primary border border-subtle px-2.5 py-1 rounded-full">
                      Owner
                    </span>
                  )}
                </div>
              </div>
            </div>

            {msg && <p className="px-4 pt-2 text-xs text-muted-foreground">{msg}</p>}

            {postsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading posts…</p>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center px-8">
                <div className="w-16 h-16 rounded-full gradient-primary flex items-center justify-center text-white text-2xl font-extrabold mx-auto shadow-lg">
                  {avatarLetter(openChannel.name)}
                </div>
                <p className="text-[15px] font-semibold mt-3">No posts yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {openChannel.is_owner ? 'Share the first update with your followers.' : 'New updates will appear here.'}
                </p>
                {openChannel.is_owner && (
                  <button onClick={focusComposer} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold shadow-lg">
                    Post your first update
                  </button>
                )}
              </div>
            ) : (
              <div className="px-3 py-2 pb-6">
                {grouped.map((g) => (
                  <div key={g.key}>
                    {/* Date pill */}
                    <div className="flex justify-center my-4">
                      <span
                        className="px-4 py-1.5 rounded-full text-[11px] font-bold tracking-[0.08em] text-primary border border-subtle"
                        style={{ background: 'rgba(28,28,56,0.9)', boxShadow: '0 2px 12px rgba(0,0,0,0.4)' }}
                      >
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
                              {/* Channel identity row */}
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
                                  <span className="text-[10px] font-bold uppercase tracking-wider text-white gradient-primary px-2.5 py-1 rounded-full shrink-0 shadow">
                                    New
                                  </span>
                                )}
                              </div>
                              {/* Media */}
                              {imgs.length > 0 && (
                                <div className="mt-2.5 bg-black/40">
                                  {imgs.map((u) => (
                                    <a key={u} href={u} target="_blank" rel="noreferrer">
                                      <img src={u} alt="" loading="lazy" className="w-full max-h-80 object-cover" />
                                    </a>
                                  ))}
                                </div>
                              )}
                              {/* Caption */}
                              {text ? (
                                <div className="px-3.5 pt-2.5 pb-1">
                                  <p className="text-[15px] leading-[1.6] whitespace-pre-wrap break-words">
                                    {renderRichText(text)}
                                  </p>
                                </div>
                              ) : (
                                <div className="h-1.5" />
                              )}
                              {/* Meta footer */}
                              <div className="px-3 pb-2.5 pt-1 flex items-center gap-1">
                                <button
                                  onClick={() => forwardPost(p)}
                                  className="w-8 h-8 rounded-full hover:bg-muted flex items-center justify-center text-tertiary hover:text-primary transition-colors"
                                  aria-label="Forward post"
                                  title="Forward / share"
                                >
                                  <Forward className="w-4 h-4" />
                                </button>
                                <span className="flex-1" />
                                <span className="flex items-center gap-1 text-[11px] text-tertiary">
                                  <Eye className="w-3.5 h-3.5" />
                                  {formatFollowers(openChannel.follower_count ?? 0)}
                                </span>
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

          {/* Jump to latest */}
          {showJump && (
            <button
              onClick={() => scrollFeedToBottom(true)}
              className="absolute bottom-24 right-4 w-10 h-10 rounded-full bg-elevated border border-subtle shadow-xl flex items-center justify-center text-secondary z-10"
              aria-label="Jump to latest"
            >
              <ChevronsDown className="w-5 h-5" />
            </button>
          )}

          {/* ── WA-style composer ─────────────────────────────── */}
          {openChannel.is_owner ? (
            <div className="shrink-0 px-2.5 pt-1.5 channel-composer">
              {showEmoji && (
                <div className="flex gap-1.5 px-1 pb-2">
                  {EMOJIS.map((e) => (
                    <button
                      key={e}
                      onClick={() => setDraft((d) => d + e)}
                      className="text-xl p-1.5 rounded-lg hover:bg-muted"
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex items-center gap-1.5">
                <div
                  className="flex-1 flex items-center gap-1 rounded-full border px-1.5 py-1 transition-shadow focus-within:border-primary/60"
                  style={{ ...fieldStyle, boxShadow: '0 4px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.04)' }}
                >
                  <button onClick={() => setShowEmoji((v) => !v)} className="p-2 rounded-full text-tertiary hover:text-secondary" aria-label="Emoji">
                    <Smile className="w-5 h-5" />
                  </button>
                  <input
                    ref={composerRef}
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') post(openChannel.id) }}
                    placeholder="Write an update…"
                    className="flex-1 min-w-0 bg-transparent outline-none text-[15px] py-1.5"
                    style={{ color: '#f0f0ff', caretColor: '#f0f0ff' }}
                  />
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="p-2 rounded-full text-tertiary hover:text-secondary disabled:opacity-40" aria-label="Attach">
                    <Paperclip className="w-5 h-5" />
                  </button>
                  <button onClick={() => fileRef.current?.click()} disabled={uploading} className="p-2 rounded-full text-tertiary hover:text-secondary disabled:opacity-40" aria-label="Photo">
                    <Camera className="w-5 h-5" />
                  </button>
                </div>
                {draft.trim() || uploading ? (
                  <button
                    onClick={() => post(openChannel.id)}
                    disabled={sending || uploading || !draft.trim()}
                    className="w-12 h-12 rounded-full btn-primary disabled:opacity-50 flex items-center justify-center shrink-0 shadow-lg"
                    aria-label="Post"
                    style={{ boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.45)' }}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    onClick={focusComposer}
                    className="w-12 h-12 rounded-full bg-white text-black flex items-center justify-center shrink-0"
                    aria-label="Voice note"
                    title="Voice notes coming soon"
                  >
                    <Mic className="w-5 h-5" />
                  </button>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              {uploading && <p className="text-[11px] text-tertiary px-2 pt-1">Uploading media…</p>}
            </div>
          ) : (
            <div className="shrink-0 p-3 border-t border-[var(--k-border)]">
              {!openChannel.followed ? (
                <button onClick={() => follow(openChannel.id, true)} className="w-full py-2.5 rounded-full btn-primary text-sm font-semibold">
                  Follow channel
                </button>
              ) : (
                <p className="text-xs text-tertiary text-center">You follow this channel — only the owner can post.</p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* ── Discover list ─────────────────────────────────────── */
        <div className="flex-1 overflow-y-auto min-h-0">
          <div className="px-3 pt-2 pb-1 flex items-center gap-2">
            <Search className="w-4 h-4 text-tertiary" />
            <p className="text-xs text-tertiary">Discover channels to follow, or create your own.</p>
          </div>
          {showCreate && (
            <div className="m-3 rounded-[18px] bg-elevated border border-subtle p-4 space-y-2.5">
              <p className="text-[15px] font-bold tracking-tight">New channel</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Channel name"
                className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm"
                style={fieldStyle}
              />
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What is it about? (optional)"
                className="w-full px-4 py-2.5 rounded-xl border outline-none text-sm"
                style={fieldStyle}
              />
              <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50">
                {creating ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading channels…</p>
          ) : channels.length === 0 && !showCreate ? (
            <div className="py-12 text-center px-8">
              <QrCode className="w-8 h-8 mx-auto text-tertiary mb-2" />
              <p className="text-[15px] font-semibold">No channels yet</p>
              <p className="text-[13px] text-muted-foreground mt-1">Create the first one with + above.</p>
            </div>
          ) : (
            channels.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-border)]">
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0 disabled:cursor-default shadow ring-2 ring-[var(--k-border)]">
                  {avatarLetter(c.name)}
                </button>
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="flex-1 min-w-0 text-left disabled:cursor-default">
                  <p className="text-[15px] font-semibold flex items-center gap-1 truncate tracking-tight">
                    <span className="truncate">{c.name}</span>
                    {c.is_owner && <BadgeCheck className="w-4 h-4 text-sky-500 shrink-0" />}
                  </p>
                  <p className="text-[13px] text-muted-foreground truncate mt-px">
                    {c.description || `${formatFollowers(c.follower_count ?? 0)} followers`}
                  </p>
                  {c.description && (
                    <p className="text-xs text-tertiary mt-px">
                      {formatFollowers(c.follower_count ?? 0)} followers · {c.post_count ?? 0} posts · {fmtRowDate(c.created_at)}
                    </p>
                  )}
                </button>
                {!c.is_owner ? (
                  <button
                    onClick={() => follow(c.id, !c.followed)}
                    className={c.followed
                      ? 'px-3.5 py-1.5 rounded-full border border-subtle text-secondary text-[13px] font-semibold shrink-0'
                      : 'px-3.5 py-1.5 rounded-full btn-primary text-[13px] font-semibold shrink-0'}
                  >
                    {c.followed ? 'Following' : 'Follow'}
                  </button>
                ) : (
                  <button onClick={() => remove(c.id)} className="p-2 rounded-full hover:bg-muted transition-colors text-tertiary shrink-0" aria-label="Delete channel">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
