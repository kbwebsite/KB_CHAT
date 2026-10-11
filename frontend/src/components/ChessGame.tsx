import { useMemo, useState } from 'react'
import { ShareWinButton } from './ShareWinButton'

/**
 * Chess played entirely through chat messages — no protocol change.
 * Challenge: `🎮CHESS:new\n<human text>` (challenger plays White)
 * Move:      `🎮CHESS:move:<challengeId>:<from><to>` (e.g. e2e4)
 * Both sides derive identical state from the shared message list in id
 * order. White plies must come from the challenger, Black plies from
 * anyone else; illegal/out-of-turn moves are skipped (fail-closed).
 * Promotions auto-queen (noted in the UI); castling + en passant included.
 */

const CHALLENGE_PREFIX = '🎮CHESS:new'
const MOVE_RE = /^🎮CHESS:move:(-?\d+):([a-h][1-8])([a-h][1-8])/m

export function isChessChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(CHALLENGE_PREFIX)
}

export function parseChessMove(text: string): { challengeId: number; from: number; to: number } | null {
  const m = MOVE_RE.exec(text || '')
  if (!m) return null
  return { challengeId: Number(m[1]), from: sq(m[2]), to: sq(m[3]) }
}

export type Color = 'w' | 'b'
export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k'
export interface Piece { t: PieceKind; c: Color }
export type Board = (Piece | null)[]

export function sq(name: string): number {
  const f = name.charCodeAt(0) - 97
  const r = Number(name[1]) - 1
  return r * 8 + f
}

export function sqName(i: number): string {
  return `${String.fromCharCode(97 + (i % 8))}${Math.floor(i / 8) + 1}`
}

const opp = (c: Color): Color => (c === 'w' ? 'b' : 'w')

export function initialBoard(): Board {
  const back: PieceKind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r']
  const b: Board = Array(64).fill(null)
  for (let f = 0; f < 8; f++) {
    b[f] = { t: back[f], c: 'w' }
    b[8 + f] = { t: 'p', c: 'w' }
    b[48 + f] = { t: 'p', c: 'b' }
    b[56 + f] = { t: back[f], c: 'b' }
  }
  return b
}

export interface ChessCtx {
  turn: Color
  wk: boolean
  wq: boolean
  bk: boolean
  bq: boolean
  ep: number | null
}

export function initialCtx(): ChessCtx {
  return { turn: 'w', wk: true, wq: true, bk: true, bq: true, ep: null }
}

const inB = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8
const at = (b: Board, f: number, r: number): Piece | null => (inB(f, r) ? b[r * 8 + f] : null)

/** Squares this piece attacks (pawns attack diagonally, regardless of occupancy). */
function attacksFrom(b: Board, i: number): number[] {
  const p = b[i]
  if (!p) return []
  const f = i % 8
  const r = Math.floor(i / 8)
  const out: number[] = []
  const slide = (df: number, dr: number) => {
    let nf = f + df
    let nr = r + dr
    while (inB(nf, nr)) {
      out.push(nr * 8 + nf)
      if (at(b, nf, nr)) break
      nf += df
      nr += dr
    }
  }
  if (p.t === 'p') {
    const d = p.c === 'w' ? 1 : -1
    for (const df of [-1, 1]) if (inB(f + df, r + d)) out.push((r + d) * 8 + f + df)
  } else if (p.t === 'n') {
    for (const [df, dr] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) {
      if (inB(f + df, r + dr)) out.push((r + dr) * 8 + f + df)
    }
  } else if (p.t === 'k') {
    for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
      if ((df || dr) && inB(f + df, r + dr)) out.push((r + dr) * 8 + f + df)
    }
  } else {
    const dirs =
      p.t === 'r' ? [[1, 0], [-1, 0], [0, 1], [0, -1]]
      : p.t === 'b' ? [[1, 1], [1, -1], [-1, 1], [-1, -1]]
      : [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    dirs.forEach(([df, dr]) => slide(df, dr))
  }
  return out
}

export function isAttacked(b: Board, sqi: number, by: Color): boolean {
  for (let i = 0; i < 64; i++) {
    const p = b[i]
    if (p && p.c === by && attacksFrom(b, i).includes(sqi)) return true
  }
  return false
}

function kingSq(b: Board, c: Color): number {
  return b.findIndex((p) => p && p.t === 'k' && p.c === c)
}

/** Pseudo-legal destinations (captures, pushes, castling, en passant). */
function pseudoMoves(b: Board, i: number, ctx: ChessCtx): number[] {
  const p = b[i]
  if (!p || p.c !== ctx.turn) return []
  const f = i % 8
  const r = Math.floor(i / 8)
  const out: number[] = []
  const push = (nf: number, nr: number, captureOnly = false, quietOnly = false) => {
    if (!inB(nf, nr)) return
    const t = at(b, nf, nr)
    if (t && t.c === p.c) return
    if (captureOnly && !t && !(p.t === 'p' && nr * 8 + nf === ctx.ep)) return
    if (quietOnly && t) return
    out.push(nr * 8 + nf)
  }
  if (p.t === 'p') {
    const d = p.c === 'w' ? 1 : -1
    const home = p.c === 'w' ? 1 : 6
    push(f, r + d, false, true)
    if (r === home && !at(b, f, r + d)) push(f, r + 2 * d, false, true)
    push(f - 1, r + d, true)
    push(f + 1, r + d, true)
  } else if (p.t === 'n' || p.t === 'k') {
    for (const t of attacksFrom(b, i)) {
      const tp = b[t]
      if (!tp || tp.c !== p.c) out.push(t)
    }
    if (p.t === 'k') {
      const home = p.c === 'w' ? 0 : 7
      const rights = p.c === 'w' ? [ctx.wk, ctx.wq] : [ctx.bk, ctx.bq]
      const row = (sq: number) => b[sq]
      if (r === home && f === 4) {
        if (rights[0] && !row(home * 8 + 5) && !row(home * 8 + 6) &&
            !isAttacked(b, i, opp(p.c)) && !isAttacked(b, home * 8 + 5, opp(p.c)) && !isAttacked(b, home * 8 + 6, opp(p.c))) {
          out.push(home * 8 + 6)
        }
        if (rights[1] && !row(home * 8 + 3) && !row(home * 8 + 2) && !row(home * 8 + 1) &&
            !isAttacked(b, i, opp(p.c)) && !isAttacked(b, home * 8 + 3, opp(p.c)) && !isAttacked(b, home * 8 + 2, opp(p.c))) {
          out.push(home * 8 + 2)
        }
      }
    }
  } else {
    for (const t of attacksFrom(b, i)) {
      const tp = b[t]
      if (!tp || tp.c !== p.c) out.push(t)
    }
  }
  return out
}

export interface AppliedMove {
  board: Board
  ctx: ChessCtx
  promotion: boolean
}

/** Apply a pseudo-legal move; caller must verify legality first. */
export function applyMove(b: Board, from: number, to: number, ctx: ChessCtx): AppliedMove {
  const board = [...b]
  const p = board[from]!
  const tf = to % 8
  const promotion = p.t === 'p' && (Math.floor(to / 8) === (p.c === 'w' ? 7 : 0))
  const isCastle = p.t === 'k' && Math.abs(tf - (from % 8)) === 2
  const isEp = p.t === 'p' && to === ctx.ep && !board[to]
  if (isEp) board[to + (p.c === 'w' ? -8 : 8)] = null
  board[to] = promotion ? { t: 'q', c: p.c } : p
  board[from] = null
  if (isCastle) {
    const home = p.c === 'w' ? 0 : 7
    if (tf === 6) {
      board[home * 8 + 5] = board[home * 8 + 7]
      board[home * 8 + 7] = null
    } else {
      board[home * 8 + 3] = board[home * 8 + 0]
      board[home * 8 + 0] = null
    }
  }
  const next: ChessCtx = {
    turn: opp(ctx.turn),
    wk: ctx.wk && !(p.c === 'w' && (from === 4 || from === 7)) && !(p.c === 'b' && to === 7),
    wq: ctx.wq && !(p.c === 'w' && (from === 4 || from === 0)) && !(p.c === 'b' && to === 0),
    bk: ctx.bk && !(p.c === 'b' && (from === 60 || from === 63)) && !(p.c === 'w' && to === 63),
    bq: ctx.bq && !(p.c === 'b' && (from === 60 || from === 56)) && !(p.c === 'w' && to === 56),
    ep: p.t === 'p' && Math.abs(Math.floor(to / 8) - Math.floor(from / 8)) === 2
      ? (from + to) / 2
      : null,
  }
  return { board, ctx: next, promotion }
}

/** Fully legal destinations for a piece. */
export function legalMoves(b: Board, i: number, ctx: ChessCtx): number[] {
  const p = b[i]
  if (!p || p.c !== ctx.turn) return []
  return pseudoMoves(b, i, ctx).filter((to) => {
    const { board } = applyMove(b, i, to, ctx)
    return !isAttacked(board, kingSq(board, p.c), opp(p.c))
  })
}

export function hasAnyMove(b: Board, ctx: ChessCtx): boolean {
  for (let i = 0; i < 64; i++) {
    if (b[i]?.c === ctx.turn && legalMoves(b, i, ctx).length > 0) return true
  }
  return false
}

export type GamePhase = 'playing' | 'checkmate' | 'stalemate'

export function gamePhase(b: Board, ctx: ChessCtx): { phase: GamePhase; inCheck: boolean } {
  const inCheck = isAttacked(b, kingSq(b, ctx.turn), opp(ctx.turn))
  if (hasAnyMove(b, ctx)) return { phase: 'playing', inCheck }
  return { phase: inCheck ? 'checkmate' : 'stalemate', inCheck }
}

export interface ChessPly {
  from: number
  to: number
  senderId: number | null
  senderName: string
  promotion: boolean
  color: Color
}

/** Replay message history into plies; skips out-of-turn/illegal moves. */
export function collectChessMoves(
  challengeId: number,
  challengerId: number | null,
  msgs: any[],
): { plies: ChessPly[]; board: Board; ctx: ChessCtx } {
  let board = initialBoard()
  let ctx = initialCtx()
  const plies: ChessPly[] = []
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const p = parseChessMove(m.content || '')
    if (!p || p.challengeId !== challengeId) continue
    const piece = board[p.from]
    if (!piece || piece.c !== ctx.turn) continue
    const isChallenger = challengerId != null && m.sender_id === challengerId
    if (ctx.turn === 'w' ? !isChallenger : isChallenger) continue
    if (!legalMoves(board, p.from, ctx).includes(p.to)) continue
    const applied = applyMove(board, p.from, p.to, ctx)
    board = applied.board
    ctx = applied.ctx
    plies.push({
      from: p.from,
      to: p.to,
      senderId: m.sender_id ?? null,
      senderName: m.sender_display_name || m.sender_username || 'Someone',
      promotion: applied.promotion,
      color: piece.c,
    })
  }
  return { plies, board, ctx }
}

const GLYPHS: Record<Color, Record<PieceKind, string>> = {
  w: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
  b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
}

export function ChessGame({
  challenge,
  msgs,
  meId,
  onMove,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  meId?: number | null
  onMove: (challenge: any, from: number, to: number) => void
  onRematch: () => void
}) {
  const [selected, setSelected] = useState<number | null>(null)
  const { plies, board, ctx } = collectChessMoves(challenge.id, challenge.sender_id ?? null, msgs)
  const { phase, inCheck } = gamePhase(board, ctx)
  const over = phase !== 'playing'
  const settingUp = !(challenge.id > 0)
  const isChallenger = meId != null && challenge.sender_id === meId
  const myColor: Color | null = meId == null ? null : isChallenger ? 'w' : 'b'
  const canPlay = !settingUp && !over && myColor !== null && ctx.turn === myColor
  const last = plies[plies.length - 1]
  const dests = selected != null && canPlay ? legalMoves(board, selected, ctx) : []
  // Viewer orientation: my color at the bottom (white default).
  const flip = myColor === 'b'
  const order = Array.from({ length: 64 }, (_, k) => k).map((k) => {
    const r = Math.floor(k / 8)
    const f = k % 8
    return flip ? (7 - r) * 8 + (7 - f) : k
  })

  const status = settingUp
    ? 'Setting up…'
    : phase === 'checkmate'
      ? `Checkmate — ${ctx.turn === 'w' ? 'Black' : 'White'} wins! 🏆`
      : phase === 'stalemate'
        ? 'Stalemate — draw!'
        : canPlay
          ? `Your move (${ctx.turn === 'w' ? 'White' : 'Black'})${inCheck ? ' — check!' : ''}`
          : `${ctx.turn === 'w' ? 'White' : 'Black'} to move…`

  const tap = (i: number) => {
    if (!canPlay) return
    if (selected != null && dests.includes(i)) {
      onMove(challenge, selected, i)
      setSelected(null)
      return
    }
    const p = board[i]
    setSelected(p && p.c === ctx.turn ? i : null)
  }

  return (
    <div className="w-full max-w-[280px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">♞ Chess</p>
      <div className="grid grid-cols-8 gap-0.5 w-full min-w-0 rounded-xl overflow-hidden" role="grid" aria-label="Chess board">
        {order.map((i) => {
          const p = board[i]
          const light = (Math.floor(i / 8) + (i % 8)) % 2 === 1
          const isSel = selected === i
          const isDest = dests.includes(i)
          const isLast = last && (last.from === i || last.to === i)
          return (
            <button
              key={i}
              onClick={(e) => {
                e.stopPropagation()
                tap(i)
              }}
              disabled={!canPlay}
              aria-label={p ? `${p.c === 'w' ? 'White' : 'Black'} ${p.t} on ${sqName(i)}` : `Empty ${sqName(i)}`}
              className={`aspect-square w-full min-w-0 min-h-[30px] flex items-center justify-center text-lg leading-none transition active:scale-95 relative ${
                isSel
                  ? 'bg-primary/50'
                  : isLast
                    ? 'bg-amber-500/25'
                    : light
                      ? 'bg-muted/70'
                      : 'bg-muted/30'
              } ${canPlay ? 'cursor-pointer' : 'cursor-default'} disabled:opacity-100`}
            >
              {p && (
                <span
                  aria-hidden="true"
                  className={p.c === 'w' ? 'text-zinc-100' : 'text-zinc-900 dark:text-zinc-950'}
                  style={{ textShadow: p.c === 'w' ? '0 1px 2px rgba(0,0,0,0.8)' : '0 1px 2px rgba(255,255,255,0.35)', fontSize: '1.35rem' }}
                >
                  {GLYPHS[p.c][p.t]}
                </span>
              )}
              {isDest && !p && <span className="w-2 h-2 rounded-full bg-primary/70" aria-hidden="true" />}
              {isDest && p && <span className="absolute inset-0 rounded-none ring-2 ring-inset ring-primary/70" aria-hidden="true" />}
            </button>
          )
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="text-[11px] opacity-80">{status}</p>
        {over && !settingUp && (
          <span className="flex items-center gap-1.5 shrink-0">
            <ShareWinButton
              title="Kryzen Chess"
              text={
                (ctx.turn === 'b' && isChallenger) || (ctx.turn === 'w' && !isChallenger)
                  ? `🏆 I just won Chess in ${plies.length} plies on Kryzen Chat! Think you can beat me?`
                  : `🤝 We finished a ${plies.length}-ply Chess battle on Kryzen Chat!`
              }
            />
            <button onClick={onRematch} className="text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]">
              Rematch
            </button>
          </span>
        )}
      </div>
      <p className="text-[10px] opacity-60 mt-1">White moves first · promotions auto-queen</p>
    </div>
  )
}
