// Watch-together rooms: URL parsing, sync markers, drift tolerance.
import { describe, expect, it } from 'vitest'
import {
  collectWTState,
  isDirectMediaUrl,
  isWTChallenge,
  isWTMove,
  needsSeek,
  parseWTState,
  parseWTUrl,
  parseYouTubeId,
} from '../watchTogether'

describe('watch-together protocol', () => {
  it('detects room cards, rejects the rest', () => {
    expect(isWTChallenge('🎮WT:new\nhttps://youtu.be/abc123')).toBe(true)
    expect(isWTChallenge('🎮WT:move:5:play:10')).toBe(false)
    expect(isWTChallenge('🎮TTT:new')).toBe(false)
    expect(isWTChallenge(null)).toBe(false)
  })

  it('detects hidden sync markers', () => {
    expect(isWTMove('🎮WT:move:5:play:10')).toBe(true)
    expect(isWTMove('🎮WT:new\nhttps://x')).toBe(false)
    expect(isWTMove(null)).toBe(false)
  })

  it('extracts the shared URL (first token only)', () => {
    expect(parseWTUrl('🎮WT:new\nhttps://youtu.be/abc123\nAmy started a watch party')).toBe(
      'https://youtu.be/abc123',
    )
    expect(parseWTUrl('🎮WT:new\nnot-a-url')).toBeNull()
    expect(parseWTUrl('hello')).toBeNull()
  })

  it('parses YouTube ids from watch/embed/shorts/share URLs', () => {
    expect(parseYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(parseYouTubeId('https://example.com/video.mp4')).toBeNull()
  })

  it('detects direct media files only', () => {
    expect(isDirectMediaUrl('https://cdn.example.com/clip.mp4')).toBe(true)
    expect(isDirectMediaUrl('https://cdn.example.com/clip.mp4?token=abc')).toBe(true)
    expect(isDirectMediaUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(false)
    expect(isDirectMediaUrl('not-a-url')).toBe(false)
  })

  it('parses sync markers and keeps the latest per room', () => {
    expect(parseWTState('🎮WT:move:9:play:42', 3)).toEqual({ roomId: 9, action: 'play', pos: 42, id: 3 })
    expect(parseWTState('🎮WT:move:9:dance:42')).toBeNull()
    expect(parseWTState('hello')).toBeNull()
    const msgs = [
      { id: 1, content: '🎮WT:move:9:play:10' },
      { id: 2, content: '🎮WT:move:9:pause:25' },
      { id: 3, content: '🎮WT:move:8:play:99' },
      { id: 4, content: '🎮WT:move:9:seek:40', is_deleted: true },
    ]
    expect(collectWTState(9, msgs)).toEqual({ roomId: 9, action: 'pause', pos: 25, id: 2 })
    expect(collectWTState(8, msgs)).toEqual({ roomId: 8, action: 'play', pos: 99, id: 3 })
    expect(collectWTState(7, msgs)).toBeNull()
  })

  it('tolerates small drift so players never fight', () => {
    expect(needsSeek(10, 11)).toBe(false)
    expect(needsSeek(10, 13)).toBe(true)
    expect(needsSeek(NaN, 10)).toBe(false)
  })
})
