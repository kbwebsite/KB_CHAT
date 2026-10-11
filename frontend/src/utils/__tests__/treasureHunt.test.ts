// Treasure hunt: payload parsing, GPS math, checkpoint reduction.
import { describe, expect, it } from 'vitest'
import {
  collectTH,
  haversineM,
  isTHChallenge,
  isTHMove,
  parseTHunt,
  thNext,
} from '../treasureHunt'

const HUNT = (clues: any) =>
  `🎮TH:new\n${JSON.stringify({ title: 'Campus dash', clues })}\nAmy hid a treasure`

describe('treasure-hunt protocol', () => {
  it('detects cards and hidden markers', () => {
    expect(isTHChallenge(HUNT([]))).toBe(true)
    expect(isTHChallenge('🎮TH:found:5:0')).toBe(false)
    expect(isTHChallenge('🎮TTT:new')).toBe(false)
    expect(isTHMove('🎮TH:found:5:0')).toBe(true)
    expect(isTHMove('🎮TH:done:5')).toBe(true)
    expect(isTHMove(HUNT([]))).toBe(false)
    expect(isTHMove(null)).toBe(false)
  })

  it('parses and sanitizes hunt payloads', () => {
    const h = parseTHunt(HUNT([{ t: 'Banyan shade', la: 13.0, lo: 80.2, r: 50 }]))
    expect(h?.title).toBe('Campus dash')
    expect(h?.clues[0]).toEqual({ t: 'Banyan shade', la: 13, lo: 80.2, r: 50 })
    expect(parseTHunt('🎮TH:new\nnot-json')).toBeNull()
    expect(parseTHunt(HUNT([]))).toBeNull()
    expect(parseTHunt(HUNT([{ t: '', la: 13, lo: 80 }]))).toBeNull()
    expect(parseTHunt(HUNT([{ t: 'x', la: 200, lo: 80 }]))).toBeNull()
    const big = parseTHunt(
      HUNT(Array.from({ length: 9 }, (_, i) => ({ t: `c${i}`, la: 13, lo: 80 }))),
    )
    expect(big?.clues.length).toBe(6)
  })

  it('measures metres between GPS points', () => {
    expect(haversineM(13.0, 80.2, 13.0, 80.2)).toBe(0)
    // ~111 m per 0.001° latitude.
    const d = haversineM(13.0, 80.2, 13.001, 80.2)
    expect(d).toBeGreaterThan(100)
    expect(d).toBeLessThan(125)
  })

  it('keeps the first finder per checkpoint, in order', () => {
    const msgs = [
      { id: 1, sender_id: 7, sender_display_name: 'Amy', content: '🎮TH:found:9:0' },
      { id: 2, sender_id: 8, sender_display_name: 'Bo', content: '🎮TH:found:9:0' },
      { id: 3, sender_id: 8, sender_display_name: 'Bo', content: '🎮TH:found:9:1' },
      { id: 4, sender_id: 7, sender_display_name: 'Amy', content: '🎮TH:found:4:0' },
      { id: 5, content: '🎮TH:done:9' },
    ]
    const s = collectTH(9, msgs)
    expect(s.found.get(0)?.senderName).toBe('Amy')
    expect(s.found.get(1)?.senderName).toBe('Bo')
    expect(s.done).toBe(true)
    expect(collectTH(4, msgs).done).toBe(false)
    expect(thNext(s.found, 3)).toBe(2)
    expect(thNext(s.found, 2)).toBe(-1)
    expect(thNext(new Map(), 2)).toBe(0)
  })
})
