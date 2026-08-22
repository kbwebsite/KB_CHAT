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
  login: (identifier:string, password:string)=>Promise<void>
  signup: (data:any)=>Promise<void>
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
        set({initialized:true})
      }
    } catch {
      localStorage.removeItem('kb_token')
      localStorage.removeItem('kb_user')
      set({user:null, token:null, initialized:true})
    }
  },
  login: async (identifier, password)=>{
    set({loading:true})
    try {
      const res = await authApi.login({identifier, password})
      if (!res.success) throw new Error(res.message || 'Login failed')
      const { access_token, user } = res.data
      localStorage.setItem('kb_token', access_token)
      localStorage.setItem('kb_user', JSON.stringify(user))
      set({token: access_token, user})
      wsService.connect(access_token)
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
    } finally { set({loading:false}) }
  },
  logout: async ()=>{
    try { await authApi.logout() } catch {}
    localStorage.removeItem('kb_token')
    localStorage.removeItem('kb_user')
    wsService.disconnect()
    set({user:null, token:null})
  }
}))
