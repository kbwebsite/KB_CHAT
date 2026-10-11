// Murder-mystery night: packs, hidden markers, strikes, winner.
import { describe, expect, it } from 'vitest'
import {
  MYS_PACKS,
  collectMys,
  isMysChallenge,
  isMysMove,
  mysNextClue,
  mysPack,
  mysStrikes,
  mysWinner,
  parseMysPackId,
} from '../mystery'

describe('murder-mystery protocol', () => {
  it('detects cards and hidden markers', () => {
    expect(isMysChallenge('🎮MYS:new:manor\nAmy started a murder mystery')).toBe(true)
    expect(isMysChallenge('🎮MYS:clue:5:0')).toBe(false)
    expect(isMysChallenge('🎮TTT:new')).toBe(false)
    expect(isMysMove('🎮MYS:clue:5:0')).toBe(true)
    expect(isMysMove('🎮MYS:accuse:5:2')).toBe(true)
    expect(isMysMove('🎮MYS:done:5')).toBe(true)
    expect(isMysMove('🎮MYS:new:manor')).toBe(false)
    expect(isMysMove(null)).toBe(false)
  })

  it('resolves packs with a safe default', () => {
    expect(mysPack('train').title).toBe('Murder on the Mail Train')
    expect(mysPack('nope').id).toBe('manor')
    expect(parseMysPackId('🎮MYS:new:ship\nx')).toBe('ship')
    expect(parseMysPackId('🎮MYS:new\nx')).toBeNull()
    for (const p of MYS_PACKS) {
      expect(p.suspects.length).toBeGreaterThanOrEqual(4)
      expect(p.clues.length).toBeGreaterThanOrEqual(4)
      expect(p.killer).toBeGreaterThanOrEqual(0)
      expect(p.killer).toBeLessThan(p.suspects.length)
    }
  })

  it('reduces clues, accuses and close in order', () => {
    const msgs = [
      { id: 1, sender_id: 7, sender_display_name: 'Amy', content: '🎮MYS:clue:9:1' },
      { id: 2, sender_id: 7, sender_display_name: 'Amy', content: '🎮MYS:clue:9:0' },
      { id: 3, sender_id: 8, sender_display_name: 'Bo', content: '🎮MYS:accuse:9:0' },
      { id: 4, sender_id: 7, sender_display_name: 'Amy', content: '🎮MYS:accuse:9:3' },
      { id: 5, sender_id: 7, sender_display_name: 'Amy', content: '🎮MYS:clue:9:0' },
      { id: 6, sender_id: 9, sender_display_name: 'Cy', content: '🎮MYS:done:9' },
      { id: 7, content: '🎮MYS:clue:4:0' },
      { id: 8, content: '🎮MYS:accuse:9:1', is_deleted: true },
    ]
    const s = collectMys(9, msgs)
    expect(s.clues).toEqual([0, 1])
    expect(s.accuses.map((a) => a.suspect)).toEqual([0, 3])
    expect(s.done).toBe(true)
    expect(collectMys(4, msgs).done).toBe(false)
  })

  it('scores strikes and finds the first correct accusation', () => {
    const killer = MYS_PACKS[0].killer
    const wrong = (killer + 1) % MYS_PACKS[0].suspects.length
    const accuses = [
      { senderId: 7, senderName: 'Amy', suspect: wrong, id: 1 },
      { senderId: 7, senderName: 'Amy', suspect: killer, id: 2 },
      { senderId: 8, senderName: 'Bo', suspect: wrong, id: 3 },
    ]
    expect(mysStrikes(accuses, 7, killer)).toBe(1)
    expect(mysStrikes(accuses, 8, killer)).toBe(1)
    expect(mysStrikes(accuses, null, killer)).toBe(0)
    expect(mysWinner(accuses, killer)?.senderName).toBe('Amy')
    expect(mysWinner([{ senderId: 8, senderName: 'Bo', suspect: wrong, id: 3 }], killer)).toBeNull()
  })

  it('reveals clues in order until none remain', () => {
    expect(mysNextClue([], 3)).toBe(0)
    expect(mysNextClue([0, 2], 3)).toBe(1)
    expect(mysNextClue([0, 1, 2], 3)).toBe(-1)
  })
})
