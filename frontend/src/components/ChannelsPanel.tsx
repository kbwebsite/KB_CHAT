import { useEffect, useState } from 'react'
import { Radio, Plus, Send, Trash2, X, Check, BellPlus, BellOff } from 'lucide-react'
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

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b border-[var(--k-border)]">
        <h2 className="font-semibold tracking-tight flex items-center gap-2">
          {openChannel ? (
            <>
              <button onClick={() => { setOpenId(null); setPosts([]) }} className="p-1 rounded-full hover:bg-muted transition-colors" aria-label="Back to channels">
                <X className="w-4 h-4 rotate-45" />
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
          <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
            {postsLoading ? (
              <p className="text-sm text-muted-foreground text-center py-6">Loading posts…</p>
            ) : posts.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No posts yet.</p>
            ) : (
              posts.map((p: any) => (
                <div key={p.id} className="rounded-xl bg-elevated border border-subtle p-3">
                  <p className="text-[11px] text-tertiary font-medium mb-1">
                    {p.sender_display_name || p.sender_username || 'Channel'} · {p.created_at ? new Date(p.created_at).toLocaleString() : ''}
                  </p>
                  <p className="text-sm whitespace-pre-wrap break-words">{p.content}</p>
                </div>
              ))
            )}
          </div>
          {openChannel.is_owner && (
            <div className="p-3 border-t border-[var(--k-border)] flex gap-2">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') post(openChannel.id) }}
                placeholder="Post an update…"
                className="flex-1 px-3 py-2.5 rounded-xl bg-elevated border border-medium outline-none text-sm"
              />
              <button onClick={() => post(openChannel.id)} disabled={sending || !draft.trim()} className="p-2.5 rounded-xl btn-primary disabled:opacity-50" aria-label="Post">
                <Send className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
          {showCreate && (
            <div className="rounded-xl bg-elevated border border-subtle p-3 space-y-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Channel name"
                className="w-full px-3 py-2.5 rounded-xl bg-card border border-medium outline-none text-sm"
              />
              <input
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Description (optional)"
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
            <p className="text-sm text-muted-foreground text-center py-6">No channels yet. Create the first one.</p>
          ) : (
            channels.map((c: any) => (
              <div key={c.id} className="rounded-xl bg-elevated border border-subtle p-3">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => open(c)} disabled={!(c.followed || c.is_owner)} className="flex-1 text-left disabled:cursor-default">
                    <p className="text-sm font-semibold flex items-center gap-1.5">
                      {c.name}
                      {c.is_owner && <Check className="w-3.5 h-3.5 text-primary" />}
                    </p>
                    {c.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{c.description}</p>}
                    <p className="text-[11px] text-tertiary mt-1">
                      {c.follower_count ?? 0} followers · {c.post_count ?? 0} posts
                    </p>
                  </button>
                  <div className="flex items-center gap-1 shrink-0">
                    {!c.is_owner && (
                      <button
                        onClick={() => follow(c.id, !c.followed)}
                        className="p-2 rounded-full hover:bg-muted transition-colors"
                        aria-label={c.followed ? 'Unfollow' : 'Follow'}
                        title={c.followed ? 'Unfollow' : 'Follow'}
                      >
                        {c.followed ? <BellOff className="w-4 h-4" /> : <BellPlus className="w-4 h-4 text-primary" />}
                      </button>
                    )}
                    {c.is_owner && (
                      <button onClick={() => remove(c.id)} className="p-2 rounded-full hover:bg-muted transition-colors" aria-label="Delete channel">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}
