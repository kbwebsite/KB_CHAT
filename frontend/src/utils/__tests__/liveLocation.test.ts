/** Live location helpers: session-id parsing, preview labels, OSM embeds. */
import { describe, expect, it } from 'vitest'
import {
  parseLiveSessionId,
  osmEmbedUrl,
} from '../liveLocation'
import { prettyPreview } from '../messageEffects'

describe('parseLiveSessionId', () => {
  it('extracts the session id from a live message body', () => {
    expect(parseLiveSessionId('📍 Live location\n[live:123]')).toBe(123)
  })

  it('returns null for plain text and static location links', () => {
    expect(parseLiveSessionId('hello')).toBeNull()
    expect(
      parseLiveSessionId('📍 Location\nhttps://www.openstreetmap.org/?mlat=13.08&mlon=80.27#map=16/13.08/80.27'),
    ).toBeNull()
    expect(parseLiveSessionId(null)).toBeNull()
    expect(parseLiveSessionId('[live:0]')).toBeNull()
    expect(parseLiveSessionId('[live:abc]')).toBeNull()
  })
})

describe('prettyPreview live location', () => {
  it('shows a clean label instead of the raw marker', () => {
    expect(prettyPreview('📍 Live location\n[live:7]')).toBe('📍 Live location')
  })
})

describe('osmEmbedUrl', () => {
  it('builds an embed URL with marker around the point', () => {
    const url = osmEmbedUrl(13.0827, 80.2707)
    expect(url).toContain('openstreetmap.org/export/embed.html')
    expect(url).toContain('marker=13.0827%2C80.2707')
  })
})
