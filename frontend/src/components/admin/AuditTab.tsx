import { History, RefreshCw } from 'lucide-react'

const ACTION_LABELS: Record<string, string> = {
  dismissed: 'Dismissed',
  message_deleted: 'Deleted message',
  user_deactivated: 'Deactivated user',
  user_deleted: 'Deleted account',
}

/** Who did what: newest resolutions with actor + target. */
export function AuditTab({
  entries,
  loading,
  onReload,
}: {
  entries: any[]
  loading: boolean
  onReload: () => void
}) {
  return (
    <div className="mt-4 space-y-3">
      <button
        onClick={onReload}
        disabled={loading}
        className="px-3 h-10 rounded-xl text-xs font-semibold min-h-[44px] disabled:opacity-50 flex items-center gap-1.5 bg-muted"
      >
        <RefreshCw className="w-3.5 h-3.5" /> {loading ? 'Loading…' : 'Refresh'}
      </button>
      {loading && entries.length === 0 ? (
        <p className="text-sm text-muted-foreground" aria-busy="true">Loading audit log…</p>
      ) : entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon"><History className="w-6 h-6" /></div>
          <p className="empty-state-title">No resolutions yet</p>
          <p className="empty-state-text">Resolved reports appear here with the acting admin.</p>
        </div>
      ) : (
        entries.map((e) => (
          <div key={e.id} className="premium-card min-w-0" aria-label={`Audit entry ${e.id}`}>
            <p className="text-sm font-semibold truncate">
              {ACTION_LABELS[e.action_taken] ?? e.action_taken}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              #{e.id} · {e.target_type} {e.target_id}
              {e.target?.username ? ` · @${e.target.username}` : ''}
              {e.target?.sender_username ? ` · by @${e.target.sender_username}` : ''}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">
              by @{e.actor_username ?? '?'}
              {e.resolved_at ? ` · ${new Date(e.resolved_at).toLocaleString()}` : ''}
            </p>
          </div>
        ))
      )}
    </div>
  )
}
