import { useEffect, useRef } from 'react'
import { fireEffect } from '../utils/messageEffects'

/**
 * Connect Four played through chat messages — no protocol change.
 * Challenge:  `🎮C4:new\n<human text>`
 * Move:       `🎮C4:move:<challengeId>:<col 0-6>` (hidden from history)
 * Both sides derive identical state from the shared message list.
 */

const COLS = 7
const ROWS = 6

export type C4Disc = 'C' | 'O'

const MOVE_RE = /^🎮C4:move:(-?\d+):([0-6])/m

export function isC4Challenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮C4:new')
}

export function isC4Move(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮C4:move:')
}

export interface C4Move {
  col: number
  row: number
  disc: C4Disc
  senderId: number | null
  senderName: string
}

/** Replay valid drops in id order: challenger (🔴) moves first, sides alternate. */
export function collectC4Moves(challengeId: number, challengerId: number | null, msgs: any[]): C4Move[] {
  const heights = Array(COLS).fill(0)
  const out: C4Move[] = []
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const mt = MOVE_RE.exec(m.content || '')
    if (!mt || Number(mt[1]) !== challengeId) continue
    const col = Number(mt[2])
    if (heights[col] >= ROWS) continue
    const disc: C4Disc = out.length % 2 === 0 ? 'C' : 'O'
    const isChallenger = challengerId != null && m.sender_id === challengerId
    if ((disc === 'C') !== isChallenger) continue
    const row = ROWS - 1 - heights[col]
    heights[col] += 1
    out.push({
      col,
      row,
      disc,
      senderId: m.sender_id ?? null,
      senderName: m.sender_display_name || m.sender_username || 'Someone',
    })
  }
  return out
}

export function c4Winner(board: (null | C4Disc)[][]): { winner: C4Disc; line: [number, number][] } | null {
  const at = (r: number, c: number): null | C4Disc =>
    r >= 0 && r < ROWS && c >= 0 && c < COLS ? board[r][c] : null
  const dirs = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1],
  ]
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const d = at(r, c)
      if (!d) continue
      for (const [dr, dc] of dirs) {
        const line: [number, number][] = [[r, c]]
        for (let k = 1; k < 4; k++) {
          if (at(r + dr * k, c + dc * k) !== d) break
          line.push([r + dr * k, c + dc * k])
        }
        if (line.length === 4) return { winner: d, line }
      }
    }
  }
  return null
}

const DISC_EMOJI: Record<C4Disc, string> = { C: '🔴', O: '🟡' }

export function ConnectFourGame({
  challenge,
  msgs,
  meId,
  onMove,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  meId?: number | null
  onMove: (challenge: any, col: number) => void
  onRematch: () => void
}) {
  const moves = collectC4Moves(challenge.id, challenge.sender_id ?? null, msgs)
  const board: (null | C4Disc)[][] = Array.from({ length: ROWS }, () => Array(COLS).fill(null))
  const heights = Array(COLS).fill(0)
  moves.forEach((mv) => {
    board[mv.row][mv.col] = mv.disc
    heights[mv.col] += 1
  })
  const result = c4Winner(board)
  const draw = !result && moves.length >= COLS * ROWS
  const over = !!result || draw
  const turn: C4Disc = moves.length % 2 === 0 ? 'C' : 'O'
  const isChallenger = meId != null && challenge.sender_id === meId
  const settingUp = !(challenge.id > 0)
  const canPlay = !settingUp && !over && (turn === 'C' ? isChallenger : !isChallenger)
  const winCells = new Set((result?.line || []).map(([r, c]) => `${r}:${c}`))
  const iWon = !!result && moves.some((m) => m.disc === result.winner && m.senderId === meId)

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
    : result
      ? `${result.winner === 'C' ? '🔴' : '🟡'} ${moves.find((m) => m.disc === result.winner)?.senderName || 'Someone'} wins! 🎉`
      : draw
        ? "Board's full — draw!"
        : canPlay
          ? `Your turn (${DISC_EMOJI[turn]})`
          : `${DISC_EMOJI[turn]} to move…`

  return (
    <div className="w-full max-w-[240px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">🔴 Connect Four</p>
      <div className="rounded-2xl p-2 bg-[#0b3b8f]/30 border border-border/60">
        <div className="grid grid-cols-7 gap-1 w-full min-w-0">
          {Array.from({ length: ROWS * COLS }, (_, i) => {
            const r = Math.floor(i / COLS)
            const c = i % COLS
            const cell = board[r][c]
            const full = heights[c] >= ROWS
            return (
              <button
                key={i}
                disabled={!canPlay || full}
                onClick={(e) => {
                  e.stopPropagation()
                  onMove(challenge, c)
                }}
                aria-label={`Drop in column ${c + 1}`}
                className={`aspect-square w-full min-w-0 rounded-full flex items-center justify-center text-lg transition active:scale-95 ${
                  cell
                    ? winCells.has(`${r}:${c}`)
                      ? 'bg-primary/30 ring-2 ring-primary'
                      : 'bg-muted/70'
                    : canPlay && !full
                      ? 'bg-muted/40 hover:bg-primary/20 cursor-pointer border border-dashed border-border'
                      : 'bg-muted/40 border border-transparent'
                } ${!canPlay || full ? 'cursor-default' : ''}`}
              >
                {cell ? DISC_EMOJI[cell] : ''}
              </button>
            )
          })}
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] opacity-80">{status}</p>
        {over && !settingUp && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onRematch()
            }}
            className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-medium hover:bg-primary/25 transition shrink-0"
          >
            Rematch
          </button>
        )}
      </div>
    </div>
  )
}
