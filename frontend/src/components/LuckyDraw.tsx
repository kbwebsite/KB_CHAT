import { useEffect, useRef, useState } from 'react'
import { Dices, X, Megaphone } from 'lucide-react'

/**
 * Lucky draw spinner — a local party tool, not a message game.
 * Randomness can't be fairly shared through chat messages, so the draw
 * happens on-device (injectable RNG for tests) and only the ANNOUNCEMENT
 * is posted as a normal text message. No protocol, no backend.
 */

export interface DrawMember {
  user_id?: number | null
  id?: number | null
  display_name?: string | null
  username?: string | null
  avatar_url?: string | null
}

export function memberName(m: DrawMember): string {
  return m.display_name || m.username || 'Someone'
}

export function memberId(m: DrawMember): number | null {
  const v = m.user_id ?? m.id
  return typeof v === 'number' ? v : null
}

/** Uniform pick; null when nobody is eligible. */
export function pickWinner<T>(pool: T[], rand: () => number = Math.random): T | null {
  if (pool.length === 0) return null
  const i = Math.floor(rand() * pool.length)
  return pool[Math.min(i, pool.length - 1)]
}

const SPIN_TICKS = 14
const SPIN_MS = 80

export function LuckyDraw({
  members,
  meId,
  onClose,
  onAnnounce,
}: {
  members: DrawMember[]
  meId?: number | null
  onClose: () => void
  onAnnounce: (winnerName: string) => void
}) {
  const eligibleAll = (members || []).filter((m) => memberName(m) !== 'Someone' || memberId(m) != null)
  const [excludeMe, setExcludeMe] = useState(true)
  const [spinning, setSpinning] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [winner, setWinner] = useState<DrawMember | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const pool = excludeMe && meId != null ? eligibleAll.filter((m) => memberId(m) !== meId) : eligibleAll

  const spin = () => {
    if (spinning || pool.length === 0) return
    setSpinning(true)
    setWinner(null)
    let ticks = 0
    timer.current = setInterval(() => {
      ticks += 1
      const cur = pickWinner(pool)
      setFlash(cur ? memberName(cur) : null)
      if (ticks >= SPIN_TICKS) {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        const w = pickWinner(pool)
        setWinner(w)
        setFlash(null)
        setSpinning(false)
      }
    }, SPIN_MS)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Lucky draw">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { if (!spinning) onClose() }} aria-hidden="true" />
      <div className="relative w-full sm:max-w-sm bg-card border border-border rounded-t-3xl sm:rounded-3xl p-5 max-h-[85dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-1">
          <p className="font-bold text-[17px] tracking-tight flex items-center gap-2">
            <Dices className="w-5 h-5 text-primary" aria-hidden="true" /> Lucky draw
          </p>
          <button onClick={onClose} disabled={spinning} aria-label="Close lucky draw" className="p-2 rounded-full hover:bg-muted touch-44 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-4">
          {pool.length} in the hat{eligibleAll.length !== pool.length ? ` (${eligibleAll.length - pool.length} excluded)` : ''} · drawn on this device
        </p>

        <div className="min-h-[88px] rounded-2xl bg-muted/60 border border-border/60 flex items-center justify-center mb-4 px-4" aria-live="polite">
          {spinning ? (
            <p className="text-xl font-extrabold truncate" key={flash}>{flash || '…'}</p>
          ) : winner ? (
            <p className="text-center">
              <span className="block text-3xl mb-1" aria-hidden="true">🎉</span>
              <span className="text-lg font-extrabold">{memberName(winner)}</span>
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Tap spin to pick a winner</p>
          )}
        </div>

        <label className="flex items-center gap-2.5 text-sm mb-3 cursor-pointer min-h-[44px]">
          <input
            type="checkbox"
            checked={excludeMe}
            onChange={(e) => setExcludeMe(e.target.checked)}
            className="w-4 h-4 accent-primary"
          />
          Leave me out of the hat
        </label>

        <div className="flex gap-2">
          <button
            onClick={spin}
            disabled={spinning || pool.length === 0}
            className="flex-1 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50 min-h-[44px]"
          >
            {spinning ? 'Spinning…' : pool.length === 0 ? 'Nobody to draw' : 'Spin'}
          </button>
          {winner && !spinning && (
            <button
              onClick={() => { onAnnounce(memberName(winner)); onClose() }}
              className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-semibold hover:bg-accent transition min-h-[44px] flex items-center justify-center gap-1.5"
            >
              <Megaphone className="w-4 h-4" aria-hidden="true" /> Announce
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
