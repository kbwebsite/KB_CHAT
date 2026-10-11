/** WhatsApp-style formatting: tokenize + strip, URL-safe. */
import { describe, expect, it } from 'vitest'
import { tokenizeFormatted, stripFormatting } from '../formattedText'

describe('tokenizeFormatted', () => {
  it('parses bold, italic, strike and code', () => {
    expect(tokenizeFormatted('*hi*')).toEqual([{ t: 'bold', s: 'hi' }])
    expect(tokenizeFormatted('_hi_')).toEqual([{ t: 'italic', s: 'hi' }])
    expect(tokenizeFormatted('~hi~')).toEqual([{ t: 'strike', s: 'hi' }])
    expect(tokenizeFormatted('`hi`')).toEqual([{ t: 'code', s: 'hi' }])
  })

  it('mixes plain and formatted segments', () => {
    expect(tokenizeFormatted('a *b* c')).toEqual([
      { t: 'text', s: 'a ' },
      { t: 'bold', s: 'b' },
      { t: 'text', s: ' c' },
    ])
  })

  it('leaves URLs (and their underscores) intact', () => {
    const url = 'https://x.com/foo_bar_baz'
    expect(tokenizeFormatted(`see ${url} ok`)).toEqual([
      { t: 'text', s: 'see ' },
      { t: 'url', s: url },
      { t: 'text', s: ' ok' },
    ])
  })

  it('ignores lone markers and multiline spans', () => {
    expect(tokenizeFormatted('a * b')).toEqual([{ t: 'text', s: 'a * b' }])
    expect(tokenizeFormatted('*a\nb*')).toEqual([{ t: 'text', s: '*a\nb*' }])
    expect(tokenizeFormatted('')).toEqual([])
  })
})

describe('stripFormatting', () => {
  it('removes markers but keeps content', () => {
    expect(stripFormatting('*hi* _there_')).toBe('hi there')
    expect(stripFormatting('`code` ~gone~')).toBe('code gone')
    expect(stripFormatting('plain')).toBe('plain')
  })
})
