import { useState } from 'react'
import { Ban, RefreshCw, Undo2 } from 'lucide-react'

/** Email blocklist: ban an address (kills the live account too) or lift it. */
export function BansTab({
  bans,
  loading,
  busy,
  onBan,
  onUnban,
  onReload,
}: {
  bans: any[]
  loading: boolean
  busy: boolean
  onBan: (email: string) => void
  onUnban: (id: number) => void
  onReload: () => void
}) {
  const [email, setEmail] = useState('')
  return (
    <div className="mt-4 space-y-3">
      <form
        className="premium-card"
        onSubmit={(e) => {
          e.preventDefault()
          if (email.trim()) {
            onBan(email.trim())
            setEmail('')
          }
        }}
      >
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Ban className="w-4 h-4 text-destructive" /> Ban an email
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          Blocks signup on this address and deactivates the live account, if any.
        </p>
        <div className="mt-2 flex gap-2">
          <label htmlFor="ban-email" className="sr-only">Email to ban</label>
          <input
            id="ban-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="user@example.com"
            autoComplete="off"
            className="input flex-1 min-h-[44px]"
          />
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="px-4 h-11 rounded-xl text-xs font-bold min-h-[44px] disabled:opacity-50 bg-destructive text-destructive-foreground shrink-0"
          >
            Ban
          </button>
        </div>
      </form>
      <button
        onClick={onReload}
        disabled={loading}
        className="px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 flex items-center gap-1.5 bg-muted"
      >
        <RefreshCw className="w-3.5 h-3.5" /> {loading ? 'Loading…' : 'Refresh'}
      </button>
      {loading && bans.length === 0 ? (
        <p className="text-sm text-muted-foreground" aria-busy="true">Loading bans…</p>
      ) : bans.length === 0 ? (
        <div className="empty-state">
          <p className="empty-state-title">No banned emails</p>
          <p className="empty-state-text">Deleted and banned accounts land here.</p>
        </div>
      ) : (
        bans.map((b) => (
          <div key={b.id} className="premium-card flex flex-wrap items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{b.email}</p>
              <p className="text-[11px] text-muted-foreground">
                {b.reason ?? 'banned'}
                {b.created_at ? ` · ${new Date(b.created_at).toLocaleDateString()}` : ''}
              </p>
            </div>
            <button
              disabled={busy}
              onClick={() => onUnban(b.id)}
              aria-label={`Unban ${b.email}`}
              className="px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 flex items-center gap-1.5 shrink-0 bg-emerald-500/10 text-emerald-500 border border-emerald-500/25"
            >
              <Undo2 className="w-3.5 h-3.5" /> Unban
            </button>
          </div>
        ))
      )}
    </div>
  )
}
