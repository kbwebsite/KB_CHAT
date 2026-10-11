/** Per-chat nicknames: local-only labels with reactive updates. */
import { describe, expect, it, beforeEach } from 'vitest'
import { useNicknameStore, displayTitle } from '../nicknames'

beforeEach(() => {
  localStorage.clear()
  useNicknameStore.setState({ version: 0 })
})

describe('nickname store', () => {
  it('returns null when unset, saves trimmed and clears on empty', () => {
    const s = useNicknameStore.getState()
    expect(s.get(7)).toBeNull()
    s.set(7, '  Bestie  ')
    expect(s.get(7)).toBe('Bestie')
    s.set(7, '   ')
    expect(s.get(7)).toBeNull()
    expect(s.get(null as any)).toBeNull()
  })

  it('truncates to 60 chars and bumps version for subscribers', () => {
    const before = useNicknameStore.getState().version
    useNicknameStore.getState().set(9, 'x'.repeat(100))
    expect(useNicknameStore.getState().get(9)).toHaveLength(60)
    expect(useNicknameStore.getState().version).toBeGreaterThan(before)
  })

  it('display title prefers nickname, then real title, then Unknown', () => {
    expect(displayTitle('Squad', 'Study Group')).toBe('Squad')
    expect(displayTitle(null, 'Study Group')).toBe('Study Group')
    expect(displayTitle(null, null)).toBe('Unknown')
    expect(displayTitle('', undefined)).toBe('Unknown')
  })
})
