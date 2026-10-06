/**
 * Wave 2 Phase 2: token memory + single-flight refresh contract.
 *
 * Unit under test (frontend/src/services/session.ts) is a leaf module:
 * no axios, no store, behavior injected via configureSessionAuth.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearAccessToken,
  configureSessionAuth,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../session'

function deferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  clearAccessToken()
  configureSessionAuth({ fetchRefresh: () => Promise.resolve(null), onAuthFailure: () => {} })
})

describe('token memory', () => {
  it('holds the access token in memory only', () => {
    setAccessToken('abc')
    expect(getAccessToken()).toBe('abc')
    expect(localStorage.getItem('kb_token')).toBeNull()
    clearAccessToken()
    expect(getAccessToken()).toBeNull()
  })
})

describe('single-flight refresh', () => {
  it('shares one fetch across concurrent callers', async () => {
    const d = deferred<string | null>()
    const fetch = vi.fn(() => d.promise)
    const onFail = vi.fn()
    configureSessionAuth({ fetchRefresh: fetch, onAuthFailure: onFail })
    const p1 = refreshAccessToken()
    const p2 = refreshAccessToken()
    const p3 = refreshAccessToken()
    expect(fetch).toHaveBeenCalledTimes(1)
    d.resolve('tok123')
    await expect(p1).resolves.toBe('tok123')
    await expect(p2).resolves.toBe('tok123')
    await expect(p3).resolves.toBe('tok123')
    expect(getAccessToken()).toBe('tok123')
    expect(onFail).not.toHaveBeenCalled()
  })

  it('fires auth failure once on refresh failure, then allows retry', async () => {
    const onFail = vi.fn()
    const fetch = vi.fn(async () => null)
    configureSessionAuth({ fetchRefresh: fetch, onAuthFailure: onFail })
    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(onFail).toHaveBeenCalledTimes(1)
    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(onFail).toHaveBeenCalledTimes(2)
  })

  it('silent failure never fires auth failure', async () => {
    const onFail = vi.fn()
    configureSessionAuth({ fetchRefresh: async () => null, onAuthFailure: onFail })
    await expect(refreshAccessToken({ silent: true })).resolves.toBeNull()
    expect(onFail).not.toHaveBeenCalled()
  })

  it('drops a stale completion after clear (logout during refresh)', async () => {
    const d = deferred<string | null>()
    const onFail = vi.fn()
    configureSessionAuth({ fetchRefresh: () => d.promise, onAuthFailure: onFail })
    const p = refreshAccessToken()
    clearAccessToken() // logout wins the race
    d.resolve('stale-token')
    await expect(p).resolves.toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(onFail).not.toHaveBeenCalled()
  })

  it('rejection resolves null and fires auth failure once', async () => {
    const onFail = vi.fn()
    configureSessionAuth({
      fetchRefresh: () => Promise.reject(new Error('down')),
      onAuthFailure: onFail,
    })
    await expect(refreshAccessToken()).resolves.toBeNull()
    expect(onFail).toHaveBeenCalledTimes(1)
  })
})
