import { useEffect, useMemo, useState } from 'react'
import { BellRing, Trash2, X, MessageCircle } from 'lucide-react'
import {
  listReminders,
  cancelReminder,
  formatFireAt,
  type Reminder,
} from '../utils/reminders'
import { useToastStore } from '../store/toast'

/**
 * Reminders Manager (PE-2B). Read-only view over the existing local
 * reminder store (`utils/reminders.ts` — localStorage `kb_reminders`,
 * fired by the App ticker). No scheduler here: refresh happens on mount,
 * window focus, and cross-tab `storage` events. Deletion uses the same
 * `cancelReminder` primitive (same persistence the ticker reads), so a
 * cancelled reminder can never fire and reload preserves the deletion.
 *
 * Limitation: stored reminders carry no message id (only convId +
 * snippet), so "open" lands on the conversation via the normal selection
 * path — exact message jump is impossible without a schema change, and we
 * do not fake it.
 */
export function RemindersPanel({
  onClose,
  onOpenConversation,
}: {
  onClose: () => void
  onOpenConversation: (cid: number) => void
}) {
  const toast = useToastStore((s) => s.push)
  const [items, setItems] = useState<Reminder[]>(() => {
    try {
      return listReminders()
    } catch {
      return []
    }
  })

  useEffect(() => {
    const refresh = () => {
      try {
        setItems(listReminders())
      } catch {
        /* corrupted storage reads as empty (same rule as the ticker) */
      }
    }
    window.addEventListener('focus', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      window.removeEventListener('focus', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])

  const sorted = useMemo(
    () => [...items].sort((a, b) => a.fireAt - b.fireAt),
    [items],
  )

  const handleCancel = (id: string) => {
    if (cancelReminder(id)) {
      setItems((prev) => prev.filter((r) => r.id !== id))
      toast('Reminder cancelled', 'success')
    } else {
      // Already fired or removed elsewhere — resync instead of lying.
      try {
        setItems(listReminders())
      } catch {}
      toast('That reminder is already gone', 'info')
    }
  }

  const now = Date.now()

  return (
    <div className="h-full flex flex-col bg-card" role="dialog" aria-label="Reminders">
      <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
        <h2 className="font-semibold flex items-center gap-2">
          <BellRing className="w-4 h-4" aria-hidden="true" />
          Reminders
        </h2>
        <button
          onClick={onClose}
          aria-label="Close reminders"
          className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {sorted.length === 0 ? (
          <div className="p-8 text-center">
            <BellRing className="w-8 h-8 mx-auto mb-2 opacity-30" aria-hidden="true" />
            <p className="text-sm font-semibold">No reminders yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Open a message menu, then choose In 1 hour or At 9 AM to set one.
            </p>
          </div>
        ) : (
          sorted.map((r) => {
            const overdue = r.fireAt <= now
            return (
              <div
                key={r.id}
                className="p-3 rounded-xl bg-muted border border-border flex items-start gap-2.5"
              >
                <span
                  className="w-10 h-10 rounded-xl bg-background flex items-center justify-center shrink-0"
                  aria-hidden="true"
                >
                  <BellRing className="w-4 h-4 text-primary" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground truncate">
                    <span className="font-semibold text-foreground">{r.sender}</span>
                    {' in '}
                    {r.convTitle || 'Chat'}
                  </p>
                  <p className="text-sm mt-0.5 line-clamp-2 break-words">{r.snippet}</p>
                  <p className="text-xs text-primary font-medium mt-1">
                    {overdue ? 'Due now — fires shortly' : formatFireAt(r.fireAt)}
                  </p>
                  {r.convId != null && (
                    <button
                      onClick={() => onOpenConversation(r.convId as number)}
                      aria-label={`Open chat ${r.convTitle || ''}`}
                      className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline min-h-[44px]"
                    >
                      <MessageCircle className="w-3.5 h-3.5" aria-hidden="true" />
                      Open chat
                    </button>
                  )}
                </div>
                <button
                  onClick={() => handleCancel(r.id)}
                  aria-label={`Cancel reminder from ${r.sender}`}
                  className="w-11 h-11 rounded-full flex items-center justify-center text-muted-foreground hover:bg-background hover:text-destructive shrink-0"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
