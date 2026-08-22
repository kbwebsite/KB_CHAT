import { create } from 'zustand'

type Theme = 'light' | 'dark' | 'system'

interface UIState {
  theme: Theme
  sidebarOpen: boolean
  showEmoji: boolean
  setTheme: (t:Theme)=>void
  toggleSidebar: ()=>void
}

function getSystemTheme(): 'light'|'dark' {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function applyTheme(t:Theme) {
  const resolved = t==='system' ? getSystemTheme() : t
  document.documentElement.classList.toggle('dark', resolved==='dark')
}

export const useUIStore = create<UIState>((set, get)=> ({
  theme: (localStorage.getItem('kb_theme') as Theme) || 'system',
  sidebarOpen: true,
  showEmoji: false,
  setTheme: (t)=>{
    localStorage.setItem('kb_theme', t)
    applyTheme(t)
    set({theme:t})
  },
  toggleSidebar: ()=> set({sidebarOpen: !get().sidebarOpen})
}))

// init
if (typeof window !== 'undefined') {
  const t = (localStorage.getItem('kb_theme') as Theme) || 'system'
  applyTheme(t)
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ()=>{
    if ((localStorage.getItem('kb_theme') as Theme)==='system') applyTheme('system')
  })
}
