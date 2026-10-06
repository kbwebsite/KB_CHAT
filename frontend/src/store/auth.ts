import { create } from 'zustand'
import { User } from '../types'
import { authApi } from '../services/api'
import {
  clearAccessToken,
  getAccessToken,
  refreshAccessToken,
  setAccessToken,
} from '../services/session'
import wsService from '../services/websocket'

interface AuthState {
  user: User | null
  token: string | null
  loading: boolean
  initialized: boolean
  setUser: (u:User|null)=>void
  setToken: (t:string|null)=>void
  init: ()=>Promise<void>
  login: (identifier:string, password:string)=>Promise<any>
  signup: (data:any)=>Promise<any>
  logout: ()=>Promise<void>
}

export const useAuthStore = create<AuthState>((set, get)=> ({
  // kb_user is a profile cache, not a credential — safe to persist.
  // The access token is memory-only (services/session); never localStorage.
  user: JSON.parse(localStorage.getItem('kb_user') || 'null'),
  token: null,
  loading: false,
  initialized: false,
  setUser: (u)=> {
    if (u) localStorage.setItem('kb_user', JSON.stringify(u))
    else localStorage.removeItem('kb_user')
    set({user: u})
  },
  setToken: (t)=> {
    if (t) {
      setAccessToken(t)
      wsService.setTokenProvider(() => getAccessToken())
      wsService.connect(t)
    } else {
      clearAccessToken()
      wsService.disconnect()
    }
    set({token: t})
  },
  init: async ()=>{
    const applySession = async (token: string): Promise<boolean> => {
      setAccessToken(token)
      set({ token })
      try {
        const res = await authApi.me()
        if (res.success) {
          const u = res.data
          try { localStorage.setItem('kb_user', JSON.stringify(u)) } catch {}
          set({ user: u })
          wsService.connect(token)
          return true
        }
      } catch {}
      return false
    }
    try {
      // Silent refresh first: cookie → memory access token. Null when logged
      // out; silent so public pages never bounce on a missing session.
      const fresh = await refreshAccessToken({ silent: true })
      if (fresh && (await applySession(fresh))) {
        set({ initialized: true })
        return
      }
      // One-time legacy bridge: adopt a pre-migration kb_token into memory
      // (validated first), then drop it from disk forever.
      let legacy: string | null = null
      try { legacy = localStorage.getItem('kb_token') } catch {}
      if (legacy && (await applySession(legacy))) {
        // adopted for this boot only — never written back
      } else {
        clearAccessToken()
        set({ user: null, token: null })
      }
    } catch {
      clearAccessToken()
      set({ user: null, token: null })
    } finally {
      try { localStorage.removeItem('kb_token') } catch {}
      set({ initialized: true })
    }
  },
  // Returns the login payload: either a full session ({access_token, user})
  // or a code step ({login_step: 'verify_code', email}). Callers decide.
  login: async (identifier, password)=>{
    set({loading:true})
    try {
      const res = await authApi.login({identifier, password})
      if (!res.success) throw new Error(res.message || 'Login failed')
      const { access_token, user } = res.data || {}
      if (!access_token) return res.data
      setAccessToken(access_token)
      try { localStorage.setItem('kb_user', JSON.stringify(user)) } catch {}
      set({token: access_token, user})
      wsService.connect(access_token)
      return res.data
    } finally { set({loading:false}) }
  },
  signup: async (data)=>{
    set({loading:true})
    try {
      const res = await authApi.signup(data)
      if (!res.success) throw new Error(res.message || 'Signup failed')
      const { access_token, user } = res.data
      setAccessToken(access_token)
      try { localStorage.setItem('kb_user', JSON.stringify(user)) } catch {}
      set({token: access_token, user})
      wsService.connect(access_token)
      return res.data
    } finally { set({loading:false}) }
  },
  logout: async ()=>{
    try {
      const { unregisterWebPush } = await import('../utils/push')
      await unregisterWebPush()
    } catch {}
    try {
      // Installed app: also clear the native Firebase session so the next
      // Google tap shows the account picker instead of reusing silently.
      const { Capacitor } = await import('@capacitor/core')
      if (Capacitor.isNativePlatform()) {
        const { FirebaseAuthentication } = await import(
          '@capacitor-firebase/authentication'
        )
        await FirebaseAuthentication.signOut()
      }
    } catch {}
    try { await authApi.logout() } catch {}
    clearAccessToken()
    try {
      localStorage.removeItem('kb_token') // legacy residue (never written now)
      localStorage.removeItem('kb_user')
    } catch {}
    // Don't leak the previous account's agent chat into the next login.
    try { localStorage.removeItem('kb_agent_conv_id') } catch {}
    try {
      // Cross-tab logout: other tabs share the cookie but hold their own
      // memory token; this tells them to drop it (no loop: storage events
      // don't fire in the tab that wrote them).
      localStorage.setItem('kb_logged_out_at', String(Date.now()))
    } catch {}
    wsService.disconnect()
    set({user:null, token:null})
  }
}))

// Cross-tab logout receiver (registered once with the store module).
try {
  window.addEventListener('storage', (e) => {
    if (e.key !== 'kb_logged_out_at') return
    try {
      const st = useAuthStore.getState()
      st.setUser(null)
      st.setToken(null)
      const p = window.location.pathname
      if (!p.includes('/login') && p !== '/') window.location.href = '/login'
    } catch {}
  })
} catch {}
