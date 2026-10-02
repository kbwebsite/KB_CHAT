import { useEffect, useState } from 'react'
import { X, Check, CheckCheck } from 'lucide-react'
import { msgApi } from '../services/api'

interface ReceiptUser {
  user_id: number
  display_name: string | null
  username: string | null
  avatar_url: string | null
}

/** WhatsApp-style message info: who read it, who got it, who's pending. */
export function MessageInfo({ msgId, onClose }: { msgId: number; onClose: () => void }) {
  const [data, setData] = useState<{ read: ReceiptUser[]; delivered: ReceiptUser[]; sent: ReceiptUser[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    msgApi
      .receipts(msgId)
      .then((r: any) => {
        if (live && r?.success) setData(r.data)
        else if (live) setError(r?.message || 'Failed to load')
      })
      .catch((e: any) => {
        if (live) setError(e.response?.data?.message || e.response?.data?.detail || 'Failed to load')
      })
    return () => {
      live = false
    }
  }, [msgId])

  const Section = ({ title, icon, users, empty }: { title: string; icon: React.ReactNode; users: ReceiptUser[]; empty: string }) => (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
        {icon} {title} • {users.length}
      </p>
      {users.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-1">{empty}</p>
      ) : (
        <div className="space-y-1.5">
          {users.map((u) => (
            <div key={u.user_id} className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-full kryzen-accent-gradient text-white flex items-center justify-center text-[11px] font-bold overflow-hidden shrink-0">
                {u.avatar_url ? <img src={u.avatar_url} alt="" className="w-full h-full object-cover" /> : (u.display_name || u.username || '?')[0]}
              </div>
              <p className="text-sm truncate">{u.display_name || u.username || 'Someone'}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-xs w-full p-4 space-y-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Message info</p>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-muted" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        {error ? (
          <p className="text-xs text-destructive text-center">{error}</p>
        ) : !data ? (
          <p className="text-xs text-muted-foreground text-center py-4">Loading…</p>
        ) : (
          <>
            <Section title="Read" icon={<CheckCheck className="w-3.5 h-3.5 text-sky-400" />} users={data.read} empty="Nobody yet" />
            <Section title="Delivered" icon={<Check className="w-3.5 h-3.5 text-muted-foreground" />} users={data.delivered} empty="Nobody yet" />
            <Section title="Sent" icon={<Check className="w-3.5 h-3.5 text-muted-foreground opacity-50" />} users={data.sent} empty="Everyone got it" />
          </>
        )}
      </div>
    </div>
  )
}
