import { Ban, ShieldCheck, Trash2, UserCheck, UserMinus, UserX, X } from 'lucide-react'

/** Slide-over with everything about one account + every admin action. */
export function UserDrawer({
  user,
  busy,
  armed,
  onArm,
  onClose,
  onToggleActive,
  onDelete,
  onSetAdmin,
  onBan,
  onErase,
}: {
  user: any
  busy: boolean
  armed: string | null
  onArm: (key: string | null) => void
  onClose: () => void
  onToggleActive: (id: number, active: boolean) => void
  onDelete: (id: number) => void
  onSetAdmin: (id: number, isAdmin: boolean) => void
  onBan?: (email: string) => void
  onErase?: (id: number) => void
}) {
  const arm = (key: string, fn: () => void) => {
    if (armed !== key) {
      onArm(key)
      return
    }
    onArm(null)
    fn()
  }
  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
      role="dialog"
      aria-label={`User ${user.username}`}
    >
      <div
        className="w-full max-w-sm rounded-2xl border bg-card p-4 shadow-2xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="font-bold truncate">@{user.username}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {user.display_name ?? ''} · id {user.id}
              {user.created_at ? ` · joined ${new Date(user.created_at).toLocaleDateString()}` : ''}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close user details" className="p-2 rounded-full hover:bg-muted shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {!user.is_active && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">deactivated</span>
          )}
          {user.is_admin && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/15 text-primary">admin</span>
          )}
          {user.email_banned && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-destructive/15 text-destructive">email blocked</span>
          )}
          {user.is_active && !user.is_admin && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">active</span>
          )}
        </div>
        {!user.is_admin && (
          <div className="mt-3 grid grid-cols-1 gap-2">
            <button
              disabled={busy}
              onClick={() => onToggleActive(user.id, !user.is_active)}
              className={`w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                user.is_active
                  ? 'bg-destructive/10 text-destructive border border-destructive/25'
                  : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/25'
              }`}
            >
              {user.is_active ? <UserX className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
              {user.is_active ? 'Deactivate' : 'Reactivate'}
            </button>
            <button
              disabled={busy}
              onClick={() => arm(`admin${user.id}`, () => onSetAdmin(user.id, !user.is_admin))}
              className="w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-1.5 bg-primary/10 text-primary border border-primary/25"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {armed === `admin${user.id}` ? 'Tap again to confirm' : user.is_admin ? 'Revoke admin' : 'Make admin'}
            </button>
            <button
              disabled={busy}
              onClick={() => arm(`del${user.id}`, () => onDelete(user.id))}
              className={`w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                armed === `del${user.id}`
                  ? 'bg-destructive text-destructive-foreground'
                  : 'bg-destructive/10 text-destructive border border-destructive/25'
              }`}
            >
              <UserMinus className="w-3.5 h-3.5" />
              {armed === `del${user.id}` ? 'Tap again to delete forever' : 'Delete account'}
            </button>
            {onErase && (
              <button
                disabled={busy}
                onClick={() => arm(`erase${user.id}`, () => onErase(user.id))}
                className={`w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  armed === `erase${user.id}`
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-black/40 text-destructive border border-destructive/40'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                {armed === `erase${user.id}` ? 'Tap again: wipe everywhere' : 'Remove everywhere'}
              </button>
            )}
            {onBan && !user.email_banned && (
              <button
                disabled={busy}
                onClick={() => arm(`ban${user.id}`, () => onBan(user.email))}
                className={`w-full py-2.5 rounded-xl text-xs font-bold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-1.5 ${
                  armed === `ban${user.id}`
                    ? 'bg-destructive text-destructive-foreground'
                    : 'bg-destructive/10 text-destructive border border-destructive/25'
                }`}
              >
                <Ban className="w-3.5 h-3.5" />
                {armed === `ban${user.id}` ? 'Tap again to ban email' : 'Ban email'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
