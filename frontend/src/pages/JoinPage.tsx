import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { groupInviteApi } from '../services/api'
import { Users } from 'lucide-react'

export default function JoinPage() {
  const { token } = useParams()
  const { user, initialized } = useAuthStore()
  const nav = useNavigate()
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!initialized) return
    if (!token) {
      setError('This invite link is broken.')
      return
    }
    if (!user) {
      try {
        localStorage.setItem('kb_pending_invite', token)
      } catch {}
      nav('/login')
      return
    }
    let live = true
    groupInviteApi
      .join(token)
      .then((r: any) => {
        if (!live) return
        if (r?.success && r.data?.conversation_id) {
          try {
            localStorage.removeItem('kb_pending_invite')
          } catch {}
          nav(`/chat?conv=${r.data.conversation_id}`)
        } else {
          setError(r?.message || 'This invite link is invalid or expired.')
        }
      })
      .catch(() => {
        if (live) setError('This invite link is invalid or expired.')
      })
    return () => {
      live = false
    }
  }, [token, user, initialized])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-white" />
        </div>
        {error ? (
          <>
            <h1 className="text-2xl font-bold mb-2">Can't join group</h1>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link to="/" className="text-primary hover:underline font-medium">
              Back to Kryzen
            </Link>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold mb-2">Joining group…</h1>
            <p className="text-muted-foreground">One moment.</p>
          </>
        )}
      </div>
    </div>
  )
}
