import { create } from 'zustand'

type Toast = { id: number, message: string, type: 'success' | 'error' | 'info' }

interface ToastState {
  toasts: Toast[]
  push: (message: string, type?: Toast['type']) => void
  remove: (id: number) => void
}

let nextId = 1

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, type='info') => {
    const id = nextId++
    set(s=> ({ toasts: [...s.toasts, { id, message, type }] }))
    setTimeout(()=> set(s=> ({ toasts: s.toasts.filter(t=> t.id!==id) })), 3000)
  },
  remove: (id) => set(s=> ({ toasts: s.toasts.filter(t=> t.id!==id) })),
}))
