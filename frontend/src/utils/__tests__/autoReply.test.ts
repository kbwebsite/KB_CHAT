// Away auto-reply store: config, cooldown guard, persistence.
import { beforeEach, describe, expect, it } from 'vitest'
import {
  getAutoReply,
  setAutoReply,
  shouldAutoReply,
  markAutoReplied,
  DEFAULT_REPLY_TEXT,
  AUTO_REPLY_COOLDOWN_MS,
} from '../autoReply'

const CID = 9

beforeEach(() => {
  localStorage.clear()
})

describe('autoReply store', () => {
  it('defaults to off with the default text', () => {
    expect(getAutoReply(CID)).toEqual({ on: false, text: DEFAULT_REPLY_TEXT, lastSent: 0 })
    expect(getAutoReply(null)).toEqual({ on: false, text: DEFAULT_REPLY_TEXT, lastSent: 0 })
    expect(shouldAutoReply(CID)).toBe(false)
  })

  it('persists toggle and text across reads', () => {
    setAutoReply(CID, { on: true, text: 'Busy, back soon' })
    expect(getAutoReply(CID)).toEqual({ on: true, text: 'Busy, back soon', lastSent: 0 })
    setAutoReply(CID, { on: false })
    expect(getAutoReply(CID).on).toBe(false)
    expect(getAutoReply(CID).text).toBe('Busy, back soon')
  })

  it('caps text length and falls back on blank', () => {
    setAutoReply(CID, { text: 'x'.repeat(900) })
    expect(getAutoReply(CID).text.length).toBeLessThanOrEqual(500)
    setAutoReply(CID, { text: '   ' })
    expect(getAutoReply(CID).text).toBe(DEFAULT_REPLY_TEXT)
  })

  it('enforces the hourly cooldown', () => {
    const now = 1_700_000_000_000
    setAutoReply(CID, { on: true, text: 'Away' })
    expect(shouldAutoReply(CID, now)).toBe(true)
    markAutoReplied(CID, now)
    expect(shouldAutoReply(CID, now + 1000)).toBe(false)
    expect(shouldAutoReply(CID, now + AUTO_REPLY_COOLDOWN_MS - 1)).toBe(false)
    expect(shouldAutoReply(CID, now + AUTO_REPLY_COOLDOWN_MS)).toBe(true)
    setAutoReply(CID, { on: false })
    expect(shouldAutoReply(CID, now + AUTO_REPLY_COOLDOWN_MS + 1)).toBe(false)
  })

  it('survives corrupt storage', () => {
    localStorage.setItem('kb_autoreply', '{broken')
    expect(getAutoReply(CID).on).toBe(false)
    expect(shouldAutoReply(CID)).toBe(false)
    // Writes still work after corruption.
    setAutoReply(CID, { on: true })
    expect(getAutoReply(CID).on).toBe(true)
  })

  it('keeps conversations independent', () => {
    const now = 1_700_000_000_000
    setAutoReply(9, { on: true, text: 'Nine' })
    setAutoReply(10, { on: true, text: 'Ten' })
    markAutoReplied(9, now)
    expect(shouldAutoReply(9, now + 1000)).toBe(false)
    expect(shouldAutoReply(10, now + 1000)).toBe(true)
    expect(getAutoReply(9).text).toBe('Nine')
  })
})
