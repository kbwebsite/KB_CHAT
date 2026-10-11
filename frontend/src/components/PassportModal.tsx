import { useEffect, useState } from 'react'
import { X, Plane } from 'lucide-react'
import { passportApi } from '../services/api'

export function PassportModal({ messageId, onClose }: { messageId: number; onClose: () => void }) {
  const [journey, setJourney] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    passportApi.journey(messageId)
      .then((r: any) => {
        if (r?.success) setJourney(r.data?.journey || [])
        else setErr(r?.message || 'Failed')
      })
      .catch((e: any) => setErr(e.response?.data?.detail || e.response?.data?.message || 'Failed'))
      .finally(() => setLoading(false))
  }, [messageId])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-card border p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-1.5"><Plane className="w-4 h-4" /> Passport journey</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        {loading ? (
          <p className="text-xs text-muted-foreground text-center py-4">Stamping passports…</p>
        ) : err ? (
          <p className="text-xs text-center text-destructive py-4">{err}</p>
        ) : journey.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No stamps yet.</p>
        ) : (
          <div className="space-y-0">
            {journey.map((h: any, i: number) => (
              <div key={`${h.message_id}-${i}`} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="w-7 h-7 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold shrink-0">
                    {(h.display_name || '?')[0].toUpperCase()}
                  </span>
                  {i < journey.length - 1 && <span className="w-px flex-1 bg-border my-0.5" />}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-sm font-medium truncate">{h.display_name}{i === 0 && <span className="text-[10px] text-muted-foreground"> · origin</span>}</p>
                  <p className="text-[11px] text-muted-foreground">@{h.username || 'unknown'} · {h.created_at ? new Date(h.created_at).toLocaleString() : ''}</p>
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground text-center">Each hand passes it on exactly once.</p>
      </div>
    </div>
  )
}
