import { useEffect, useRef, useState } from 'react'
import { Dices } from 'lucide-react'
import { ShareWinButton } from './ShareWinButton'
import {
  DARES,
  TRUTHS,
  collectTod,
  isTodChallenge,
  todCardText,
  todScores,
  type TodKind,
} from '../utils/truthOrDare'

export { isTodChallenge }

const SPIN_MS = 1200

function pickRandom(): { kind: TodKind; index: number } {
  const kind: TodKind = Math.random() < 0.5 ? 'truth' : 'dare'
  const deck = kind === 'truth' ? TRUTHS : DARES
  return { kind, index: Math.floor(Math.random() * deck.length) }
}

export function TruthOrDareGame({
  challenge,
  msgs,
  onSpin,
  onDone,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  onSpin: (challenge: any, kind: TodKind, index: number) => void
  onDone: (challenge: any) => void
  onRematch: () => void
}) {
  const [spinning, setSpinning] = useState(false)
  const [flash, setFlash] = useState<{ kind: TodKind; index: number } | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  const settingUp = !(challenge.id > 0)
  const { spins, dones } = collectTod(challenge.id, msgs)
  const latest = spins[spins.length - 1] ?? null
  const scores = todScores({ spins, dones })

  useEffect(() => () => {
    if (timer.current) clearInterval(timer.current)
  }, [])

  const spin = () => {
    if (settingUp || spinning) return
    const result = pickRandom()
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) {
      onSpin(challenge, result.kind, result.index)
      return
    }
    setSpinning(true)
    // First paint of the animation must already have a card: otherwise
    // spinning=true + shown=null crashes on shown.kind (null access).
    setFlash(pickRandom())
    const started = Date.now()
    timer.current = setInterval(() => {
      setFlash(pickRandom())
      if (Date.now() - started >= SPIN_MS) {
        if (timer.current) clearInterval(timer.current)
        timer.current = null
        setSpinning(false)
        setFlash(null)
        onSpin(challenge, result.kind, result.index)
      }
    }, 90)
  }

  const shown = flash ?? (latest ? { kind: latest.kind, index: latest.index } : null)

  return (
    <div className="w-full max-w-[260px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">🎡 Truth or Dare</p>
      <div className="rounded-xl bg-muted/60 border border-border/60 p-3 min-h-[96px] flex flex-col items-center justify-center text-center">
        {spinning || shown ? (
          <>
            <p className="text-[10px] font-bold uppercase tracking-widest text-primary">
              {spinning ? 'spinning…' : shown?.kind}
            </p>
            <p className="text-sm font-medium leading-snug mt-1">
              {spinning
                ? (shown
                    ? (shown.kind === 'truth'
                        ? TRUTHS[shown.index % TRUTHS.length]
                        : DARES[shown.index % DARES.length])
                    : 'Shuffling fate…')
                : todCardText({ kind: shown!.kind, index: shown!.index, senderId: null, senderName: '' })}
            </p>
            {!spinning && latest && (
              <p className="text-[11px] opacity-70 mt-1">spun by {latest.senderName}</p>
            )}
          </>
        ) : (
          <p className="text-xs opacity-70">Hit spin — fate picks your truth or dare.</p>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation()
            spin()
          }}
          disabled={settingUp || spinning}
          className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px]"
        >
          <Dices className="w-3.5 h-3.5" aria-hidden="true" /> {spinning ? 'Spinning…' : 'Spin'}
        </button>
        {latest && !spinning && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDone(challenge)
            }}
            className="flex-1 py-2 rounded-xl bg-muted hover:bg-accent text-xs font-semibold min-h-[44px]"
          >
            Done ✓
          </button>
        )}
      </div>
      {scores.length > 0 && (
        <p className="text-[11px] opacity-80 mt-2" aria-label="Truth or dare scores">
          🏅 {scores.map((s) => `${s.name} ${s.count}`).join(' · ')}
        </p>
      )}
      {!settingUp && (
        <button onClick={onRematch} className="mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]">
          New round
        </button>
      )}
      <ShareWinButton
        title="Kryzen Truth or Dare"
        text={`🎡 We played Truth or Dare on Kryzen Chat — ${dones.length} dare${dones.length === 1 ? '' : 's'} conquered! Spin with us?`}
      />
    </div>
  )
}
