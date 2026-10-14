import { useEffect, useState } from 'react'
import { Activity, AlertTriangle, Inbox, Mail, ShieldAlert, UserCheck, UserMinus, Users } from 'lucide-react'
import { aiApi, configApi } from '../../services/api'

function Bar({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values)
  return (
    <div>
      <div className="mt-3 flex items-end gap-1 h-24" role="img" aria-label={label}>
        {values.map((v, i) => (
          <div
            key={i}
            title={`${v}`}
            className="flex-1 rounded-t bg-primary/70 min-h-[2px]"
            style={{ height: `${Math.max(2, Math.round((v / max) * 100))}%` }}
          />
        ))}
      </div>
    </div>
  )
}

function Kpi({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="premium-card min-w-0">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
        {icon} {label}
      </p>
      <p className="text-2xl font-extrabold tabular-nums mt-1">{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  )
}

/** Command-center home: KPIs, growth, health, and what needs attention. */
export function OverviewTab({
  stats,
  loading,
  onGoto,
}: {
  stats: any | null
  loading: boolean
  onGoto: (tab: 'reports' | 'users') => void
}) {
  const [aiLive, setAiLive] = useState<boolean | null>(null)
  const [supportEmail, setSupportEmail] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    aiApi
      .status()
      .then((st: any) => {
        if (live) setAiLive(!!st?.data?.live)
      })
      .catch(() => {
        if (live) setAiLive(false)
      })
    configApi
      .get()
      .then((cfg: any) => {
        const addr = cfg?.data?.supportEmail
        if (live && typeof addr === 'string' && addr.includes('@')) setSupportEmail(addr)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  if (loading && !stats) {
    return <p className="text-sm text-muted-foreground mt-4" aria-busy="true">Loading overview…</p>
  }
  if (!stats) {
    return <p className="text-sm text-muted-foreground mt-4">No stats yet.</p>
  }
  const open = stats.reports?.open ?? 0
  const appeals = stats.reports?.appeals_open ?? 0
  const deactivated = stats.users?.deactivated ?? 0
  const signups: number[] = (stats.users?.per_day ?? []).map((d: any) => d.count ?? 0)

  return (
    <div className="mt-4 space-y-3">
      {(open > 0 || appeals > 0) && (
        <div className="premium-card border-amber-500/30" role="alert">
          <p className="text-sm font-bold flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> Needs attention
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {appeals > 0 && (
              <button
                onClick={() => onGoto('reports')}
                className="px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] bg-amber-500/15 text-amber-500 border border-amber-500/30"
              >
                🔓 {appeals} reactivation appeal{appeals === 1 ? '' : 's'}
              </button>
            )}
            {open > 0 && (
              <button
                onClick={() => onGoto('reports')}
                className="px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] bg-muted"
              >
                <Inbox className="w-3.5 h-3.5 inline mr-1" /> {open} open report{open === 1 ? '' : 's'}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Kpi icon={<Users className="w-3.5 h-3.5" />} label="Users" value={stats.users?.total ?? 0} sub={`${stats.users?.active ?? 0} active`} />
        <Kpi icon={<Activity className="w-3.5 h-3.5" />} label="New this week" value={stats.users?.new_7d ?? 0} sub="signups" />
        <Kpi icon={<ShieldAlert className="w-3.5 h-3.5" />} label="Messages" value={stats.messages?.total ?? 0} sub="all time" />
        <Kpi icon={<UserCheck className="w-3.5 h-3.5" />} label="Resolved" value={stats.reports?.resolved ?? 0} sub={`${open} open`} />
        <Kpi icon={<UserMinus className="w-3.5 h-3.5" />} label="Deactivated" value={deactivated} sub="accounts" />
        <Kpi icon={<Mail className="w-3.5 h-3.5" />} label="Appeals" value={appeals} sub="awaiting review" />
      </div>

      <div className="premium-card">
        <p className="text-sm font-semibold">Signups per day</p>
        <p className="text-[11px] text-muted-foreground">Last {signups.length} days</p>
        <Bar values={signups} label={`Signups per day, peak ${Math.max(0, ...signups)}`} />
      </div>

      <div className="premium-card">
        <p className="text-sm font-semibold">System health</p>
        <div className="mt-2 space-y-1.5 text-xs">
          <p className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> API online
          </p>
          <p className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${aiLive ? 'bg-emerald-500' : aiLive === false ? 'bg-muted-foreground' : 'bg-amber-500'}`} />
            AI triage {aiLive ? 'live' : aiLive === false ? 'off (manual review)' : 'checking…'}
          </p>
          <p className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${supportEmail ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            {supportEmail ? `Appeal contact: ${supportEmail}` : 'No appeal contact email set (ADMIN_EMAILS)'}
          </p>
        </div>
      </div>
    </div>
  )
}
