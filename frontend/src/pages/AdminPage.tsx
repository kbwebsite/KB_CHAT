import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCheck, Gavel, Search, ShieldAlert, UserX, UserCheck, Trash2 } from 'lucide-react'
import { moderationApi } from '../services/api'
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
  const [tab, setTab] = useState<'reports' | 'users'>('reports')
  const [status, setStatus] = useState('open')
  const [reports, setReports] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<any[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
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

  useEffect(() => {
    if (tab === 'reports') void loadReports()
    else void loadUsers()
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

  const setActive = async (id: number, active: boolean) => {
    setBusy(`u${id}${active}`)
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
        {(['reports', 'users'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`px-4 h-11 rounded-full text-sm font-semibold min-h-[44px] ${tab === t ? 'chip-active' : 'bg-muted'}`}
          >
            {t === 'reports' ? 'Reports' : 'Users'}
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
                {r.status === 'open' ? (
                  <div className="flex flex-wrap gap-2 mt-3">
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
      ) : (
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
      )}
    </div>
  )
}
