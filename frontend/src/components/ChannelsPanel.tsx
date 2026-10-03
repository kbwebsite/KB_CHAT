import { useEffect, useState } from 'react'
import {
  Radio,
  Plus,
  Send,
  Trash2,
  X,
  Check,
  ArrowLeft,
  Users,
  FileText,
  Megaphone,
} from 'lucide-react'
import { channelApi } from '../services/api'

/**
 * Channels (WhatsApp-style): one-way broadcast feeds. Owners post updates;
 * anyone can discover and follow a channel, followers read the feed.
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
    const d = new Date(iso)
    const diff = Date.now() - d.getTime()
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b border-[var(--k-border)] shrink-0">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          {openChannel ? (
            <>
              <button onClick={() => { setOpenId(null); setPosts([]) }} className="p-1.5 rounded-full hover:bg-muted transition-colors" aria-label="Back to channels">
                <ArrowLeft className="w-4 h-4" />
              </button>
              <span className="truncate max-w-[180px]">{openChannel.name}</span>
            </>
          ) : (
            <>
              <Radio className="w-4 h-4 text-primary" /> Channels
            </>
          )}
        </h2>
        <div className="flex items-center gap-1">
          {!openChannel && (
            <button onClick={() => setShowCreate((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="New channel">
              <Plus className="w-4 h-4" />
            </button>
          )}
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {msg && <p className="px-4 py-2 text-xs text-center text-secondary">{msg}</p>}

      {openChannel ? (
        <div className="flex-1 flex flex-col min-h-0">
          {/* Channel hero */}
          <div className="shrink-0">
            <div className="h-20 kryzen-accent-gradient opacity-90" />
            <div className="px-4 -mt-8">
              <div className="w-16 h-16 rounded-2xl gradient-primary flex items-center justify-center text-white text-2xl font-extrabold shadow-lg ring-4 ring-[var(--bg-card)]">
                {avatarLetter(openChannel.name)}
              </div>
            </div>
            <div className="px-4 pt-2 pb-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-bold flex items-center gap-1.5 truncate">
                  <span className="truncate">{openChannel.name}</span>
                  {openChannel.is_owner && <Check className="w-4 h-4 text-primary shrink-0" />}
                </p>
                <p className="text-[11px] text-tertiary mt-0.5">
                  {openChannel.follower_count ?? 0} followers · {openChannel.post_count ?? 0} posts
                </p>
                {openChannel.description && (
                  <p className="text-xs text-secondary leading-relaxed mt-1">{openChannel.description}</p>
                )}
              </div>
              {!openChannel.is_owner && (
                <button
                  onClick={() => follow(openChannel.id, !openChannel.followed)}
                  className={openChannel.followed
                    ? 'px-4 py-1.5 rounded-full bg-muted text-secondary text-xs font-semibold shrink-0'
                    : 'px-4 py-1.5 rounded-full gradient-primary text-white text-xs font-semibold shadow shrink-0'}
                >
                  {openChannel.followed ? 'Following' : 'Follow'}
                </button>
              )}
            </div>
          </div>

          {/* Feed */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
            {postsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading posts…</p>
            ) : posts.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-white shadow-lg">
                  <Megaphone className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium">No posts yet</p>
                <p className="text-xs text-muted-foreground max-w-[220px]">
                  {openChannel.is_owner ? 'Be the first to post an update below.' : 'New updates from this channel will appear here.'}
                </p>
              </div>
            ) : (
              posts.map((p: any, i: number) => (
                <article
                  key={p.id}
                  className={`rounded-2xl bg-elevated border p-3.5 ${i === 0 ? 'border-primary/40 shadow-[0_0_24px_rgba(var(--accent-rgb),0.12)]' : 'border-subtle'}`}
                >
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white text-sm font-bold shrink-0">
                      {avatarLetter(p.sender_display_name || p.sender_username || openChannel.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">
                        {p.sender_display_name || p.sender_username || openChannel.name}
                      </p>
                      <p className="text-[11px] text-tertiary">{fmtTime(p.created_at)}</p>
                    </div>
                    {i === 0 && (
                      <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">Latest</span>
                    )}
                  </div>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{p.content}</p>
                </article>
              ))
            )}
          </div>
          {openChannel.is_owner && (
            <div className="p-3 border-t border-[var(--k-border)] flex gap-2 shrink-0">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') post(openChannel.id) }}
                placeholder="Post an update to followers…"
                className="flex-1 px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm"
              />
              <button onClick={() => post(openChannel.id)} disabled={sending || !draft.trim()} className="p-2.5 rounded-xl btn-primary disabled:opacity-50" aria-label="Post">
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 min-h-0">
          {showCreate && (
            <div className="rounded-2xl bg-elevated border border-subtle p-3.5 space-y-2">
              <p className="text-sm font-semibold">New channel</p>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Channel name"
                className="w-full px-3 py-2.5 rounded-xl bg-card border border-medium outline-none text-sm"
              />
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What is this channel about?"
                className="w-full px-3 py-2.5 rounded-xl bg-card border border-medium outline-none text-sm"
              />
              <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl btn-primary text-sm font-medium disabled:opacity-50">
                {creating ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-6">Loading channels…</p>
          ) : channels.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center text-white shadow-lg">
                <Radio className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium">No channels yet</p>
              <p className="text-xs text-muted-foreground max-w-[220px]">Create the first one with the + button above.</p>
            </div>
          ) : (
            channels.map((c: any) => (
              <div key={c.id} className="rounded-2xl bg-elevated border border-subtle p-3 flex items-center gap-3 hover:border-primary/30 transition-colors">
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="flex items-center gap-3 flex-1 min-w-0 text-left disabled:cursor-default">
                  <div className="w-12 h-12 rounded-full gradient-primary flex items-center justify-center text-white text-lg font-extrabold shrink-0 shadow">
                    {avatarLetter(c.name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold flex items-center gap-1.5 truncate">
                      <span className="truncate">{c.name}</span>
                      {c.is_owner && <Check className="w-3.5 h-3.5 text-primary shrink-0" />}
                    </p>
                    {c.description
                      ? <p className="text-xs text-muted-foreground line-clamp-1 truncate">{c.description}</p>
                      : <p className="text-xs text-tertiary italic">No description</p>}
                    <p className="text-[11px] text-tertiary mt-1 flex items-center gap-2.5">
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{c.follower_count ?? 0}</span>
                      <span className="flex items-center gap-1"><FileText className="w-3 h-3" />{c.post_count ?? 0} posts</span>
                    </p>
                  </div>
                </button>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  {!c.is_owner && (
                    <button
                      onClick={() => follow(c.id, !c.followed)}
                      className={c.followed
                        ? 'px-4 py-1.5 rounded-full bg-muted text-secondary text-xs font-semibold'
                        : 'px-4 py-1.5 rounded-full gradient-primary text-white text-xs font-semibold shadow'}
                    >
                      {c.followed ? 'Following' : 'Follow'}
                    </button>
                  )}
                  {c.is_owner && (
                    <button onClick={() => remove(c.id)} className="p-2 rounded-full hover:bg-muted transition-colors text-tertiary" aria-label="Delete channel">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
