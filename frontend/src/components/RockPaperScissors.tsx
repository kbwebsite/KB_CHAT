import { useEffect, useRef } from 'react'
import { fireEffect } from '../utils/messageEffects'
import { ShareWinButton } from './ShareWinButton'

/**
 * Rock-paper-scissors played through chat messages — no protocol change.
 * Challenge:  `🎮RPS:new\n<human text>`
 * Throw:      `🎮RPS:move:<challengeId>:<rock|paper|scissors>` (hidden from history)
 * Throws stay secret until both players have thrown, then both reveal at once.
 * Both sides derive identical state from the shared message list.
 */

export type RpsChoice = 'rock' | 'paper' | 'scissors'

const MOVE_RE = /^🎮RPS:move:(-?\d+):(rock|paper|scissors)/m

export function isRpsChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮RPS:new')
}

export function isRpsMove(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮RPS:move:')
}

const EMOJI: Record<RpsChoice, string> = { rock: '✊', paper: '✋', scissors: '✌️' }
const NAME: Record<RpsChoice, string> = { rock: 'Rock', paper: 'Paper', scissors: 'Scissors' }
const BEATS: Record<RpsChoice, RpsChoice> = { rock: 'scissors', scissors: 'paper', paper: 'rock' }

export function rpsWinner(
  a: RpsChoice,
  b: RpsChoice,
): 'a' | 'b' | 'draw' {
  if (a === b) return 'draw'
  return BEATS[a] === b ? 'a' : 'b'
}

export interface RpsThrow {
  senderId: number | null
  senderName: string
  choice: RpsChoice
}

/** First throw per player only (challenger + first opponent to throw). */
export function collectRpsThrows(challengeId: number, challengerId: number | null, msgs: any[]): RpsThrow[] {
  const out: RpsThrow[] = []
  const thrownBy = new Set<number | null>()
  const sorted = [...msgs].sort((x, y) => x.id - y.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const mt = /^🎮RPS:move:(-?\d+):(rock|paper|scissors)/m.exec(m.content || '')
    if (!mt || Number(mt[1]) !== challengeId) continue
    const isChallenger = challengerId != null && m.sender_id === challengerId
    // Two seats only: the challenger, and whoever throws first against them.
    if (out.length >= 2) break
    if (thrownBy.has(m.sender_id)) continue
    if (out.length === 1 && isChallenger === (out[0].senderId === challengerId)) {
      // Same side tried to throw twice — only one seat per side.
      const firstIsChallenger = out[0].senderId === challengerId
      if (isChallenger === firstIsChallenger) continue
    }
    thrownBy.add(m.sender_id)
    out.push({
      senderId: m.sender_id ?? null,
      senderName: m.sender_display_name || m.sender_username || 'Someone',
      choice: mt[2] as RpsChoice,
    })
  }
  return out
}

export function RpsGame({
  challenge,
  msgs,
  meId,
  onThrow,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  meId?: number | null
  onThrow: (challenge: any, choice: RpsChoice) => void
  onRematch: () => void
}) {
  const challengerId = challenge.sender_id ?? null
  const isChallenger = meId != null && challengerId === meId
  const throws = collectRpsThrows(challenge.id, challengerId, msgs)
  const myThrow = throws.find((t) => t.senderId === meId)
  const oppThrow = throws.find((t) => t.senderId !== meId)
  const settingUp = !(challenge.id > 0)
  const revealed = throws.length >= 2
  const result = revealed ? rpsWinner(throws[0].choice, throws[1].choice) : null
  const iWon =
    revealed &&
    result !== 'draw' &&
    ((result === 'a' && throws[0].senderId === meId) ||
      (result === 'b' && throws[1].senderId === meId))
  // Seat enforcement lives in collectRpsThrows (first throw per side wins);
  // here it's enough that I haven't thrown yet.
  const playable = !settingUp && !revealed && !myThrow

  const firedRef = useRef(false)
  useEffect(() => {
    // Celebrate exactly once per game — and only on the winner's device.
    if (iWon && !firedRef.current) {
      firedRef.current = true
      setTimeout(() => fireEffect('confetti'), 350)
    }
  }, [iWon])

  const status = settingUp
    ? 'Setting up…'
    : revealed
      ? result === 'draw'
        ? "It's a draw!"
        : iWon
          ? 'You win! 🎉'
          : `${(result === 'a' ? throws[0] : throws[1]).senderName} wins!`
      : myThrow
        ? 'Waiting for opponent…'
        : 'Pick your throw!'

  return (
    <div className="min-w-0 w-full max-w-[240px] overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">✊✋✌️ Rock-Paper-Scissors</p>
      <div className="flex gap-2">
        {(['rock', 'paper', 'scissors'] as RpsChoice[]).map((c) => {
          const mine = myThrow?.choice === c
          const theirs = revealed && oppThrow?.choice === c && oppThrow.senderId !== meId
          return (
            <button
              key={c}
              disabled={!playable}
              onClick={(e) => {
                e.stopPropagation()
                onThrow(challenge, c)
              }}
              aria-label={`Throw ${NAME[c]}`}
              title={NAME[c]}
              className={`flex-1 aspect-square min-w-0 min-h-[52px] rounded-xl text-2xl flex items-center justify-center transition active:scale-95 border ${
                mine
                  ? 'bg-primary/20 border-primary'
                  : theirs && revealed
                    ? 'bg-muted border-primary/50'
                    : 'bg-muted/60 border-border/60'
              } ${playable ? 'hover:bg-primary/15 cursor-pointer' : 'cursor-default'}`}
            >
              {revealed || mine ? EMOJI[c] : <span className="opacity-30">{EMOJI[c]}</span>}
            </button>
          )
        })}
      </div>
      {!!myThrow && !revealed && (
        <p className="text-[11px] mt-1.5 opacity-80">
          You threw {EMOJI[myThrow.choice]} — hidden until they throw
        </p>
      )}
      {revealed && (
        <div className="mt-2 text-[11px] space-y-0.5 opacity-90">
          <p>
            {throws[0].senderName}: {EMOJI[throws[0].choice]} {NAME[throws[0].choice]}
          </p>
          <p>
            {throws[1].senderName}: {EMOJI[throws[1].choice]} {NAME[throws[1].choice]}
          </p>
        </div>
      )}
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] opacity-80">{status}</p>
        {revealed && !settingUp && (
          <span className="flex items-center gap-1.5 shrink-0">
            <ShareWinButton
              title="Kryzen Rock-Paper-Scissors"
              text={
                iWon && myThrow
                  ? `🏆 I just won Rock-Paper-Scissors on Kryzen Chat with ${EMOJI[myThrow.choice]}! Think you can beat me?`
                  : result === 'draw'
                    ? `🤝 Rock-Paper-Scissors draw on Kryzen Chat — ${EMOJI[throws[0].choice]} vs ${EMOJI[throws[1].choice]}!`
                    : `😅 ${(result === 'a' ? throws[0] : throws[1]).senderName} beat me at Rock-Paper-Scissors on Kryzen Chat — I want a rematch!`
              }
            />
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRematch()
              }}
              className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-medium hover:bg-primary/25 transition shrink-0"
            >
              Rematch
            </button>
          </span>
        )}
      </div>
    </div>
  )
}
