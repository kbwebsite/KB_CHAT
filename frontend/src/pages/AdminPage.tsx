import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCheck, Gavel, Search, ShieldAlert, Sparkles, UserX, UserCheck, Trash2 } from 'lucide-react'
import { moderationApi, feedbackApi } from '../services/api'
import { useToastStore } from '../store/toast'

const ACTIONS = [
  { id: 'dismissed', label: 'Dismiss' },
  { id: 'message_deleted', label: 'Delete message' },
  { id: 'user_deactivated', label: 'Deactivate user' },
]

function timeOf(iso: string | null) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

/** Platform moderation console (admins only; route-guarded in App). */
export default function AdminPage() {
  const [tab, setTab] = useState<'reports' | 'users' | 'stats' | 'feedback'>('reports')
  const [status, setStatus] = useState('open')
  const [reports, setReports] = useState<any[]>([])
  const [feedback, setFeedback] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [stats, setStats] = useState<any | null>(null)
  const toast = useToastStore((s) => s.push)

  const loadReports = async (st = status) => {
    setLoading(true)
    try {
      const res = await moderationApi.reports(st)
      if (res?.success) setReports(res.data)
    } catch {
      toast('Could not load reports', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadUsers = async () => {
    setLoading(true)
    try {
      const res = await moderationApi.users(query.trim())
      if (res?.success) setUsers(res.data)
    } catch {
      toast('Could not load users', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    setLoading(true)
    try {
      const res = await moderationApi.stats()
      if (res?.success) setStats(res.data)
    } catch {
      toast('Could not load stats', 'error')
    } finally {
      setLoading(false)
    }
  }

  const loadFeedback = async () => {
    setLoading(true)
    try {
      const res = await feedbackApi.list('all')
      if (res?.success) setFeedback(res.data)
    } catch {
      toast('Could not load feedback', 'error')
    } finally {
      setLoading(false)
    }
  }

  const toggleReviewed = async (id: number, reviewed: boolean) => {
    setBusy(`f${id}`)
    try {
      const res = await feedbackApi.markReviewed(id, reviewed)
      if (res?.success) {
        setFeedback((prev) => prev.map((f) => (f.id === id ? res.data : f)))
      } else {
        toast(res?.message || 'Update failed', 'error')
      }
    } catch (e: any) {
      toast(e.response?.data?.detail || 'Update failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  useEffect(() => {
    if (tab === 'reports') void loadReports()
    else if (tab === 'users') void loadUsers()
    else if (tab === 'feedback') void loadFeedback()
    else void loadStats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  const resolve = async (id: number, action: string) => {
    setBusy(`r${id}${action}`)
    try {
      const res = await moderationApi.resolve(id, action)
      if (res?.success) {
        toast(`Report ${action.replace('_', ' ')}`, 'success')
        setReports((prev) =>
          status === 'open' ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? res.data : r)),
        )
      } else {
        toast(res?.message || 'Resolve failed', 'error')
      }
    } catch (e: any) {
      toast(e.response?.data?.detail || 'Resolve failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const analyze = async (id: number) => {
    setBusy(`a${id}`)
    try {
      const res = await moderationApi.analyze(id)
      if (res?.success) {
        toast('AI analysis stored', 'success')
        setReports((prev) => prev.map((r) => (r.id === id ? res.data : r)))
      } else {
        toast(res?.message || 'Analysis failed', 'error')
      }
    } catch (e: any) {
      toast(e.response?.data?.detail || 'Analysis failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  const setActive = async (id: number, active: boolean) => {    setBusy(`u${id}${active}`)
    try {
      const res = active
        ? await moderationApi.reactivate(id)
        : await moderationApi.deactivate(id)
      if (res?.success) {
        toast(active ? 'User reactivated' : 'User deactivated', 'success')
        setUsers((prev) => prev.map((u) => (u.id === id ? res.data : u)))
      } else {
        toast(res?.message || 'Update failed', 'error')
      }
    } catch (e: any) {
      toast(e.response?.data?.detail || 'Update failed', 'error')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="min-h-screen flex flex-col max-w-3xl mx-auto w-full px-4 sm:px-6 py-6">
      <header className="flex items-center gap-3">
        <Link to="/chat" aria-label="Back to chats" className="icon-btn">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-primary" aria-hidden="true" />
            Moderation
          </h1>
          <p className="text-xs text-muted-foreground">Reports queue and user safety actions</p>
        </div>
      </header>

      <div className="flex gap-2 mt-5" role="tablist" aria-label="Moderation views">
        {(['reports', 'users', 'stats', 'feedback'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 h-11 rounded-full text-sm font-semibold min-h-[44px] ${tab === t ? 'chip-active' : 'bg-muted'}`}
          >
            {t === 'reports' ? 'Reports' : t === 'users' ? 'Users' : t === 'stats' ? 'Stats' : 'Feedback'}
          </button>
        ))}
        {tab === 'reports' && (
          <select
            aria-label="Report status filter"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value)
              void loadReports(e.target.value)
            }}
            className="input ml-auto max-w-[140px] min-h-[44px]"
          >
            <option value="open">Open</option>
            <option value="resolved">Resolved</option>
            <option value="all">All</option>
          </select>
        )}
      </div>

      {tab === 'reports' ? (
        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">Loading reports…</p>
          ) : reports.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon"><Gavel className="w-6 h-6" /></div>
              <p className="empty-state-title">Queue clear</p>
              <p className="empty-state-text">No {status} reports right now.</p>
            </div>
          ) : (
            reports.map((r) => (
              <article key={r.id} className="premium-card" aria-label={`Report ${r.id}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    #{r.id} · {r.target_type} · {r.reason}
                  </p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                    {r.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  by @{r.reporter_username ?? r.reporter_id} · {timeOf(r.created_at)}
                </p>
                {r.target?.snippet && (
                  <p className="text-sm mt-2 px-3 py-2 rounded-lg bg-muted break-words">
                    “{r.target.snippet}”
                    {r.target?.sender_username && (
                      <span className="text-muted-foreground"> — @{r.target.sender_username}</span>
                    )}
                  </p>
                )}
                {r.target?.username && (
                  <p className="text-sm mt-2">@{r.target.username}</p>
                )}
                {r.details && <p className="text-xs text-muted-foreground mt-1">{r.details}</p>}
                {r.ai_score != null && (
                  <div className="mt-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/20">
                    <p className="text-xs font-semibold flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      AI triage: {r.ai_score}/100 · {r.ai_label}
                    </p>
                    {r.ai_summary && <p className="text-xs text-muted-foreground mt-0.5">{r.ai_summary}</p>}
                    <p className="text-[11px] mt-1 font-medium text-primary">
                      {r.ai_score >= 80
                        ? 'Suggested: remove content / deactivate user'
                        : r.ai_score >= 40
                          ? 'Suggested: review carefully before acting'
                          : 'Suggested: likely safe — consider dismissing'}
                    </p>
                  </div>
                )}
                {r.status === 'open' ? (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {r.ai_score == null && (
                      <button
                        disabled={busy !== null}
                        onClick={() => analyze(r.id)}
                        aria-label={`Analyze report ${r.id} with AI`}
                        className="px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 flex items-center gap-1.5 bg-primary/10 text-primary border border-primary/25"
                      >
                        <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                        {busy === `a${r.id}` ? 'Analyzing…' : 'Analyze with AI'}
                      </button>
                    )}
                    {ACTIONS.map((a) => (
                      <button
                        key={a.id}
                        disabled={busy !== null}
                        onClick={() => resolve(r.id, a.id)}
                        aria-label={`${a.label} report ${r.id}`}
                        className={`px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 flex items-center gap-1.5 ${
                          a.id === 'dismissed'
                            ? 'bg-muted'
                            : a.id === 'message_deleted'
                              ? 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                              : 'bg-destructive/10 text-destructive border border-destructive/25'
                        }`}
                      >
                        {a.id === 'dismissed' ? (
                          <CheckCheck className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : a.id === 'message_deleted' ? (
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        {busy === `r${r.id}${a.id}` ? 'Working…' : a.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground mt-2">
                    {r.action_taken?.replace('_', ' ')}
                  </p>
                )}
              </article>
            ))
          )}
        </div>
      ) : tab === 'users' ? (
        <div className="mt-4 space-y-3">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void loadUsers()
            }}
          >
            <label htmlFor="mod-user-search" className="sr-only">
              Search users
            </label>
            <input
              id="mod-user-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search username or email…"
              className="input flex-1 min-h-[44px]"
            />
            <button
              type="submit"
              aria-label="Search users"
              className="w-11 h-11 rounded-xl bg-muted flex items-center justify-center shrink-0"
            >
              <Search className="w-4 h-4" />
            </button>
          </form>
          {loading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">Loading users…</p>
          ) : (
            users.map((u) => (
              <div key={u.id} className="premium-card flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    @{u.username}
                    {!u.is_active && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">
                        deactivated
                      </span>
                    )}
                    {u.is_admin && (
                      <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">
                        admin
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{u.email}</p>
                </div>
                {!u.is_admin && (
                  <button
                    disabled={busy !== null}
                    onClick={() => setActive(u.id, !u.is_active)}
                    aria-label={`${u.is_active ? 'Deactivate' : 'Reactivate'} ${u.username}`}
                    className={`px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 flex items-center gap-1.5 shrink-0 ${
                      u.is_active
                        ? 'bg-destructive/10 text-destructive border border-destructive/25'
                        : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/25'
                    }`}
                  >
                    {u.is_active ? (
                      <UserX className="w-3.5 h-3.5" aria-hidden="true" />
                    ) : (
                      <UserCheck className="w-3.5 h-3.5" aria-hidden="true" />
                    )}
                    {u.is_active ? 'Deactivate' : 'Reactivate'}
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      ) : tab === 'feedback' ? (
        <div className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground" aria-busy="true">Loading feedback…</p>
          ) : feedback.length === 0 ? (
            <div className="empty-state">
              <p className="empty-state-title">No feedback yet</p>
              <p className="empty-state-text">User submissions from Settings appear here.</p>
            </div>
          ) : (
            feedback.map((f) => (
              <article key={f.id} className={`premium-card ${f.status !== 'new' ? 'opacity-70' : ''}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold">
                    #{f.id} · {f.category}
                  </p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-muted text-muted-foreground shrink-0">
                    {f.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  @{f.username ?? f.user_id} · {timeOf(f.created_at)}
                  {f.app_version ? ` · v${f.app_version}` : ''}
                </p>
                <p className="text-sm mt-2 break-words whitespace-pre-wrap">{f.message}</p>
                {f.image_url && (
                  <a href={f.image_url} target="_blank" rel="noreferrer" className="block mt-2">
                    <img src={f.image_url} alt="Attached screenshot" loading="lazy" className="max-h-48 rounded-xl border border-[var(--k-border)] object-contain" />
                  </a>
                )}
                <button
                  disabled={busy !== null}
                  onClick={() => toggleReviewed(f.id, f.status === 'new')}
                  className="mt-2 px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 bg-muted"
                >
                  {busy === `f${f.id}` ? 'Working…' : f.status === 'new' ? 'Mark reviewed' : 'Reopen'}
                </button>
              </article>
            ))
          )}
        </div>
      ) : (
        <StatsPanel stats={stats} loading={loading} />
      )}
    </div>
  )
}

function StatCard({ label, value, sub }: { label: string; value: ReactNode; sub?: string }) {
  return (
    <div className="premium-card">
      <p className="text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="text-xs font-semibold mt-0.5">{label}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

/** Platform overview: dep-free SVG bars + proportion rows (no chart lib). */
function StatsPanel({ stats, loading }: { stats: any | null; loading: boolean }) {
  if (loading && !stats) {
    return <p className="text-sm text-muted-foreground mt-4" aria-busy="true">Loading stats…</p>
  }
  if (!stats) {
    return <p className="text-sm text-muted-foreground mt-4">No stats yet.</p>
  }
  const perDay: Array<{ date: string; count: number }> = stats.messages?.per_day ?? []
  const max = Math.max(1, ...perDay.map((d) => d.count))
  const totalReports =
    (stats.reports?.open ?? 0) + (stats.reports?.resolved ?? 0)
  const reasons: Array<{ reason: string; count: number }> =
    stats.reports?.by_reason ?? []
  const reasonMax = Math.max(1, ...reasons.map((r) => r.count))
  return (
    <div className="mt-4 space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Users" value={stats.users?.total ?? 0} sub={`${stats.users?.active ?? 0} active · ${stats.users?.new_7d ?? 0} new this week`} />
        <StatCard label="Messages" value={stats.messages?.total ?? 0} sub="all time" />
        <StatCard label="Chats" value={stats.conversations?.total ?? 0} sub={`${stats.conversations?.groups ?? 0} groups`} />
        <StatCard label="Open reports" value={stats.reports?.open ?? 0} sub={`${stats.reports?.resolved ?? 0} resolved`} />
      </div>
      <div className="premium-card">
        <p className="text-sm font-semibold">Messages per day</p>
        <p className="text-[11px] text-muted-foreground">Last {perDay.length} days</p>
        <div
          className="mt-3 flex items-end gap-1 h-28"
          role="img"
          aria-label={`Messages per day, peak ${max} in one day, ${stats.messages?.total ?? 0} total`}
        >
          {perDay.map((d) => (
            <div
              key={d.date}
              title={`${d.date}: ${d.count}`}
              className="flex-1 rounded-t bg-primary/70 min-h-[2px]"
              style={{ height: `${Math.max(2, Math.round((d.count / max) * 100))}%` }}
            />
          ))}
        </div>
      </div>
      <div className="premium-card">
        <p className="text-sm font-semibold">Reports by reason</p>
        <p className="text-[11px] text-muted-foreground">{totalReports} total</p>
        <div className="mt-3 space-y-2">
          {reasons.length === 0 && (
            <p className="text-xs text-muted-foreground">No reports filed yet.</p>
          )}
          {reasons.map((r) => (
            <div key={r.reason}>
              <div className="flex justify-between text-xs">
                <span className="font-medium capitalize">{r.reason}</span>
                <span className="text-muted-foreground tabular-nums">{r.count}</span>
              </div>
              <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/70"
                  style={{ width: `${Math.round((r.count / reasonMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
