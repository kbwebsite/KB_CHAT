import { useState } from 'react'
import { Sparkles } from 'lucide-react'
import { aiApi } from '../services/api'
import {
  MYS_WRONG_OUT,
  collectMys,
  isMysChallenge,
  mysNextClue,
  mysPack,
  mysStrikes,
  mysWinner,
  parseMysPackId,
} from '../utils/mystery'

export { isMysChallenge }

export function MysteryGame({
  challenge,
  msgs,
  meId,
  onClue,
  onAccuse,
  onDone,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  meId?: number | null
  onClue: (challenge: any, n: number) => void
  onAccuse: (challenge: any, suspect: number) => void
  onDone: (challenge: any) => void
  onRematch: () => void
}) {
  const settingUp = !(challenge.id > 0)
  const pack = mysPack(parseMysPackId(challenge.content))
  const { clues, accuses, done } = collectMys(challenge.id, msgs)
  const winner = mysWinner(accuses, pack.killer)
  const solved = !!winner
  const myStrikes = mysStrikes(accuses, meId ?? null, pack.killer)
  const lockedOut = myStrikes >= MYS_WRONG_OUT
  const next = mysNextClue(clues, pack.clues.length)

  const [hint, setHint] = useState<string | null>(null)
  const [hintBusy, setHintBusy] = useState(false)

  const askHost = async () => {
    if (hintBusy || settingUp) return
    setHintBusy(true)
    try {
      const shown = clues.map((i) => `• ${pack.clues[i]}`).join('\n')
      const res: any = await aiApi.chat(
        `You host a murder-mystery party game "${pack.title}". Story: ${pack.story}\n` +
          `Suspects: ${pack.suspects.join(', ')}.\nRevealed clues:\n${shown || '(none yet)'}\n` +
          `Give ONE short atmospheric nudge (max 2 lines) pointing at the clues WITHOUT naming or hinting who the killer is. No preamble.`,
      )
      const reply = (res?.data?.reply || '').trim()
      setHint(reply || 'The candles flicker… re-read the clues. 🕯️')
    } catch {
      setHint('AI host off — clues-vechu discuss panni kandupidinga! 🔍')
    } finally {
      setHintBusy(false)
    }
  }

  return (
    <div className="w-full max-w-[280px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-1 flex items-center gap-1.5">🎭 Murder Mystery</p>
      <p className="text-xs font-bold text-primary mb-1">{pack.title}</p>
      <p className="text-[11px] opacity-70 italic leading-snug mb-2">{pack.story}</p>

      <div className="flex flex-wrap gap-1.5 mb-2">
        {pack.suspects.map((s, i) => {
          const votes = accuses.filter((a) => a.suspect === i).length
          const isKiller = solved && i === pack.killer
          const disabled = settingUp || solved || done || lockedOut
          return (
            <button
              key={i}
              disabled={disabled}
              onClick={(e) => {
                e.stopPropagation()
                onAccuse(challenge, i)
              }}
              title={disabled ? s : `Accuse ${s}`}
              className={`text-[11px] px-2 py-1.5 rounded-lg font-semibold min-h-[36px] transition ${
                isKiller
                  ? 'bg-destructive/25 text-destructive ring-1 ring-destructive/50'
                  : solved
                    ? 'bg-muted opacity-50'
                    : 'bg-muted hover:bg-accent'
              } disabled:opacity-60`}
            >
              {s}
              {votes > 0 && <span className="ml-1 opacity-70">×{votes}</span>}
              {isKiller && ' 🔪'}
            </button>
          )
        })}
      </div>

      {clues.length > 0 && (
        <div className="rounded-xl bg-muted/60 border border-border/60 p-2.5 mb-2 space-y-1.5">
          {clues.map((i) => (
            <p key={i} className="text-[11px] leading-snug">
              <span className="font-bold text-primary">Clue {i + 1}:</span> {pack.clues[i]}
            </p>
          ))}
        </div>
      )}

      {solved && winner && (
        <p className="text-[11px] font-bold text-primary mb-2" aria-label="Mystery solved">
          🎉 {winner.senderName} caught {pack.suspects[pack.killer]}!
        </p>
      )}
      {!solved && lockedOut && (
        <p className="text-[11px] opacity-70 mb-2">🔒 2 wrong guesses — neenga out. Clue reveal pannalaam.</p>
      )}

      {hint && (
        <p className="text-[11px] leading-snug rounded-xl bg-primary/10 border border-primary/25 p-2.5 mb-2">
          <span className="font-bold">AI host:</span> {hint}
        </p>
      )}

      {!settingUp && !done && (
        <div className="flex flex-wrap items-center gap-1.5">
          {next >= 0 && !solved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onClue(challenge, next)
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-semibold hover:bg-primary/25 transition min-h-[36px]"
            >
              🔍 Reveal clue ({clues.length + 1}/{pack.clues.length})
            </button>
          )}
          {!solved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                void askHost()
              }}
              disabled={hintBusy}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-medium hover:bg-primary/25 transition min-h-[36px] flex items-center gap-1 disabled:opacity-50"
            >
              <Sparkles className="w-3 h-3" /> {hintBusy ? 'Thinking…' : 'AI hint'}
            </button>
          )}
          {solved && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onDone(challenge)
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]"
            >
              Close case ✓
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRematch()
            }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]"
          >
            New mystery
          </button>
        </div>
      )}
      {!settingUp && done && (
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] opacity-60 italic">Case closed.</p>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRematch()
            }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]"
          >
            New mystery
          </button>
        </div>
      )}
    </div>
  )
}
