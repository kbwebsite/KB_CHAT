import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, X, ArrowLeft, User, MessageSquare, Users } from 'lucide-react'
import { useChatStore } from '../store/chat'
import { usersApi, msgApi } from '../services/api'
import { useDebounce } from '../hooks/useDebounce'
import { useEscapeKey } from '../hooks/useDismiss'
import { prettyPreview } from '../utils/messageEffects'

type Person = {
  id: number; username: string; display_name: string;
  avatar_url?: string | null; is_online?: boolean; last_seen?: string | null;
}
type Hit = {
  id: number; conversation_id: number; sender_id?: number | null;
  sender_username?: string | null; sender_display_name?: string | null;
  content?: string | null; created_at?: string | null; message_type?: string;
  is_deleted?: boolean;
}

const MIN_LEN = 1 // server contract: q min_length=1 on both search endpoints

function snippet(content: any): string {
  const t = prettyPreview(content) || ''
  return String(t).slice(0, 90)
}

/**
 * Global search (PE-2A). Three real categories, nothing invented:
 * - People: GET /api/users/search (membership-scoped by the backend)
 * - Messages: GET /api/messages/search (member convs only, server-side)
 * - Chats: client-side filter of the already-loaded conversation list
 * Debounced + AbortController + sequence guard: stale results can never
 * overwrite newer ones. No global store — all state is local.
 */
export function GlobalSearch({ open, onClose, onOpenConversation }: {
  open: boolean
  onClose: () => void
  onOpenConversation: (cid: number, mid?: number) => void
}) {
  const nav = useNavigate()
  const [query, setQuery] = useState('')
  const [people, setPeople] = useState<Person[]>([])
  const [messages, setMessages] = useState<Hit[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const debounced = useDebounce(query.trim(), 350)
  const inputRef = useRef<HTMLInputElement>(null)
  const seq = useRef(0)
  const conversations = useChatStore((s: any) => s.conversations)

  useEscapeKey(onClose, open)
  useEffect(() => {
    if (open) {
      setQuery('')
      setPeople([])
      setMessages([])
      setSearched(false)
      setError(null)
      const t = setTimeout(() => {
        try { inputRef.current?.focus() } catch {}
      }, 60)
      return () => clearTimeout(t)
    }
  }, [open ])

  useEffect(() => {
    if (!open) return
    const q = debounced
    if (!q || q.length < MIN_LEN) {
      setPeople([])
      setMessages([])
      setSearched(false)
      setError(null)
      setLoading(false)
      return
    }
    const mySeq = ++seq.current
    const ctrl = new AbortController()
    setLoading(true)
    setError(null)
    Promise.all([
      usersApi.search(q, ctrl.signal).catch((e: any) => {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return { __canceled: true }
        throw e
      }),
      msgApi.search(q, undefined, ctrl.signal).catch((e: any) => {
        if (e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return { __canceled: true }
        throw e
      }),
    ]).then(([uRes, mRes]: any[]) => {
      if (seq.current !== mySeq || ctrl.signal.aborted) return
      if (uRes?.__canceled || mRes?.__canceled) return
      setPeople(Array.isArray(uRes?.data) ? uRes.data : (Array.isArray(uRes) ? uRes : []))
      setMessages(Array.isArray(mRes?.data) ? mRes.data : (Array.isArray(mRes) ? mRes : []))
      setSearched(true)
    }).catch(() => {
      if (seq.current !== mySeq || ctrl.signal.aborted) return
      setError('Search failed. Check your connection and try again.')
      setSearched(true)
    }).finally(() => {
      if (seq.current === mySeq && !ctrl.signal.aborted) setLoading(false)
    })
    return () => ctrl.abort()
  }, [debounced, open, retryTick])

  const chats = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    if (!q || q.length < MIN_LEN) return []
    return (conversations || []).filter((c: any) =>
      (c.title || '').toLowerCase().includes(q) ||
      (c.description || '').toLowerCase().includes(q),
    ).slice(0, 20)
  }, [conversations, debounced])

  if (!open) return null

  const total = people.length + messages.length + chats.length
  const showEmpty = searched && !loading && !error && total === 0 && debounced.length >= MIN_LEN

  const retry = () => {
    setError(null)
    setRetryTick((n) => n + 1)
  }

  const openMessage = async (m: Hit) => {
    onClose()
    await useChatStore.getState().jumpToMessageId(m.conversation_id, m.id)
    onOpenConversation(m.conversation_id, m.id)
  }

  const openPerson = (p: Person) => {
    onClose()
    nav(`/u/${p.username}`)
  }

  const openChat = (cid: number) => {
    onClose()
    onOpenConversation(cid)
  }

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Global search">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative mx-auto mt-0 sm:mt-[10vh] w-full sm:max-w-lg h-full sm:h-auto sm:max-h-[75vh] bg-card sm:rounded-2xl border-0 sm:border border-border flex flex-col overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border">
          {/* Mobile back affordance (PE-2A §16): the X alone is not an
              obvious back target on a full-screen mobile surface. */}
          <button
            onClick={onClose}
            aria-label="Back to chats"
            className="lg:hidden w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Search className="w-5 h-5 text-muted-foreground shrink-0" aria-hidden="true" />
          <label htmlFor="global-search-input" className="sr-only">Search people, messages, and conversations</label>
          <input
            id="global-search-input"
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = [
                  ...people.map((p) => ({ kind: 'person' as const, p })),
                  ...messages.map((m) => ({ kind: 'message' as const, m })),
                  ...chats.map((c: any) => ({ kind: 'chat' as const, c })),
                ][0]
                if (first) {
                  if (first.kind === 'person') openPerson(first.p)
                  else if (first.kind === 'message') void openMessage(first.m)
                  else openChat(first.c.id)
                }
              }
            }}
            placeholder="Search people, messages, chats…"
            autoComplete="off"
            className="flex-1 min-w-0 bg-transparent outline-none text-[15px] py-2"
          />
          {query ? (
            <button
              onClick={() => { setQuery(''); setPeople([]); setMessages([]); setSearched(false); setError(null); try { inputRef.current?.focus() } catch {} }}
              aria-label="Clear search"
              className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          ) : (
            <button
              onClick={onClose}
              aria-label="Close search"
              className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          {!debounced && !loading && !searched && (
            <div className="px-4 py-8 text-center">
              <Search className="w-8 h-8 text-muted-foreground mx-auto mb-3" aria-hidden="true" />
              <p className="font-semibold text-sm">Search people, messages, and conversations</p>
              <p className="text-xs text-muted-foreground mt-1">Results stay inside chats you belong to.</p>
            </div>
          )}

          {loading && (
            <div aria-label="Searching" aria-busy="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-elevated shrink-0" />
                  <div className="flex-1 space-y-2 min-w-0">
                    <div className="h-3.5 w-32 rounded bg-elevated" />
                    <div className="h-3 w-full rounded bg-elevated" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {error && !loading && (
            <div className="px-4 py-8 text-center">
              <p className="text-sm font-semibold">Something went wrong</p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
              <button onClick={retry} className="mt-3 px-4 py-2.5 rounded-xl btn-primary text-sm font-bold min-h-[44px]">
                Retry
              </button>
            </div>
          )}

          {showEmpty && (
            <div className="px-4 py-8 text-center">
              <p className="font-semibold text-sm">No results found</p>
              <p className="text-xs text-muted-foreground mt-1">Try a different name or word.</p>
            </div>
          )}

          {!loading && !error && people.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">People</p>
              {people.slice(0, 8).map((p) => (
                <button
                  key={p.id}
                  onClick={() => openPerson(p)}
                  aria-label={`Open profile of ${p.display_name || p.username}`}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition text-left min-h-[44px]"
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" loading="lazy" className="w-10 h-10 rounded-full object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-full kryzen-accent-gradient text-white flex items-center justify-center text-sm font-bold shrink-0" aria-hidden="true">
                      {(p.display_name || p.username || '?')[0]?.toUpperCase()}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{p.display_name || p.username}</span>
                    <span className="block text-xs text-muted-foreground truncate">@{p.username}{p.is_online ? ' · Online' : ''}</span>
                  </span>
                  <User className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}

          {!loading && !error && messages.length > 0 && (
            <div>
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Messages</p>
              {messages.slice(0, 12).map((m) => {
                const conv = (conversations || []).find((c: any) => c.id === m.conversation_id)
                return (
                  <button
                    key={m.id}
                    onClick={() => void openMessage(m)}
                    aria-label={`Open message from ${m.sender_display_name || m.sender_username || 'unknown'} in ${conv?.title || 'chat'}`}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition text-left min-h-[44px]"
                  >
                    <span className="w-10 h-10 rounded-xl bg-muted flex items-center justify-center shrink-0" aria-hidden="true">
                      <MessageSquare className="w-4 h-4 text-primary" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">
                        <span className="font-semibold">{m.sender_display_name || m.sender_username || 'Unknown'}</span>
                        <span className="text-muted-foreground"> in {conv?.title || 'Chat'}</span>
                      </span>
                      <span className="block text-xs text-muted-foreground truncate">{snippet(m.content)}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {!loading && !error && chats.length > 0 && (
            <div className="pb-2">
              <p className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Chats</p>
              {chats.slice(0, 8).map((c: any) => (
                <button
                  key={c.id}
                  onClick={() => openChat(c.id)}
                  aria-label={`Open ${c.is_group ? 'group' : 'chat'} ${c.title || ''}`}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-muted transition text-left min-h-[44px]"
                >
                  {c.avatar_url ? (
                    <img src={c.avatar_url} alt="" loading="lazy" className="w-10 h-10 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <span className="w-10 h-10 rounded-2xl kryzen-accent-gradient text-white flex items-center justify-center shrink-0" aria-hidden="true">
                      {c.is_group ? <Users className="w-4 h-4" /> : <span className="text-sm font-bold">{(c.title || '?')[0]}</span>}
                    </span>
                  )}
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold truncate">{c.title || 'Chat'}</span>
                    {c.unread_count > 0 && <span className="block text-xs text-muted-foreground">{c.unread_count} unread</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
