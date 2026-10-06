/**
 * Wave 2 Phase 2: auth store keeps tokens out of localStorage.
 *
 * Contract under test (frontend/src/store/auth.ts):
 * - login/signup put the access token in memory only (kb_user profile may persist)
 * - init restores via silent refresh; legacy kb_token is adopted once, then deleted
 * - logout clears memory + profile; failed refresh logs out
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../services/api', () => ({
  authApi: {
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(async () => ({})),
    me: vi.fn(),
    verifyLogin: vi.fn(),
  },
}))

vi.mock('../../services/websocket', () => ({
  default: { connect: vi.fn(), disconnect: vi.fn() },
}))

import { useAuthStore } from '../auth'
import { authApi } from '../../services/api'
import {
  clearAccessToken,
  configureSessionAuth,
  getAccessToken,
} from '../../services/session'

const loginMock = authApi.login as any
const meMock = authApi.me as any
const logoutMock = authApi.logout as any

beforeEach(() => {
  vi.resetAllMocks()
  localStorage.clear()
  clearAccessToken()
  configureSessionAuth({ fetchRefresh: () => Promise.resolve(null), onAuthFailure: () => {} })
  useAuthStore.setState({ user: null, token: null, loading: false, initialized: false })
})

describe('memory-only tokens', () => {
  it('login stores access in memory, never kb_token', async () => {
    loginMock.mockResolvedValue({
      success: true,
      data: { access_token: 'tok-1', user: { id: 1, username: 'a' } },
    })
    await useAuthStore.getState().login('a@x.com', 'pw')
    expect(getAccessToken()).toBe('tok-1')
    expect(useAuthStore.getState().token).toBe('tok-1')
    expect(localStorage.getItem('kb_token')).toBeNull()
    expect(JSON.parse(localStorage.getItem('kb_user') || 'null')?.username).toBe('a')
  })

  it('logout clears memory token and profile', async () => {
    loginMock.mockResolvedValue({
      success: true,
      data: { access_token: 'tok-9', user: { id: 9, username: 'z' } },
    })
    await useAuthStore.getState().login('z@x.com', 'pw')
    await useAuthStore.getState().logout()
    expect(getAccessToken()).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem('kb_user')).toBeNull()
    expect(logoutMock).toHaveBeenCalled()
  })

  it('init restores session via silent refresh', async () => {
    configureSessionAuth({
      fetchRefresh: async () => 'fresh-tok',
      onAuthFailure: () => {},
    })
    meMock.mockResolvedValue({ success: true, data: { id: 3, username: 'r' } })
    await useAuthStore.getState().init()
    const st = useAuthStore.getState()
    expect(st.initialized).toBe(true)
    expect(st.token).toBe('fresh-tok')
    expect(getAccessToken()).toBe('fresh-tok')
    expect(st.user?.username).toBe('r')
    expect(localStorage.getItem('kb_token')).toBeNull()
  })

  it('init with no session ends logged-out but initialized', async () => {
    await useAuthStore.getState().init()
    const st = useAuthStore.getState()
    expect(st.initialized).toBe(true)
    expect(st.token).toBeNull()
    expect(st.user).toBeNull()
  })

  it('legacy kb_token is adopted once, then removed from disk', async () => {
    localStorage.setItem('kb_token', 'legacy-7d')
    meMock.mockResolvedValue({ success: true, data: { id: 5, username: 'old' } })
    await useAuthStore.getState().init()
    const st = useAuthStore.getState()
    expect(st.token).toBe('legacy-7d')
    expect(getAccessToken()).toBe('legacy-7d')
    expect(localStorage.getItem('kb_token')).toBeNull()
  })

  it('dead legacy kb_token is dropped, not kept', async () => {
    localStorage.setItem('kb_token', 'dead-token')
    meMock.mockRejectedValue({ response: { status: 401 } })
    await useAuthStore.getState().init()
    const st = useAuthStore.getState()
    expect(st.token).toBeNull()
    expect(localStorage.getItem('kb_token')).toBeNull()
  })
})
