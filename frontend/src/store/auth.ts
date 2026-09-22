import { create } from 'zustand'
import { User } from '../types'
import { authApi } from '../services/api'
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
  user: JSON.parse(localStorage.getItem('kb_user') || 'null'),
  token: localStorage.getItem('kb_token'),
  loading: false,
  initialized: false,
  setUser: (u)=> {
    if (u) localStorage.setItem('kb_user', JSON.stringify(u))
    else localStorage.removeItem('kb_user')
    set({user: u})
  },
  setToken: (t)=> {
    if (t) localStorage.setItem('kb_token', t)
    else localStorage.removeItem('kb_token')
    set({token: t})
    if (t) wsService.connect(t)
    else wsService.disconnect()
  },
  init: async ()=>{
    const token = localStorage.getItem('kb_token')
    if (!token) { set({initialized:true}); return }
    try {
      const res = await authApi.me()
      if (res.success) {
        const u = res.data
        localStorage.setItem('kb_user', JSON.stringify(u))
        set({user:u, token, initialized:true})
        wsService.connect(token)
      } else {
        // Server explicitly rejected the session: drop it so guards stop
        // bouncing and the user lands on login instead of limbo.
        localStorage.removeItem('kb_token')
        localStorage.removeItem('kb_user')
        set({user:null, token:null, initialized:true})
      }
    } catch {
      // Network/server blip (not a rejection): keep the stored session so a
      // flaky connection doesn't log the user out; the 401 interceptor
      // clears truly-dead tokens on the next authenticated call.
      set({initialized:true})
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
      localStorage.setItem('kb_token', access_token)
      localStorage.setItem('kb_user', JSON.stringify(user))
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
      localStorage.setItem('kb_token', access_token)
      localStorage.setItem('kb_user', JSON.stringify(user))
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
    try { await authApi.logout() } catch {}
    localStorage.removeItem('kb_token')
    localStorage.removeItem('kb_user')
    // Don't leak the previous account's agent chat into the next login.
    localStorage.removeItem('kb_agent_conv_id')
    wsService.disconnect()
    set({user:null, token:null})
  }
}))
