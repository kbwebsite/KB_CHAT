import { useState, useEffect } from 'react'
import { Trophy, Medal, Crown, TrendingUp, Users } from 'lucide-react'
import { usersApi } from '../services/api'

interface LeaderboardUser {
  rank: number
  user_id: number
  username: string
  display_name: string
  avatar_url: string | null
  is_online: boolean
  message_count: number
  is_current_user: boolean
}

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<LeaderboardUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadLeaderboard()
  }, [])

  const loadLeaderboard = async () => {
    setLoading(true)
    try {
      const res = await usersApi.leaderboard()
      if (res.success) setUsers(res.data)
    } catch {}
    setLoading(false)
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>
  }

  const getRankBg = (rank: number) => {
    if (rank === 1) return 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30'
    if (rank === 2) return 'from-gray-400/20 to-slate-400/10 border-gray-400/30'
    if (rank === 3) return 'from-amber-600/20 to-orange-500/10 border-amber-600/30'
    return 'from-transparent to-transparent border-transparent'
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h1 className="text-lg font-semibold">Leaderboard</h1>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="flex gap-1">
              <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center opacity-60">
            <Users className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No messages sent yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Top 3 Podium */}
            {users.length >= 3 && (
              <div className="flex items-end justify-center gap-2 mb-6">
                {/* 2nd place */}
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-300 to-slate-400 flex items-center justify-center text-lg font-bold text-white mb-2 shadow-lg">
                    {users[1]?.display_name?.[0] || users[1]?.username?.[0] || '?'}
                  </div>
                  <Medal className="w-5 h-5 text-gray-300 mb-1" />
                  <p className="text-xs font-medium text-center max-w-[80px] truncate">{users[1]?.display_name || users[1]?.username}</p>
                  <p className="text-[10px] text-muted-foreground">{users[1]?.message_count} msgs</p>
                </div>
                {/* 1st place */}
                <div className="flex flex-col items-center">
                  <div className="w-18 h-18 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-xl font-bold text-white mb-2 shadow-lg shadow-yellow-500/30 ring-2 ring-yellow-400/50" style={{ width: 72, height: 72 }}>
                    {users[0]?.display_name?.[0] || users[0]?.username?.[0] || '?'}
                  </div>
                  <Crown className="w-6 h-6 text-yellow-500 mb-1" />
                  <p className="text-xs font-medium text-center max-w-[80px] truncate">{users[0]?.display_name || users[0]?.username}</p>
                  <p className="text-[10px] text-muted-foreground">{users[0]?.message_count} msgs</p>
                </div>
                {/* 3rd place */}
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600 to-orange-500 flex items-center justify-center text-lg font-bold text-white mb-2 shadow-lg">
                    {users[2]?.display_name?.[0] || users[2]?.username?.[0] || '?'}
                  </div>
                  <Medal className="w-5 h-5 text-amber-600 mb-1" />
                  <p className="text-xs font-medium text-center max-w-[80px] truncate">{users[2]?.display_name || users[2]?.username}</p>
                  <p className="text-[10px] text-muted-foreground">{users[2]?.message_count} msgs</p>
                </div>
              </div>
            )}

            {/* Rest of list */}
            {users.slice(users.length >= 3 ? 3 : 0).map((u) => (
              <div key={u.user_id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${u.is_current_user ? 'bg-primary/10 border-primary/20' : 'bg-card hover:bg-card/80 border-border/50'}`}>
                <div className="shrink-0">{getRankIcon(u.rank)}</div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {u.display_name?.[0] || u.username?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.display_name || u.username}</p>
                  <p className="text-xs text-muted-foreground">@{u.username}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-primary">{u.message_count}</p>
                  <p className="text-[10px] text-muted-foreground">messages</p>
                </div>
                {u.is_online && <div className="w-2 h-2 rounded-full bg-green-500 shrink-0" />}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
