// Truth-or-Dare + Word Chain: decks, referee, protocol, replay rules.
import { describe, expect, it } from 'vitest'

import {
  DARES,
  TRUTHS,
  collectTod,
  parseTodDone,
  parseTodSpin,
  todCardText,
  todScores,
  isTodChallenge,
} from '../../utils/truthOrDare'
import {
  collectWordChain,
  isWordChainChallenge,
  parseWordChainWord,
} from '../../utils/wordChain'

const msg = (id: number, sender_id: number | null, content: string, name?: string) => ({
  id,
  sender_id,
  sender_display_name: name ?? `u${sender_id}`,
  content,
})

describe('truth-or-dare protocol', () => {
  it('recognizes challenges, spins and dones', () => {
    expect(isTodChallenge('🎮TOD:new\nplay!')).toBe(true)
    expect(isTodChallenge('🎮TTT:new')).toBe(false)
    expect(parseTodSpin('🎮TOD:spin:5:truth:3', 5)).toMatchObject({ kind: 'truth', index: 3 })
    expect(parseTodSpin('🎮TOD:spin:5:dare:99', 5)?.index).toBeLessThan(DARES.length)
    expect(parseTodSpin('🎮TOD:spin:6:truth:3', 5)).toBeNull()
    expect(parseTodDone('🎮TOD:done:5', 5)).toBe(true)
    expect(parseTodDone('🎮TOD:done:6', 5)).toBe(false)
  })

  it('resolves identical cards on both sides from the index', () => {
    const a = todCardText({ kind: 'dare', index: 2, senderId: 1, senderName: 'x' })
    const b = todCardText({ kind: 'dare', index: 2 + DARES.length, senderId: 9, senderName: 'y' })
    expect(a).toBe(b)
    expect(a.length).toBeGreaterThan(10)
  })

  it('replays spins and scores completions', () => {
    const msgs = [
      msg(1, 7, '🎮TOD:new'),
      msg(2, 7, '🎮TOD:spin:9:truth:0'),
      msg(3, 8, '🎮TOD:spin:9:dare:1'),
      msg(4, 8, '🎮TOD:done:9'),
      msg(5, 8, '🎮TOD:done:9'),
      msg(6, 9, '🎮TOD:spin:4:truth:0'), // other challenge: ignored
      { ...msg(7, 7, '🎮TOD:spin:9:truth:2'), is_deleted: true },
    ]
    const { spins, dones } = collectTod(9, msgs)
    expect(spins.length).toBe(2)
    expect(dones.length).toBe(2)
    expect(todScores({ spins, dones })).toEqual([{ name: 'u8', count: 2 }])
  })

  it('decks are non-empty and well-formed', () => {
    expect(TRUTHS.length).toBeGreaterThanOrEqual(10)
    expect(DARES.length).toBeGreaterThanOrEqual(10)
    for (const q of [...TRUTHS, ...DARES]) expect(q.trim().length).toBeGreaterThan(10)
  })
})

describe('word-chain referee', () => {
  it('recognizes challenges and words', () => {
    expect(isWordChainChallenge('🎮WC:new\nplay!')).toBe(true)
    expect(isWordChainChallenge('🎮TTT:new')).toBe(false)
    expect(parseWordChainWord('🎮WC:word:5:Apple', 5)).toBe('apple')
    expect(parseWordChainWord('🎮WC:word:6:Apple', 5)).toBeNull()
  })

  it('chains, rejects and scores', () => {
    const msgs = [
      msg(1, 7, '🎮WC:new'),
      msg(2, 7, '🎮WC:word:9:apple'),
      msg(3, 8, '🎮WC:word:9:elephant'),
      msg(4, 7, '🎮WC:word:9:tiger'),
      msg(5, 8, '🎮WC:word:9:apple'), // repeat
      msg(6, 8, '🎮WC:word:9:zebra'), // wrong letter (needs r)
      msg(7, 8, '🎮WC:word:9:river'),
      msg(8, 7, '🎮WC:word:9:ok'), // too short
      msg(9, 7, '🎮WC:word:9:road-trip'), // non-letters
    ]
    const state = collectWordChain(9, msgs)
    expect(state.valid.map((v) => v.word)).toEqual(['apple', 'elephant', 'tiger', 'river'])
    expect(state.needLetter).toBe('r')
    // 'road-trip' is malformed protocol (non-letters): ignored, not scored.
    expect(state.strikes.map((s) => s.reason)).toEqual([
      'already used',
      'must start with “r”',
      'use letters only (3+)',
    ])
    expect(state.scores).toEqual([
      { name: 'u7', count: 2 },
      { name: 'u8', count: 2 },
    ])
  })

  it('first word can be anything valid, deleted words vanish', () => {
    const msgs = [
      msg(1, 7, '🎮WC:new'),
      { ...msg(2, 7, '🎮WC:word:9:kiwi'), is_deleted: true },
      msg(3, 8, '🎮WC:word:9:mango'),
    ]
    const state = collectWordChain(9, msgs)
    expect(state.valid.map((v) => v.word)).toEqual(['mango'])
    expect(state.needLetter).toBe('o')
  })
})
