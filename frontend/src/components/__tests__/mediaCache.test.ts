/**
 * Wave 4B P6: bounded media caches (dedupe + eviction contracts).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  linkPreviewApi: { fetch: vi.fn() },
}))

import { clearPreviewCache, fetchPreviewCached } from '../LinkPreview'
import { linkPreviewApi } from '../../services/api'

const fetchMock = linkPreviewApi.fetch as any

beforeEach(() => {
  vi.resetAllMocks()
  clearPreviewCache()
})

describe('link preview cache', () => {
  it('dedupes concurrent fetches for the same URL', async () => {
    fetchMock.mockResolvedValue({ success: true, data: { url: 'u', title: 'T', domain: 'd', description: '', image: null } })
    const [a, b, c] = await Promise.all([
      fetchPreviewCached('https://x.test/1'),
      fetchPreviewCached('https://x.test/1'),
      fetchPreviewCached('https://x.test/1'),
    ])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(a?.title).toBe('T')
    expect(b).toBe(a)
    expect(c).toBe(a)
  })

  it('serves revisits from cache without refetching', async () => {
    fetchMock.mockResolvedValue({ success: true, data: { url: 'u', title: 'T', domain: 'd', description: '', image: null } })
    await fetchPreviewCached('https://x.test/2')
    await fetchPreviewCached('https://x.test/2')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not cache failures (later mounts retry)', async () => {
    fetchMock.mockRejectedValueOnce(new Error('down'))
    await expect(fetchPreviewCached('https://x.test/3')).resolves.toBeNull()
    fetchMock.mockResolvedValue({ success: true, data: { url: 'u', title: 'T', domain: 'd', description: '', image: null } })
    await expect(fetchPreviewCached('https://x.test/3')).resolves.not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('evicts oldest beyond the cap', async () => {
    fetchMock.mockImplementation(async (url: string) => ({
      success: true, data: { url, title: `T ${url}`, domain: 'd', description: '', image: null },
    }))
    for (let i = 0; i < 105; i++) await fetchPreviewCached(`https://x.test/${i}`)
    expect(fetchMock).toHaveBeenCalledTimes(105)
    await fetchPreviewCached('https://x.test/0') // evicted long ago
    expect(fetchMock).toHaveBeenCalledTimes(106)
    await fetchPreviewCached('https://x.test/104') // still cached
    expect(fetchMock).toHaveBeenCalledTimes(106)
  })
})

describe('voice peaks cache', () => {
  async function setup() {
    vi.resetAllMocks()
    const { clearPeaksCache, peaksForUrl } = await import('../MessageBubble')
    clearPeaksCache()
    let fetches = 0
    let decodes = 0
    const samples = new Float32Array(360)
    for (let i = 0; i < 360; i++) samples[i] = (i % 10) / 10
    vi.stubGlobal('fetch', async () => {
      fetches++
      return { blob: async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }) }
    })
    class AC {
      async decodeAudioData() {
        decodes++
        return { getChannelData: () => samples }
      }
      close() {
        return Promise.resolve()
      }
    }
    vi.stubGlobal('AudioContext', AC as any)
    return {
      peaksForUrl,
      counts: () => ({ fetches, decodes }),
    }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('decodes once across concurrent mounts, serves revisits cached', async () => {
    const { peaksForUrl, counts } = await setup()
    const [a, b] = await Promise.all([peaksForUrl('blob:voice1'), peaksForUrl('blob:voice1')])
    expect(counts()).toEqual({ fetches: 1, decodes: 1 })
    expect(a).toHaveLength(36)
    expect(b).toBe(a)
    await peaksForUrl('blob:voice1')
    expect(counts()).toEqual({ fetches: 1, decodes: 1 })
  })

  it('evicts oldest beyond the cap', async () => {
    const { peaksForUrl, counts } = await setup()
    for (let i = 0; i < 55; i++) await peaksForUrl(`blob:v${i}`)
    expect(counts().fetches).toBe(55)
    await peaksForUrl('blob:v0') // evicted
    expect(counts().fetches).toBe(56)
    await peaksForUrl('blob:v54') // retained
    expect(counts().fetches).toBe(56)
  })
})
