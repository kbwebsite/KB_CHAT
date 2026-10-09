import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { securityApi } from '../../services/api'

type Alert = {
  id: number
  event: string
  ip?: string | null
  device?: string | null
  seen: boolean
  created_at?: string | null
}

function when(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(iso) ? iso : `${iso}Z`)
  if (isNaN(d.getTime())) return ''
  try {
    return formatDistanceToNow(d, { addSuffix: true })
  } catch {
    return ''
  }
}

function shortDevice(device?: string | null): string {
  if (!device) return 'Unknown device'
  // User-Agents are verbose; keep the recognizable head.
  const s = device.trim()
  if (/android/i.test(s)) {
    const m = /Android [\d.]+; ([^;)]+)/i.exec(s)
    return m ? `Android · ${m[1].trim()}` : 'Android device'
  }
  if (/iphone|ipad|ipod/i.test(s)) return 'iPhone / iPad'
  if (/windows nt/i.test(s)) return 'Windows · browser'
  if (/mac os x/i.test(s)) {
    const m = /\(([^)]+)\)/.exec(s)
    return m ? `Mac · ${m[1].split(';')[0].trim()}` : 'Mac · browser'
  }
  if (/linux/i.test(s)) return 'Linux · browser'
  return s.length > 48 ? `${s.slice(0, 48)}…` : s
}

/** Security notifications: first-seen-device sign-in history with an
 * unread badge and mark-seen. "This device" matches the local UA. */
export function SecurityAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [unseen, setUnseen] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = () => {
    setLoading(true)
    securityApi
      .alerts()
      .then((r: any) => {
        if (r?.success) {
          setAlerts(r.data?.alerts || [])
          setUnseen(r.data?.unseen || 0)
          setFailed(false)
        } else setFailed(true)
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  const markSeen = async () => {
    try {
      const r = await securityApi.markSeen()
      if (r?.success) {
        setAlerts((l) => l.map((a) => ({ ...a, seen: true })))
        setUnseen(0)
      }
    } catch {}
  }

  const myDevice = (() => {
    try {
      return navigator.userAgent.trim().slice(0, 200)
    } catch {
      return ''
    }
  })()

  if (loading) return <p className="text-xs text-muted-foreground mt-1">Checking sign-ins…</p>
  if (failed) {
    return (
      <div className="mt-1 flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Couldn&apos;t load sign-in history.</p>
        <button onClick={load} className="text-xs px-2.5 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted shrink-0">
          Retry
        </button>
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" />
          {unseen > 0 ? (
            <span>
              <span className="font-semibold text-amber-500">{unseen} new sign-in{unseen === 1 ? '' : 's'}</span> from unrecognized devices
            </span>
          ) : (
            'No unrecognized sign-ins. New devices appear here.'
          )}
        </p>
        {unseen > 0 && (
          <button onClick={markSeen} className="text-xs px-2.5 py-1 rounded-lg bg-background border border-[var(--k-border)] hover:bg-muted shrink-0">
            Mark seen
          </button>
        )}
      </div>
      {alerts.length > 0 && (
        <div className="rounded-xl border border-[var(--k-border)] divide-y divide-[var(--k-border)]/40 overflow-hidden">
          {alerts.slice(0, 8).map((a) => {
            const mine = !!myDevice && a.device === myDevice
            return (
              <div key={a.id} className={`flex items-center gap-2.5 px-3 py-2 ${a.seen ? 'opacity-70' : ''}`}>
                <span className={`w-2 h-2 rounded-full shrink-0 ${a.seen ? 'bg-muted-foreground/40' : 'bg-amber-500'}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium truncate">
                    {shortDevice(a.device)}{' '}
                    {mine && (
                      <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-semibold">
                        This device
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {[a.ip, when(a.created_at)].filter(Boolean).join(' • ') || 'Sign-in'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
