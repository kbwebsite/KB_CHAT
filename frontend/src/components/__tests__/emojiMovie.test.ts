// Emoji movie game: deck integrity, normalization, shared-state derivation.
import { describe, expect, it } from 'vitest'
import {
  EMOJI_DECK,
  isEmojiChallenge,
  parseEmojiGuess,
  normalizeGuess,
  puzzleFor,
  collectEmojiGuesses,
  emojiWinner,
} from '../EmojiMovieGame'
import { prettyPreview, isGameMoveMsg } from '../../utils/messageEffects'

function challengeMsg(id: number) {
  return {
    id,
    conversation_id: 9,
    sender_id: 7,
    sender_display_name: 'Amy',
    content: '🎮EMOJI:new\nAmy started an emoji movie game — guess the movie!',
    is_deleted: false,
  }
}

function guessMsg(id: number, cid: number, guess: string, sender = 8) {
  return {
    id,
    conversation_id: 9,
    sender_id: sender,
    sender_display_name: sender === 7 ? 'Amy' : 'Bob',
    content: `🎮EMOJI:move:${cid}:${guess}`,
    is_deleted: false,
  }
}

describe('emoji deck', () => {
  it('has enough unique, well-formed puzzles', () => {
    expect(EMOJI_DECK.length).toBeGreaterThanOrEqual(20)
    const titles = new Set<string>()
    for (const p of EMOJI_DECK) {
      expect(p.emoji.trim().length).toBeGreaterThan(0)
      expect(p.title.trim().length).toBeGreaterThan(1)
      expect(titles.has(p.title)).toBe(false)
      titles.add(p.title)
    }
  })

  it('derives puzzles deterministically within deck bounds', () => {
    for (const id of [1, 2, 99, 1000, -5, 0]) {
      const a = puzzleFor(id)
      const b = puzzleFor(id)
      expect(a).toBe(b)
      expect(EMOJI_DECK).toContain(a)
    }
  })
})

describe('guess normalization', () => {
  it('ignores case, spacing, punctuation, and leading the', () => {
    expect(normalizeGuess('  The Lion King! ')).toBe('lion king')
    expect(normalizeGuess('LION   KING')).toBe('lion king')
    expect(normalizeGuess("-Schindler's List?")).toBe('schindlers list')
  })

  it('detects challenges and parses guesses', () => {
    expect(isEmojiChallenge('🎮EMOJI:new\nhello')).toBe(true)
    expect(isEmojiChallenge('🎮TTT:new\nhello')).toBe(false)
    expect(isEmojiChallenge(null)).toBe(false)
    expect(parseEmojiGuess('🎮EMOJI:move:42:  Titanic? ')).toEqual({ challengeId: 42, guess: '  Titanic? ' })
    expect(parseEmojiGuess('🎮EMOJI:move:abc:x')).toBeNull()
    expect(parseEmojiGuess('hello')).toBeNull()
  })
})

describe('shared game state', () => {
  it('collects guesses in id order, skipping deleted/foreign/empty', () => {
    const msgs = [
      guessMsg(3, 50, 'Titanic'),
      guessMsg(2, 50, 'Avatar'),
      { ...guessMsg(4, 50, 'Titanic'), is_deleted: true },
      guessMsg(5, 51, 'Titanic'),
      guessMsg(6, 50, '   '),
    ]
    const out = collectEmojiGuesses(50, msgs)
    expect(out.map((g) => g.guess)).toEqual(['Avatar', 'Titanic'])
    expect(out[0].senderName).toBe('Bob')
  })

  it('first exact normalized guess wins, from any player', () => {
    const puzzle = { emoji: '🚢🧊💔', title: 'Titanic' }
    const guesses = [
      { guess: 'Avatar', senderId: 8, senderName: 'Bob' },
      { guess: 'titanic!', senderId: 7, senderName: 'Amy' },
      { guess: 'Titanic', senderId: 9, senderName: 'Cat' },
    ]
    expect(emojiWinner(puzzle, guesses)?.senderName).toBe('Amy')
    expect(emojiWinner(puzzle, [{ guess: 'Avatar', senderId: 8, senderName: 'Bob' }])).toBeNull()
    expect(emojiWinner(puzzle, [])).toBeNull()
  })

  it('integrates with message previews and hidden-move filtering', () => {
    expect(prettyPreview('🎮EMOJI:new\nAmy started')).toBe('🎬 Emoji movie game')
    expect(prettyPreview('🎮EMOJI:move:50:Titanic')).toBe('🎮 Game move')
    expect(isGameMoveMsg('🎮EMOJI:move:50:x')).toBe(true)
    expect(isGameMoveMsg('🎮EMOJI:new\nx')).toBe(false)
  })

  it('resolves a full round deterministically', () => {
    const cid = 777
    const puzzle = puzzleFor(cid)
    const msgs = [challengeMsg(cid), guessMsg(cid + 1, cid, 'wrong answer'), guessMsg(cid + 2, cid, puzzle.title.toUpperCase() + '!!')]
    const winner = emojiWinner(puzzle, collectEmojiGuesses(cid, msgs))
    expect(winner?.guess).toContain(puzzle.title.toUpperCase())
  })
})
