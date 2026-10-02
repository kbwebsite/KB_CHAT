import { useEffect, useRef } from 'react'
import { fireEffect } from '../utils/messageEffects'
import { ShareWinButton } from './ShareWinButton'

/**
 * Tic-tac-toe played entirely through chat messages — no protocol change.
 * Challenge:  `🎮TTT:new\n<human text>`
 * Move:       `🎮TTT:move:<challengeId>:<pos 0-8>\n<human text>`
 * Both sides derive identical state from the shared message list.
 */

const CHALLENGE_PREFIX = '🎮TTT:new'
const MOVE_RE = /^🎮TTT:move:(-?\d+):([0-8])/m

export function isTTTChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(CHALLENGE_PREFIX)
}

export function parseTTTTMove(text: string): { challengeId: number; pos: number } | null {
  const m = MOVE_RE.exec(text || '')
  if (!m) return null
  return { challengeId: Number(m[1]), pos: Number(m[2]) }
}

const CELLS = [
  'top-left', 'top-center', 'top-right',
  'middle-left', 'center', 'middle-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]

export function cellName(pos: number): string {
  return CELLS[pos] || `cell ${pos + 1}`
}

const LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
]

export interface TTTMove {
  pos: number
  symbol: 'X' | 'O'
  senderId: number | null
  senderName: string
}

/** Replay valid moves in id order: X moves first (challenger), players alternate. */
export function collectMoves(challengeId: number, challengerId: number | null, msgs: any[]): TTTMove[] {
  const out: TTTMove[] = []
  const taken = new Set<number>()
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const p = parseTTTTMove(m.content || '')
    if (!p || p.challengeId !== challengeId) continue
    if (taken.has(p.pos)) continue
    const symbol: 'X' | 'O' = out.length % 2 === 0 ? 'X' : 'O'
    const isChallenger = challengerId != null && m.sender_id === challengerId
    if (symbol === 'X' ? !isChallenger : isChallenger) continue
    taken.add(p.pos)
    out.push({
      pos: p.pos,
      symbol,
      senderId: m.sender_id ?? null,
      senderName: m.sender_display_name || m.sender_username || 'Someone',
    })
  }
  return out
}

export function tttWinner(board: (null | 'X' | 'O')[]): 'X' | 'O' | null {
  for (const [a, b, c] of LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a]
  }
  return null
}

export function TicTacToeGame({
  challenge,
  msgs,
  meId,
  onMove,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  meId?: number | null
  onMove: (challenge: any, pos: number) => void
  onRematch: () => void
}) {
  const moves = collectMoves(challenge.id, challenge.sender_id ?? null, msgs)
  const board: (null | 'X' | 'O')[] = Array(9).fill(null)
  moves.forEach((mv) => {
    board[mv.pos] = mv.symbol
  })
  const winner = tttWinner(board)
  const draw = !winner && moves.length >= 9
  const over = !!winner || draw
  const turn: 'X' | 'O' = moves.length % 2 === 0 ? 'X' : 'O'
  const isChallenger = meId != null && challenge.sender_id === meId
  const settingUp = !(challenge.id > 0)
  const canPlay = !settingUp && !over && (turn === 'X' ? isChallenger : !isChallenger)
  const iWon = winner != null && moves.some((m) => m.symbol === winner && m.senderId === meId)

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
    : winner
      ? `${winner === 'X' ? 'X' : 'O'} wins! 🎉`
      : draw
        ? "It's a draw!"
        : canPlay
          ? `Your turn (${turn})`
          : `${turn === 'X' ? 'X' : 'O'} to move…`

  return (
    <div className="w-full max-w-[240px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">🎮 Tic-Tac-Toe</p>
      <div className="grid grid-cols-3 gap-1.5 w-full min-w-0">
        {board.map((cell, i) => (
          <button
            key={i}
            disabled={!canPlay || !!cell}
            onClick={(e) => {
              e.stopPropagation()
              onMove(challenge, i)
            }}
            aria-label={`Play ${cellName(i)}`}
            className={`aspect-square w-full min-w-0 min-h-[44px] rounded-xl text-xl font-bold flex items-center justify-center transition active:scale-95 ${
              cell === 'X'
                ? 'text-primary'
                : cell === 'O'
                  ? 'text-muted-foreground'
                  : canPlay
                    ? 'hover:bg-primary/15 cursor-pointer'
                    : 'cursor-default'
            } bg-muted/60 border border-border/60 disabled:opacity-100`}
          >
            {cell || (canPlay ? <span className="opacity-0 hover:opacity-40">{turn}</span> : '')}
          </button>
        ))}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] opacity-80">{status}</p>
        {over && !settingUp && (
          <span className="flex items-center gap-1.5 shrink-0">
            <ShareWinButton
              title="Kryzen Tic-Tac-Toe"
              text={
                winner && iWon
                  ? `🏆 I just won Tic-Tac-Toe in ${moves.length} moves on Kryzen Chat! Think you can beat me?`
                  : draw
                    ? `🤝 We drew a ${moves.length}-move Tic-Tac-Toe battle on Kryzen Chat!`
                    : `😅 ${moves.find((m) => winner && m.symbol === winner)?.senderName || 'Someone'} beat me at Tic-Tac-Toe on Kryzen Chat — I want a rematch!`
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

