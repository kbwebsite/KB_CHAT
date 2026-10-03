import { useEffect, useRef, useState } from 'react'
import {
  Plus,
  Send,
  Trash2,
  X,
  Check,
  ArrowLeft,
  Users,
  FileText,
  ChevronRight,
} from 'lucide-react'
import { channelApi } from '../services/api'

/**
 * Channels (WhatsApp-style): one-way broadcast feeds. Owners post updates;
 * anyone can discover and follow a channel, followers read the feed.
 * Clean premium design: hairline dividers, refined type, subtle accents.
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
  const [msg, setMsg] = useState<string | null>(null)
  const composerRef = useRef<HTMLInputElement>(null)

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
    // Focus after scroll so mobile keyboards open over the right spot.
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
  }

  const open = async (c: any) => {
    if (!(c.followed || c.is_owner)) return
    setOpenId(c.id)
    setPostsLoading(true)
    try {
      const r = await channelApi.posts(c.id)
      if (r?.success) setPosts(r.data || [])
      else setMsg(r?.message || 'Failed to load posts')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed to load posts')
    } finally {
      setPostsLoading(false)
    }
  }

  const post = async (id: number) => {
    const content = draft.trim()
    if (!content || sending) return
    setSending(true)
    try {
      const r = await channelApi.post(id, content)
      if (r?.success) {
        setPosts((p) => [...p, r.data])
        setDraft('')
        refreshOne(id)
      } else setMsg(r?.message || 'Failed')
    } catch (e: any) {
      setMsg(e.response?.data?.message || e.response?.data?.detail || 'Failed')
    } finally {
      setSending(false)
    }
  }

  const openChannel = channels.find((c) => c.id === openId)

  const avatarLetter = (n: string) => (n || '?')[0].toUpperCase()

  const fmtTime = (iso?: string) => {
    if (!iso) return ''
    // Backend sends naive UTC datetimes; interpret them as UTC, not local.
    const normalized = /[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`
    const d = new Date(normalized)
    const diff = Date.now() - d.getTime()
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center gap-1.5 px-2 py-2 border-b border-[var(--k-border)] shrink-0">
        {openChannel ? (
          <>
            <button onClick={() => { setOpenId(null); setPosts([]) }} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back to channels">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <p className="font-semibold text-[15px] flex-1 truncate">Channel</p>
          </>
        ) : (
          <>
            <p className="font-bold text-[17px] flex-1 px-2 tracking-tight">
              Channels
              {channels.length > 0 && (
                <span className="ml-2 text-xs font-semibold text-tertiary align-middle">{channels.length}</span>
              )}
            </p>
            <button onClick={() => setShowCreate((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="New channel">
              <Plus className="w-5 h-5" />
            </button>
          </>
        )}
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {msg && <p className="px-4 py-2 text-xs text-muted-foreground border-b border-[var(--k-border)]">{msg}</p>}

      {openChannel ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            {/* Clean profile block */}
            <div className="px-4 pt-4 pb-3.5 border-b border-[var(--k-border)]">
              <div className="flex items-center gap-3.5">
                <div className="w-16 h-16 rounded-[20px] gradient-primary flex items-center justify-center text-white text-2xl font-extrabold shadow-lg shrink-0">
                  {avatarLetter(openChannel.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-[17px] tracking-tight flex items-center gap-1.5 truncate">
                    <span className="truncate">{openChannel.name}</span>
                    {openChannel.is_owner && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </p>
                  <p className="text-[13px] text-secondary mt-0.5 truncate">
                    {openChannel.description || 'No description yet'}
                  </p>
                  <p className="text-xs text-tertiary mt-1 flex items-center gap-2">
                    <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5" />{openChannel.follower_count ?? 0}</span>
                    <span className="opacity-50">·</span>
                    <span className="flex items-center gap-1"><FileText className="w-3.5 h-3.5" />{openChannel.post_count ?? 0}</span>
                  </p>
                </div>
              </div>
              {!openChannel.is_owner ? (
                <button
                  onClick={() => follow(openChannel.id, !openChannel.followed)}
                  className={openChannel.followed
                    ? 'mt-3 w-full py-2 rounded-full border border-subtle text-secondary text-sm font-semibold'
                    : 'mt-3 w-full py-2 rounded-full btn-primary text-sm font-semibold'}
                >
                  {openChannel.followed ? 'Following' : 'Follow channel'}
                </button>
              ) : (
                <p className="mt-2.5 text-xs text-tertiary">You own this channel — only you can post.</p>
              )}
            </div>

            {postsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading posts…</p>
            ) : posts.length === 0 ? (
              <div className="py-12 text-center px-8">
                <p className="text-[15px] font-semibold">No posts yet</p>
                <p className="text-[13px] text-muted-foreground mt-1">
                  {openChannel.is_owner ? 'Share the first update with your followers.' : 'New updates will appear here.'}
                </p>
                {openChannel.is_owner && (
                  <button onClick={focusComposer} className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold">
                    Post your first update
                  </button>
                )}
              </div>
            ) : (
              <div className="px-3.5 py-3">
                <p className="px-1 pb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-tertiary">Updates</p>
                <div className="space-y-2.5">
                  {posts.map((p: any, i: number) => (
                    <article key={p.id} className="rounded-[18px] bg-elevated border border-subtle p-4">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="w-8 h-8 rounded-full gradient-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {avatarLetter(p.sender_display_name || p.sender_username || openChannel.name)}
                        </div>
                        <p className="min-w-0 flex-1 text-[13px] truncate">
                          <span className="font-semibold">{p.sender_display_name || p.sender_username || openChannel.name}</span>
                          <span className="text-tertiary"> · {fmtTime(p.created_at)}</span>
                        </p>
                        {i === 0 && (
                          <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary" />New
                          </span>
                        )}
                      </div>
                      <p className="text-[15px] leading-[1.55] whitespace-pre-wrap break-words">{p.content}</p>
                    </article>
                  ))}
                </div>
              </div>
            )}
          </div>
          {openChannel.is_owner && (
            <div className="channel-composer p-3 border-t border-[var(--k-border)] flex gap-2 shrink-0">
              <input
                ref={composerRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') post(openChannel.id) }}
                placeholder="Post an update…"
                className="flex-1 px-4 py-2.5 rounded-full border outline-none text-[15px]"
                style={fieldStyle}
              />
              <button onClick={() => post(openChannel.id)} disabled={sending || !draft.trim()} className="w-11 h-11 rounded-full btn-primary disabled:opacity-50 flex items-center justify-center shrink-0" aria-label="Post">
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
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
              <p className="text-[15px] font-semibold">No channels yet</p>
              <p className="text-[13px] text-muted-foreground mt-1">Create the first one with + above.</p>
            </div>
          ) : (
            channels.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3 border-b border-[var(--k-border)]">
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="w-12 h-12 rounded-[14px] gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0 disabled:cursor-default shadow">
                  {avatarLetter(c.name)}
                </button>
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="flex-1 min-w-0 text-left disabled:cursor-default">
                  <p className="text-[15px] font-semibold flex items-center gap-1 truncate tracking-tight">
                    <span className="truncate">{c.name}</span>
                    {c.is_owner && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </p>
                  <p className="text-[13px] text-muted-foreground truncate mt-px">
                    {c.description || `${c.follower_count ?? 0} followers`}
                  </p>
                  {c.description && (
                    <p className="text-xs text-tertiary mt-px">{c.follower_count ?? 0} followers · {c.post_count ?? 0} posts</p>
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
                {(c.followed || c.is_owner) && (
                  <ChevronRight className="w-4 h-4 text-tertiary shrink-0 opacity-60" />
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
