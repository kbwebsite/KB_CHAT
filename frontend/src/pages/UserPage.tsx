import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { convApi, usersApi } from '../services/api'
import { stashPendingProfile } from '../utils/invite'
import { MessageCircle, UserPlus, Settings as SettingsIcon } from 'lucide-react'

/**
 * Public profile entry (PE-1A). QR codes and shared links point here.
 * Logged out: explain + stash destination, offer login/signup.
 * Logged in: profile card + start-chat action. Invalid names get a
 * useful error, never a silent bounce.
 */
export default function UserPage() {
  const { username } = useParams()
  const { user: me, initialized } = useAuthStore()
  const nav = useNavigate()
  const [profile, setProfile] = useState<any | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const name = (username || '').trim().replace(/^@+/, '')

  useEffect(() => {
    if (!initialized) return
    if (!name) {
      setError('This profile link is broken.')
      return
    }
    if (!me) {
      stashPendingProfile(name)
      return
    }
    let live = true
    setError(null)
    setProfile(null)
    usersApi
      .getByUsername(name)
      .then((r: any) => {
        if (!live) return
        if (r?.success) setProfile(r.data)
        else setError(r?.message || `No Kryzen user named "@${name}".`)
      })
      .catch((e: any) => {
        if (!live) return
        if (e?.response?.status === 404) setError(`No Kryzen user named "@${name}".`)
        else setError('Could not load this profile. Try again.')
      })
    return () => {
      live = false
    }
  }, [name, me, initialized])

  const startChat = async () => {
    if (!profile || starting) return
    setStarting(true)
    setError(null)
    try {
      const r = await convApi.create({ participant_username: profile.username })
      if (r?.success && r.data?.id) nav(`/chat?conv=${r.data.id}`)
      else setError(r?.message || 'Could not start the chat.')
    } catch {
      setError('Could not start the chat. Try again.')
    } finally {
      setStarting(false)
    }
  }

  const isSelf = !!(me && profile && me.id === profile.id)

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 text-center">
        {!initialized ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : !me ? (
          <>
            <div className="w-16 h-16 rounded-2xl kryzen-accent-gradient flex items-center justify-center mx-auto mb-4">
              <UserPlus className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">@{name || '…'}</h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Log in or create a Kryzen account to view this profile and start chatting.
            </p>
            <div className="flex gap-2">
              <button onClick={() => nav('/login')} className="flex-1 py-3 rounded-2xl btn-primary font-bold text-[15px] min-h-[44px]">
                Log in
              </button>
              <button onClick={() => nav('/signup')} className="flex-1 py-3 rounded-2xl btn-secondary font-bold text-[15px] min-h-[44px]">
                Sign up
              </button>
            </div>
          </>
        ) : error ? (
          <>
            <h1 className="text-2xl font-bold mb-2">Profile not found</h1>
            <p className="text-muted-foreground mb-6">{error}</p>
            <Link to="/chat" className="text-primary hover:underline font-medium">
              Back to chats
            </Link>
          </>
        ) : !profile ? (
          <p className="text-muted-foreground text-sm">Loading profile…</p>
        ) : (
          <>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" className="w-20 h-20 rounded-3xl object-cover mx-auto mb-3" />
            ) : (
              <div className="w-20 h-20 rounded-3xl kryzen-accent-gradient flex items-center justify-center text-white text-2xl font-bold mx-auto mb-3">
                {(profile.display_name || profile.username || '?')[0]?.toUpperCase()}
              </div>
            )}
            <h1 className="text-2xl font-bold">{profile.display_name || profile.username}</h1>
            <p className="text-muted-foreground text-sm mb-1">@{profile.username}</p>
            {profile.about && <p className="text-sm mt-2">{profile.about}</p>}
            <div className="mt-5 flex gap-2">
              {isSelf ? (
                <button onClick={() => nav('/settings')} className="flex-1 py-3 rounded-2xl btn-secondary font-bold text-[15px] min-h-[44px] flex items-center justify-center gap-2">
                  <SettingsIcon className="w-4 h-4" /> This is you — open settings
                </button>
              ) : (
                <button onClick={startChat} disabled={starting} className="flex-1 py-3 rounded-2xl btn-primary font-bold text-[15px] min-h-[44px] flex items-center justify-center gap-2 disabled:opacity-60">
                  <MessageCircle className="w-4 h-4" /> {starting ? 'Opening…' : 'Chat'}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
