/** Live caption helpers: throttle + length cap. */
import { describe, expect, it } from 'vitest'
import { shouldSendCaption, fitCaption, captionsSupported } from '../captions'

describe('shouldSendCaption', () => {
  it('always sends finals, throttles interims to 2s', () => {
    expect(shouldSendCaption(1000, 1500, true)).toBe(true)
    expect(shouldSendCaption(1000, 1500, false)).toBe(false)
    expect(shouldSendCaption(1000, 3000, false)).toBe(true)
    expect(shouldSendCaption(0, 0, false)).toBe(false)
  })
})

describe('fitCaption', () => {
  it('trims, collapses whitespace and caps at 140', () => {
    expect(fitCaption('  hello   world  ')).toBe('hello world')
    expect(fitCaption('x'.repeat(300))).toHaveLength(140)
    expect(fitCaption('')).toBe('')
  })
})

describe('captionsSupported', () => {
  it('returns a boolean without throwing', () => {
    expect(typeof captionsSupported()).toBe('boolean')
  })
})
