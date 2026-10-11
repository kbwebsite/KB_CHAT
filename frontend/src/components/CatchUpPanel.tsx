import { useEffect, useState } from 'react'
import { X, Sunrise, ArrowRight } from 'lucide-react'
import { aiApi } from '../services/api'
import { useChatStore } from '../store/chat'

type DigestItem = {
  convId: number
  title: string
  unread: number
  lastId: number
  summary: string | null
  failed?: boolean
}

const MAX_CONVS = 5
const MAX_MSGS = 15

/** "While you were away": one-line AI summaries for unread chats, each
 * jumping near where you left off. Needs a live AI key; without one the
 * panel still lists unread chats for manual catch-up. */
export function CatchUpPanel({ onClose, onMobileChat }: { onClose: () => void; onMobileChat: () => void }) {
  const [items, setItems] = useState<DigestItem[]>([])
  const [loading, setLoading] = useState(true)
  const [live, setLive] = useState<boolean | null>(null)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      setLoading(true)
      let aiLive = false
      try {
        const st: any = await aiApi.status()
        aiLive = !!st?.data?.live
      } catch {}
      if (cancelled) return
      setLive(aiLive)
      const convs = (useChatStore.getState().conversations as any[])
        .filter((c) => (c.unread_count || 0) > 0)
        .sort((a, b) => (b.unread_count || 0) - (a.unread_count || 0))
        .slice(0, MAX_CONVS)
      const built: DigestItem[] = []
      for (const c of convs) {
        let msgs: any[] = []
        try {
          const r: any = await useChatStore.getState().fetchMessages(c.id)
          void r
          msgs = (useChatStore.getState().messages[c.id] || []).slice(-MAX_MSGS)
        } catch {}
        const lines = msgs
          .filter((m: any) => !m.is_deleted && !m.view_once && !m.is_encrypted && m.message_type === 'text' && m.content)
          .map((m: any) => `${m.sender_display_name || m.sender_username || 'Someone'}: ${(m.content || '').slice(0, 200)}`)
        const lastId = msgs.length ? msgs[msgs.length - 1].id : (c.last_message?.id ?? 0)
        const item: DigestItem = {
          convId: c.id,
          title: c.title || 'Chat',
          unread: c.unread_count || 0,
          lastId,
          summary: null,
        }
        if (aiLive && lines.length > 0) {
          try {
            const s: any = await aiApi.summarize(
              `Summarize these recent chat messages in one short line:\n${lines.join('\n').slice(0, 3000)}`,
            )
            item.summary = (s?.data?.summary || s?.data?.reply || '').trim() || null
            if (!item.summary) item.failed = true
          } catch {
            item.failed = true
          }
        } else if (lines.length === 0) {
          item.summary = 'New activity, no readable messages.'
        }
        built.push(item)
        if (cancelled) return
        setItems([...built])
      }
      if (!cancelled) setLoading(false)
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [])

  const jump = (it: DigestItem) => {
    // Aim near the first unread message; the store falls back to a plain
    // open when the exact id is gone (cleared/deleted).
    const mid = Math.max(1, it.lastId - Math.max(0, it.unread - 1))
    void useChatStore.getState().jumpToMessageId(it.convId, mid)
    onClose()
    onMobileChat()
  }

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <Sunrise className="w-4 h-4" /> Catch up
        </h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close catch up">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">Gathering what you missed…</p>
        ) : items.length === 0 ? (
          <div className="text-center py-8 px-6">
            <p className="text-4xl">☀️</p>
            <p className="text-sm font-semibold mt-2">All caught up</p>
            <p className="text-xs text-muted-foreground mt-1">No unread chats right now.</p>
          </div>
        ) : (
          <>
            {live === false && (
              <p className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-xl">
                AI summaries need a key — showing unread chats for manual catch-up.
              </p>
            )}
            {items.map((it) => (
              <div key={it.convId} className="rounded-2xl border p-3.5 space-y-1.5">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate flex-1">{it.title}</p>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full gradient-primary text-white shrink-0">
                    {it.unread} new
                  </span>
                </div>
                {it.summary ? (
                  <p className="text-[13px] leading-relaxed text-secondary">{it.summary}</p>
                ) : it.failed ? (
                  <p className="text-xs text-muted-foreground">Summary failed — open the chat to read.</p>
                ) : (
                  <p className="text-xs text-muted-foreground animate-pulse">Summarizing…</p>
                )}
                <button
                  onClick={() => jump(it)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1"
                >
                  Open chat <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
