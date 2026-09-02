import { useState, useEffect, useCallback } from 'react'
import { Trophy, Medal, Crown, Users, Globe, Clock, PartyPopper, Star, Flame } from 'lucide-react'
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

interface LeaderboardData {
  users: LeaderboardUser[]
  week_start: string
  week_end: string
}

function getTimeRemaining(weekEnd: string) {
  const end = new Date(weekEnd).getTime()
  const now = Date.now()
  const diff = end - now
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    expired: false,
  }
}

export function Leaderboard({ onClose }: { onClose: () => void }) {
  const [scope, setScope] = useState<'global' | 'friends'>('global')
  const [data, setData] = useState<LeaderboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0, expired: true })
  const [showWinner, setShowWinner] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await usersApi.leaderboard(scope)
      if (res.success) {
        setData(res.data)
        setTimeLeft(getTimeRemaining(res.data.week_end))
      }
    } catch {}
    setLoading(false)
  }, [scope])

  useEffect(() => { loadData() }, [loadData])

  // Countdown timer
  useEffect(() => {
    if (!data?.week_end) return
    const timer = setInterval(() => {
      const remaining = getTimeRemaining(data.week_end)
      setTimeLeft(remaining)
      if (remaining.expired) {
        setShowWinner(true)
      }
    }, 1000)
    return () => clearInterval(timer)
  }, [data?.week_end])

  // Auto-show winner celebration when week ends
  useEffect(() => {
    if (timeLeft.expired && data?.users && data.users.length > 0) {
      setShowWinner(true)
    }
  }, [timeLeft.expired, data?.users])

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="w-5 h-5 text-yellow-500" />
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-300" />
    if (rank === 3) return <Medal className="w-5 h-5 text-amber-600" />
    return <span className="text-sm font-bold text-muted-foreground w-5 text-center">{rank}</span>
  }

  const getRankGradient = (rank: number) => {
    if (rank === 1) return 'from-yellow-500/20 to-amber-500/10 border-yellow-500/30'
    if (rank === 2) return 'from-gray-400/20 to-slate-400/10 border-gray-400/30'
    if (rank === 3) return 'from-amber-600/20 to-orange-500/10 border-amber-600/30'
    return ''
  }

  const winner = data?.users?.[0]
  const myRank = data?.users?.find(u => u.is_current_user)

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'var(--bg-primary)' }}>
      {/* Winner Celebration Modal */}
      {showWinner && winner && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.8)' }}>
          <div className="relative max-w-sm w-full rounded-3xl overflow-hidden" style={{ background: 'linear-gradient(135deg, rgba(124,92,252,0.2), rgba(168,85,247,0.2))', border: '1px solid rgba(255,255,255,0.1)' }}>
            {/* Confetti particles */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {Array.from({ length: 20 }).map((_, i) => (
                <div key={i} className="absolute animate-bounce" style={{
                  left: `${Math.random() * 100}%`,
                  top: `${Math.random() * 100}%`,
                  animationDelay: `${Math.random() * 2}s`,
                  animationDuration: `${1 + Math.random() * 2}s`,
                }}>
                  {['🎉', '🏆', '⭐', '🎊', '✨'][i % 5]}
                </div>
              ))}
            </div>

            <div className="relative p-8 text-center">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-500 text-xs font-bold mb-4">
                <PartyPopper className="w-3 h-3" />
                WEEKLY CHAMPION
              </div>

              <div className="w-24 h-24 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-3xl font-bold text-white mx-auto shadow-lg shadow-yellow-500/30 ring-4 ring-yellow-400/50">
                {winner.display_name?.[0] || winner.username?.[0] || '?'}
              </div>

              <h2 className="text-xl font-bold mt-4">{winner.display_name || winner.username}</h2>
              <p className="text-sm text-muted-foreground mt-1">@{winner.username}</p>

              <div className="flex items-center justify-center gap-2 mt-4">
                <Flame className="w-5 h-5 text-orange-500" />
                <span className="text-2xl font-bold text-primary">{winner.message_count}</span>
                <span className="text-sm text-muted-foreground">messages this week</span>
              </div>

              {winner.is_current_user && (
                <div className="mt-4 p-3 rounded-xl bg-primary/10 border border-primary/20">
                  <p className="text-sm font-medium text-primary">🏆 Congratulations! You won this week!</p>
                </div>
              )}

              {!winner.is_current_user && myRank && (
                <div className="mt-4 p-3 rounded-xl bg-secondary">
                  <p className="text-sm text-muted-foreground">Your rank: <span className="font-bold text-foreground">#{myRank.rank}</span> with {myRank.message_count} messages</p>
                </div>
              )}

              <button onClick={() => setShowWinner(false)}
                className="mt-6 w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 transition-colors">
                {winner.is_current_user ? 'Claim Your Crown' : 'View Full Leaderboard'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
        </button>
        <div className="flex items-center gap-2 flex-1">
          <Trophy className="w-5 h-5 text-yellow-500" />
          <h1 className="text-lg font-semibold">Leaderboard</h1>
        </div>
      </div>

      {/* Week Timer */}
      {data && (
        <div className="shrink-0 p-4 border-b border-border" style={{ background: 'linear-gradient(135deg, rgba(124,92,252,0.08), rgba(168,85,247,0.05))' }}>
          <div className="flex items-center justify-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-xs font-medium text-muted-foreground">
              {timeLeft.expired ? 'New week starting...' : 'Resets in'}
            </span>
          </div>
          {!timeLeft.expired && (
            <div className="flex items-center justify-center gap-3">
              {[
                { val: timeLeft.days, label: 'Days' },
                { val: timeLeft.hours, label: 'Hrs' },
                { val: timeLeft.minutes, label: 'Min' },
                { val: timeLeft.seconds, label: 'Sec' },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center text-lg font-bold" style={{ background: 'rgba(124,92,252,0.15)', color: 'var(--accent-primary)' }}>
                    {String(item.val).padStart(2, '0')}
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{item.label}</p>
                </div>
              ))}
            </div>
          )}
          {timeLeft.expired && (
            <div className="text-center">
              <button onClick={() => setShowWinner(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-yellow-500/20 text-yellow-500 text-sm font-medium hover:bg-yellow-500/30 transition-colors">
                <PartyPopper className="w-4 h-4" />
                See This Week's Winner
              </button>
            </div>
          )}
          {myRank && !timeLeft.expired && (
            <div className="mt-3 text-center">
              <p className="text-xs text-muted-foreground">
                Your rank: <span className="font-bold text-primary">#{myRank.rank}</span> • <span className="font-bold text-foreground">{myRank.message_count}</span> messages
              </p>
            </div>
          )}
        </div>
      )}

      {/* Scope Tabs */}
      <div className="shrink-0 flex border-b border-border">
        <button
          onClick={() => setScope('global')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${scope === 'global' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Globe className="w-4 h-4" />
          Global
        </button>
        <button
          onClick={() => setScope('friends')}
          className={`flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors ${scope === 'friends' ? 'text-primary border-b-2 border-primary' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Users className="w-4 h-4" />
          Friends
        </button>
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
        ) : !data?.users || data.users.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center opacity-60">
            <Trophy className="w-8 h-8 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              {scope === 'friends' ? 'No friends have sent messages this week' : 'No messages sent this week'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Top 3 Podium */}
            {data.users.length >= 3 && (
              <div className="flex items-end justify-center gap-3 mb-6">
                {/* 2nd place */}
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-gray-300 to-slate-400 flex items-center justify-center text-lg font-bold text-white mb-2 shadow-lg">
                    {data.users[1]?.display_name?.[0] || data.users[1]?.username?.[0] || '?'}
                  </div>
                  <Medal className="w-5 h-5 text-gray-300 mb-1" />
                  <p className="text-xs font-medium text-center max-w-[70px] truncate">{data.users[1]?.display_name || data.users[1]?.username}</p>
                  <p className="text-[10px] text-primary font-bold">{data.users[1]?.message_count}</p>
                </div>
                {/* 1st place */}
                <div className="flex flex-col items-center">
                  <div className="relative">
                    <div className="w-18 h-18 rounded-full bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center text-xl font-bold text-white mb-2 shadow-lg shadow-yellow-500/30 ring-2 ring-yellow-400/50" style={{ width: 72, height: 72 }}>
                      {data.users[0]?.display_name?.[0] || data.users[0]?.username?.[0] || '?'}
                    </div>
                    <div className="absolute -top-2 -right-1">
                      <Star className="w-5 h-5 text-yellow-500 fill-yellow-500" />
                    </div>
                  </div>
                  <Crown className="w-6 h-6 text-yellow-500 mb-1" />
                  <p className="text-xs font-medium text-center max-w-[70px] truncate">{data.users[0]?.display_name || data.users[0]?.username}</p>
                  <p className="text-[10px] text-primary font-bold">{data.users[0]?.message_count}</p>
                </div>
                {/* 3rd place */}
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-amber-600 to-orange-500 flex items-center justify-center text-lg font-bold text-white mb-2 shadow-lg">
                    {data.users[2]?.display_name?.[0] || data.users[2]?.username?.[0] || '?'}
                  </div>
                  <Medal className="w-5 h-5 text-amber-600 mb-1" />
                  <p className="text-xs font-medium text-center max-w-[70px] truncate">{data.users[2]?.display_name || data.users[2]?.username}</p>
                  <p className="text-[10px] text-primary font-bold">{data.users[2]?.message_count}</p>
                </div>
              </div>
            )}

            {/* Rest of list */}
            {data.users.slice(data.users.length >= 3 ? 3 : 0).map((u) => (
              <div key={u.user_id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${u.is_current_user ? 'bg-primary/10 border-primary/20' : `bg-card hover:bg-card/80 border-border/50 ${getRankGradient(u.rank)}`}`}>
                <div className="shrink-0 w-8 flex justify-center">{getRankIcon(u.rank)}</div>
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/80 to-accent/80 flex items-center justify-center text-white text-sm font-bold shrink-0">
                  {u.display_name?.[0] || u.username?.[0] || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{u.display_name || u.username}</p>
                  <p className="text-xs text-muted-foreground">@{u.username}</p>
                </div>
                <div className="text-right shrink-0">
                  <div className="flex items-center gap-1">
                    <Flame className="w-3 h-3 text-orange-500" />
                    <span className="text-sm font-bold text-primary">{u.message_count}</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">msgs</p>
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
