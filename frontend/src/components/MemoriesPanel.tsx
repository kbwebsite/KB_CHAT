import { useEffect, useState } from 'react'
import { X, History, ArrowRight } from 'lucide-react'
import { memoriesApi } from '../services/api'

type Memory = {
  id: number
  conversation_id: number
  conversation_title?: string | null
  sender_display_name?: string | null
  is_mine: boolean
  content?: string | null
  message_type: string
  created_at?: string | null
  years_ago: number
}

function yearLabel(y: number): string {
  if (y <= 1) return '1 year ago'
  return `${y} years ago`
}

function dateLabel(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
}

/** "On this day": your messages from the same date in past years.
 * Opens the exact message in its chat (scroll + flash). */
export function MemoriesPanel({ onClose, onJump }: { onClose: () => void; onJump: (cid: number, mid: number) => void }) {
  const [items, setItems] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = () => {
    setLoading(true)
    memoriesApi
      .list()
      .then((r: any) => {
        if (r?.success) {
          setItems(r.data?.items || [])
          setFailed(false)
        } else setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  return (
    <div className="h-full flex flex-col bg-card">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold flex items-center gap-2">
          <History className="w-4 h-4" /> On this day
        </h2>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close memories">
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Digging up memories…</p>
        ) : failed ? (
          <div className="text-center py-8">
            <p className="text-sm text-muted-foreground">Couldn&apos;t load memories.</p>
            <button onClick={load} className="mt-2 text-xs px-3 py-1.5 rounded-lg bg-muted hover:bg-accent">
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-8 px-6">
            <p className="text-4xl">📸</p>
            <p className="text-sm font-semibold mt-2">No memories yet</p>
            <p className="text-xs text-muted-foreground mt-1">Today&apos;s chats become future memories — check back next year.</p>
          </div>
        ) : (
          items.map((m) => (
            <div key={m.id} className="rounded-2xl border overflow-hidden">
              <div className="px-3.5 pt-2.5 flex items-center gap-2">
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full gradient-primary text-white shrink-0">
                  {yearLabel(m.years_ago)}
                </span>
                <span className="text-[11px] text-muted-foreground truncate">
                  {dateLabel(m.created_at)}
                </span>
              </div>
              <p className="px-3.5 pt-1.5 text-sm leading-relaxed whitespace-pre-wrap break-words line-clamp-4">
                {m.content || '(message)'}
              </p>
              <div className="px-3.5 py-2.5 flex items-center gap-1.5">
                <p className="text-[11px] text-muted-foreground truncate flex-1">
                  {m.is_mine ? 'You' : m.sender_display_name || 'Someone'} • {m.conversation_title || 'Chat'}
                </p>
                <button
                  onClick={() => onJump(m.conversation_id, m.id)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full bg-primary/10 text-primary hover:bg-primary/20 flex items-center gap-1 shrink-0"
                >
                  Open <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
