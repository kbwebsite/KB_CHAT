import { useEffect, useState } from 'react'
import {
  Plus,
  Send,
  Trash2,
  X,
  Check,
  ArrowLeft,
} from 'lucide-react'
import { channelApi } from '../services/api'

/**
 * Channels (WhatsApp-style): one-way broadcast feeds. Owners post updates;
 * anyone can discover and follow a channel, followers read the feed.
 * Plain list design: avatar, name, follower count, follow button.
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
      <div className="flex items-center gap-2 p-3 border-b border-[var(--k-border)] shrink-0">
        {openChannel ? (
          <>
            <button onClick={() => { setOpenId(null); setPosts([]) }} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Back to channels">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-base font-bold shrink-0">
              {avatarLetter(openChannel.name)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold flex items-center gap-1 truncate">
                <span className="truncate">{openChannel.name}</span>
                {openChannel.is_owner && <Check className="w-4 h-4 text-primary shrink-0" />}
              </p>
              <p className="text-xs text-muted-foreground">
                {openChannel.follower_count ?? 0} followers
              </p>
            </div>
            {!openChannel.is_owner && (
              <button
                onClick={() => follow(openChannel.id, !openChannel.followed)}
                className="px-4 py-1.5 rounded-full btn-primary text-sm font-medium shrink-0"
              >
                {openChannel.followed ? 'Following' : 'Follow'}
              </button>
            )}
          </>
        ) : (
          <>
            <p className="font-semibold flex-1">Channels</p>
            <button onClick={() => setShowCreate((v) => !v)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="New channel">
              <Plus className="w-5 h-5" />
            </button>
          </>
        )}
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      {msg && <p className="px-4 py-2 text-xs text-muted-foreground">{msg}</p>}

      {openChannel ? (
        <div className="flex-1 flex flex-col min-h-0">
          <div className="flex-1 overflow-y-auto min-h-0">
            {openChannel.description && (
              <p className="px-4 py-2.5 text-sm text-secondary border-b border-[var(--k-border)]">{openChannel.description}</p>
            )}
            {postsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-8">Loading posts…</p>
            ) : posts.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium">No posts yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {openChannel.is_owner ? 'Post the first update below.' : 'New updates will appear here.'}
                </p>
              </div>
            ) : (
              posts.map((p: any) => (
                <div key={p.id} className="px-4 py-3 border-b border-[var(--k-border)]">
                  <p className="text-xs text-muted-foreground mb-1">
                    <span className="font-medium text-secondary">{p.sender_display_name || p.sender_username || openChannel.name}</span>
                    {' · '}{fmtTime(p.created_at)}
                  </p>
                  <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words">{p.content}</p>
                </div>
              ))
            )}
          </div>
          {openChannel.is_owner && (
            <div className="p-3 border-t border-[var(--k-border)] flex gap-2 shrink-0">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') post(openChannel.id) }}
                placeholder="Post an update…"
                className="flex-1 px-3 py-2.5 rounded-full bg-elevated border border-medium outline-none text-sm"
              />
              <button onClick={() => post(openChannel.id)} disabled={sending || !draft.trim()} className="p-2.5 rounded-full btn-primary disabled:opacity-50" aria-label="Post">
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto min-h-0">
          {showCreate && (
            <div className="p-3 border-b border-[var(--k-border)] space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Channel name"
                className="w-full px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm"
              />
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Description (optional)"
                className="w-full px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm"
              />
              <button onClick={create} disabled={creating} className="w-full py-2.5 rounded-xl btn-primary text-sm font-medium disabled:opacity-50">
                {creating ? 'Creating…' : 'Create channel'}
              </button>
            </div>
          )}
          {loading ? (
            <p className="text-sm text-muted-foreground text-center py-8">Loading channels…</p>
          ) : channels.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm font-medium">No channels yet</p>
              <p className="text-xs text-muted-foreground mt-1">Create the first one with + above.</p>
            </div>
          ) : (
            channels.map((c: any) => (
              <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 border-b border-[var(--k-border)]">
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="w-12 h-12 rounded-full bg-muted flex items-center justify-center text-lg font-bold shrink-0 disabled:cursor-default">
                  {avatarLetter(c.name)}
                </button>
                <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="flex-1 min-w-0 text-left disabled:cursor-default">
                  <p className="font-medium flex items-center gap-1 truncate">
                    <span className="truncate">{c.name}</span>
                    {c.is_owner && <Check className="w-4 h-4 text-primary shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {c.description || `${c.follower_count ?? 0} followers`}
                  </p>
                  {c.description && (
                    <p className="text-xs text-muted-foreground">{c.follower_count ?? 0} followers</p>
                  )}
                </button>
                {!c.is_owner ? (
                  <button
                    onClick={() => follow(c.id, !c.followed)}
                    className={c.followed
                      ? 'px-3 py-1.5 rounded-full bg-muted text-secondary text-sm shrink-0'
                      : 'px-3 py-1.5 rounded-full btn-primary text-sm font-medium shrink-0'}
                  >
                    {c.followed ? 'Following' : 'Follow'}
                  </button>
                ) : (
                  <button onClick={() => remove(c.id)} className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground shrink-0" aria-label="Delete channel">
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
