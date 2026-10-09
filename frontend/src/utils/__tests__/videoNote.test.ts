/** Video notes: preview labels. */
import { describe, expect, it } from 'vitest'
import { prettyPreview } from '../messageEffects'

describe('video note previews', () => {
  it('labels round video messages', () => {
    expect(prettyPreview('Video 0:23')).toBe('🎥 Video message')
    expect(prettyPreview('Video 1:00')).toBe('🎥 Video message')
  })

  it('leaves other texts alone', () => {
    expect(prettyPreview('Voice 0:23')).toBe('Voice 0:23')
    expect(prettyPreview('Video call tomorrow?')).toBe('Video call tomorrow?')
    expect(prettyPreview('hello')).toBe('hello')
  })
})
