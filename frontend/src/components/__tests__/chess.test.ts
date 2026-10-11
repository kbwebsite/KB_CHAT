// Chess engine: move legality, mates, draws, special moves, replay rules.
import { describe, expect, it } from 'vitest'

import {
  applyMove,
  collectChessMoves,
  gamePhase,
  initialBoard,
  initialCtx,
  isAttacked,
  isChessChallenge,
  legalMoves,
  parseChessMove,
  sq,
  type Board,
} from '../ChessGame'

function play(moves: Array<[number, number]>) {
  let board = initialBoard()
  let ctx = initialCtx()
  for (const [from, to] of moves) {
    expect(legalMoves(board, from, ctx)).toContain(to)
    const applied = applyMove(board, from, to, ctx)
    board = applied.board
    ctx = applied.ctx
  }
  return { board, ctx }
}

describe('protocol', () => {
  it('recognizes challenges and moves', () => {
    expect(isChessChallenge('🎮CHESS:new\nhello')).toBe(true)
    expect(isChessChallenge('🎮TTT:new')).toBe(false)
    expect(parseChessMove('🎮CHESS:move:12:e2e4')).toEqual({ challengeId: 12, from: sq('e2'), to: sq('e4') })
    expect(parseChessMove('nope')).toBeNull()
  })
})

describe('opening legality', () => {
  it('white has 20 first moves', () => {
    const b = initialBoard()
    const ctx = initialCtx()
    let total = 0
    for (let i = 0; i < 64; i++) total += legalMoves(b, i, ctx).length
    expect(total).toBe(20)
  })

  it('rejects blocked and backwards pawns', () => {
    const { board, ctx } = play([[sq('e2'), sq('e4')]])
    expect(legalMoves(board, sq('e2'), { ...ctx, turn: 'w' as const })).toEqual([])
  })
})

describe('mates and draws', () => {
  it("delivers Fool's mate (fastest checkmate)", () => {
    const { board, ctx } = play([
      [sq('f2'), sq('f3')],
      [sq('e7'), sq('e5')],
      [sq('g2'), sq('g4')],
      [sq('d8'), sq('h4')],
    ])
    const { phase } = gamePhase(board, ctx)
    expect(phase).toBe('checkmate')
    expect(ctx.turn).toBe('w')
  })

  it("delivers Scholar's mate", () => {
    const { board, ctx } = play([
      [sq('e2'), sq('e4')],
      [sq('e7'), sq('e5')],
      [sq('f1'), sq('c4')],
      [sq('b8'), sq('c6')],
      [sq('d1'), sq('h5')],
      [sq('g8'), sq('f6')],
      [sq('h5'), sq('f7')],
    ])
    expect(gamePhase(board, ctx).phase).toBe('checkmate')
  })

  it('detects stalemate', () => {
    // King h1 vs king f2 + queen g3, black to move: h1 has no moves, not in check.
    const board: Board = Array(64).fill(null)
    board[sq('h1')] = { t: 'k', c: 'b' }
    board[sq('f2')] = { t: 'k', c: 'w' }
    board[sq('g3')] = { t: 'q', c: 'w' }
    const ctx = { ...initialCtx(), turn: 'b' as const }
    expect(gamePhase(board, ctx).phase).toBe('stalemate')
  })

  it('forbids moving into check', () => {
    // White king e1, white bishop e2 pinned to the e-file by a black rook.
    const board: Board = Array(64).fill(null)
    board[sq('e1')] = { t: 'k', c: 'w' }
    board[sq('e2')] = { t: 'b', c: 'w' }
    board[sq('e8')] = { t: 'r', c: 'b' }
    board[sq('a8')] = { t: 'k', c: 'b' }
    const ctx = { ...initialCtx(), turn: 'w' as const }
    expect(legalMoves(board, sq('e2'), ctx)).toEqual([])
    // Unpinned piece moves freely.
    board[sq('e2')] = null
    board[sq('d2')] = { t: 'b', c: 'w' }
    expect(legalMoves(board, sq('d2'), ctx).length).toBeGreaterThan(0)
  })
})

describe('special moves', () => {
  it('castles kingside with full validation', () => {
    const { board, ctx } = play([
      [sq('e2'), sq('e4')],
      [sq('e7'), sq('e5')],
      [sq('g1'), sq('f3')],
      [sq('b8'), sq('c6')],
      [sq('f1'), sq('c4')],
      [sq('f8'), sq('c5')],
    ])
    expect(legalMoves(board, sq('e1'), { ...ctx, turn: 'w' as const })).toContain(sq('g1'))
    const after = applyMove(board, sq('e1'), sq('g1'), { ...ctx, turn: 'w' as const })
    expect(after.board[sq('g1')]?.t).toBe('k')
    expect(after.board[sq('f1')]?.t).toBe('r')
    expect(after.ctx.wk || after.ctx.wq).toBe(false)
  })

  it('revokes castling after the rook moves', () => {
    const { board, ctx } = play([
      [sq('b1'), sq('c3')],
      [sq('e7'), sq('e5')],
      [sq('a2'), sq('a4')],
      [sq('d7'), sq('d5')],
      [sq('a1'), sq('a3')],
    ])
    expect(ctx.wq).toBe(false)
    expect(legalMoves(board, sq('e1'), { ...ctx, turn: 'w' as const })).not.toContain(sq('c1'))
  })

  it('captures en passant exactly once', () => {
    const { board, ctx } = play([
      [sq('e2'), sq('e4')],
      [sq('a7'), sq('a6')],
      [sq('e4'), sq('e5')],
      [sq('d7'), sq('d5')],
    ])
    const moves = legalMoves(board, sq('e5'), { ...ctx, turn: 'w' as const })
    expect(moves).toContain(sq('d6'))
    const after = applyMove(board, sq('e5'), sq('d6'), { ...ctx, turn: 'w' as const })
    expect(after.board[sq('d5')]).toBeNull()
    expect(after.board[sq('d6')]?.t).toBe('p')
  })

  it('auto-queens on the last rank', () => {
    const board: Board = Array(64).fill(null)
    board[sq('e1')] = { t: 'k', c: 'w' }
    board[sq('a8')] = { t: 'k', c: 'b' }
    board[sq('g7')] = { t: 'p', c: 'w' }
    const ctx = { ...initialCtx(), turn: 'w' as const }
    const after = applyMove(board, sq('g7'), sq('g8'), ctx)
    expect(after.board[sq('g8')]).toEqual({ t: 'q', c: 'w' })
    expect(after.promotion).toBe(true)
  })
})

describe('message replay', () => {
  const msg = (id: number, sender_id: number | null, content: string) => ({
    id,
    sender_id,
    sender_display_name: `u${sender_id}`,
    content,
  })

  it('enforces alternating colors and challenger-white', () => {
    const msgs = [
      msg(1, 7, '🎮CHESS:new'),
      msg(2, 7, '🎮CHESS:move:9:e2e4'),
      msg(3, 7, '🎮CHESS:move:9:e7e5'), // white moving twice: skipped
      msg(4, 8, '🎮CHESS:move:9:e7e5'),
      msg(5, 8, 'garbage'),
      msg(6, 9, '🎮CHESS:move:99:g1f3'), // wrong challenge: skipped
    ]
    const { plies, ctx } = collectChessMoves(9, 7, msgs)
    expect(plies.map((p) => `${p.color}`)).toEqual(['w', 'b'])
    expect(ctx.turn).toBe('w')
  })

  it('skips illegal moves but keeps the chain', () => {
    const msgs = [
      msg(1, 7, '🎮CHESS:new'),
      msg(2, 7, '🎮CHESS:move:9:e2e5'), // illegal pawn leap: skipped
      msg(3, 7, '🎮CHESS:move:9:e2e4'),
      msg(4, 8, '🎮CHESS:move:9:b8b6'), // knight can't reach: skipped
      msg(5, 8, '🎮CHESS:move:9:e7e5'),
    ]
    const { plies } = collectChessMoves(9, 7, msgs)
    expect(plies.length).toBe(2)
  })

  it('ignores deleted messages', () => {
    const msgs = [
      msg(1, 7, '🎮CHESS:new'),
      { ...msg(2, 7, '🎮CHESS:move:9:e2e4'), is_deleted: true },
    ]
    expect(collectChessMoves(9, 7, msgs).plies.length).toBe(0)
  })
})

describe('attack detection', () => {
  it('spots a knight fork pattern', () => {
    const b = initialBoard()
    expect(isAttacked(b, sq('e1'), 'b')).toBe(false)
    expect(isAttacked(b, sq('e2'), 'b')).toBe(false)
  })
})
