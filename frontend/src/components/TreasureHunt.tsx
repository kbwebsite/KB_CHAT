import { useState } from 'react'
import { Flag, MapPin } from 'lucide-react'
import {
  collectTH,
  haversineM,
  isTHChallenge,
  parseTHunt,
  thNext,
} from '../utils/treasureHunt'

export { isTHChallenge }

export function TreasureHunt({
  challenge,
  msgs,
  onFound,
  onDone,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  onFound: (challenge: any, n: number) => void
  onDone: (challenge: any) => void
  onRematch: () => void
}) {
  const settingUp = !(challenge.id > 0)
  const hunt = parseTHunt(challenge.content)
  const { found, done } = collectTH(challenge.id, msgs)
  const [status, setStatus] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)

  if (!hunt) {
    return (
      <div className="w-full max-w-[280px] min-w-0 overflow-hidden">
        <p className="text-xs font-semibold mb-1 flex items-center gap-1.5">🗺️ Treasure Hunt</p>
        <p className="text-xs opacity-70">Hunt data is broken — ask the host to start a new one.</p>
        {!settingUp && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRematch()
            }}
            className="mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]"
          >
            New hunt
          </button>
        )}
      </div>
    )
  }

  const total = hunt.clues.length
  const next = thNext(found, total)
  const solved = next < 0
  const winner = solved ? found.get(total - 1) : null

  const checkIn = () => {
    if (checking || settingUp || solved || done || next < 0) return
    if (!('geolocation' in navigator)) {
      setStatus('Geolocation not supported here.')
      return
    }
    setChecking(true)
    setStatus(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setChecking(false)
        const clue = hunt.clues[next]
        const d = haversineM(pos.coords.latitude, pos.coords.longitude, clue.la, clue.lo)
        if (d <= clue.r) {
          onFound(challenge, next)
        } else {
          const away = d >= 1000 ? `${(d / 1000).toFixed(1)} km` : `${Math.round(d)} m`
          setStatus(`📍 ${away} away — go closer! (within ${clue.r} m)`)
        }
      },
      () => {
        setChecking(false)
        setStatus('Location unavailable — allow access and retry.')
      },
      { timeout: 15000 },
    )
  }

  return (
    <div className="w-full max-w-[280px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-1 flex items-center gap-1.5">🗺️ Treasure Hunt</p>
      <p className="text-xs font-bold text-primary mb-1">{hunt.title}</p>
      <p className="text-[11px] opacity-70 mb-2" aria-label="Hunt progress">
        {found.size}/{total} checkpoints {solved ? '— treasure found! 🎉' : 'found'}
      </p>

      <div className="flex gap-1 mb-2" aria-hidden="true">
        {hunt.clues.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full ${found.has(i) ? 'bg-primary' : 'bg-muted'}`}
          />
        ))}
      </div>

      {!solved && next >= 0 && (
        <div className="rounded-xl bg-muted/60 border border-border/60 p-2.5 mb-2">
          <p className="text-[11px] leading-snug">
            <span className="font-bold text-primary">Clue {next + 1}:</span> {hunt.clues[next].t}
          </p>
          <p className="text-[10px] opacity-60 mt-1">within {hunt.clues[next].r} m to unlock</p>
        </div>
      )}

      {solved && winner && (
        <p className="text-[11px] font-bold text-primary mb-2" aria-label="Treasure found">
          🏆 {winner.senderName} found the treasure!
        </p>
      )}

      {status && <p className="text-[11px] opacity-80 mb-2">{status}</p>}

      {!settingUp && !done && (
        <div className="flex flex-wrap items-center gap-1.5">
          {!solved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                checkIn()
              }}
              disabled={checking}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-semibold hover:bg-primary/25 transition min-h-[36px] flex items-center gap-1 disabled:opacity-50"
            >
              <MapPin className="w-3 h-3" /> {checking ? 'Locating…' : 'Check in'}
            </button>
          )}
          {solved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDone(challenge)
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px] flex items-center gap-1"
            >
              <Flag className="w-3 h-3" /> Close hunt ✓
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRematch()
            }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]"
          >
            New hunt
          </button>
        </div>
      )}
      {!settingUp && done && (
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] opacity-60 italic">Hunt closed.</p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRematch()
            }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]"
          >
            New hunt
          </button>
        </div>
      )}
    </div>
  )
}
