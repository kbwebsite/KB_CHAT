import { create } from 'zustand'
import wsService from '../services/websocket'
import { groupCallsApi } from '../services/api'
import { useChatStore } from './chat'
import { useAuthStore } from './auth'
import { useToastStore } from './toast'

export type GroupCallSession = {
  id: number
  conversation_id: number
  started_by?: number | null
  starter_username?: string | null
  starter_display_name?: string | null
  call_type: 'voice' | 'video'
  status: string
  active: boolean
  started_at?: string | null
  ended_at?: string | null
}

type GroupCallState = {
  /** Active room per conversation (null = none known). */
  activeByConv: Record<number, GroupCallSession | null>
  /** The room this device has joined (modal open). */
  joined: { session: GroupCallSession; title: string } | null
  fetchActive: (convId: number) => Promise<GroupCallSession | null>
  noteInvite: (s: GroupCallSession) => void
  noteEnd: (s: { id: number; conversation_id: number }) => void
  join: (session: GroupCallSession, title: string) => void
  leave: () => void
}

export const useGroupCallStore = create<GroupCallState>((set, get) => ({
  activeByConv: {},
  joined: null,

  fetchActive: async (convId) => {
    try {
      const r = await groupCallsApi.active(convId)
      const s = (r?.success ? r.data : null) as GroupCallSession | null
      set((st) => ({ activeByConv: { ...st.activeByConv, [convId]: s } }))
      return s
    } catch {
      return get().activeByConv[convId] ?? null
    }
  },

  noteInvite: (s) => {
    if (!s || s.id == null) return
    const cur = get()
    if (cur.joined?.session.id === s.id) return
    set((st) => ({ activeByConv: { ...st.activeByConv, [s.conversation_id]: s } }))
  },

  noteEnd: (s) => {
    if (!s || s.id == null) return
    set((st) => ({
      activeByConv: { ...st.activeByConv, [s.conversation_id]: null },
      joined: st.joined?.session.id === s.id ? null : st.joined,
    }))
  },

  join: (session, title) =>
    set((st) => ({
      joined: { session, title },
      activeByConv: { ...st.activeByConv, [session.conversation_id]: session },
    })),

  leave: () => set({ joined: null }),
}))

// Global room events (registered once, like the chat store listeners).
try {
  wsService.on('group_call.invite', (p: any) => {
    if (!p || p.id == null || p.conversation_id == null) return
    const me = useAuthStore.getState().user?.id ?? null
    if (me != null && p.started_by === me) return // my own start: I join directly
    useGroupCallStore.getState().noteInvite(p as GroupCallSession)
    const c = useChatStore.getState().conversations.find((x: any) => x.id === p.conversation_id) as any
    const title = c?.title || 'a group'
    try {
      useToastStore.getState().push(`📞 Group call in ${title} — open the chat to join`, 'info')
    } catch {}
  })
  wsService.on('group_call.end', (p: any) => {
    if (!p || p.id == null) return
    useGroupCallStore.getState().noteEnd(p)
  })
} catch {}
