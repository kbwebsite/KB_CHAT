import { create } from 'zustand'
import { Conversation, Message } from '../types'
import { convApi, msgApi } from '../services/api'
import wsService from '../services/websocket'

interface ChatState {
  conversations: Conversation[]
  currentConversationId: number | null
  messages: Record<number, Message[]>
  hasMore: Record<number, boolean>
  loadingConvs: boolean
  loadingMessages: Record<number, boolean>
  typingUsers: Record<number, Set<number>> // convId -> set of userIds
  onlineUsers: Set<number>
  searchQuery: string
  // actions
  fetchConversations: (search?:string)=>Promise<void>
  setCurrent: (id:number|null)=>void
  fetchMessages: (convId:number, before?:number)=>Promise<void>
  sendMessage: (convId:number, content:string, replyTo?:number, attachmentIds?:number[], type?:string)=>Promise<void>
  addMessage: (msg:Message)=>void
  updateMessage: (msg:Message)=>void
  deleteMessagePlaceholder: (payload:any)=>void
  editMessage: (id:number, content:string)=>Promise<void>
  deleteMessage: (id:number)=>Promise<void>
  react: (mid:number, emoji:string)=>Promise<void>
  setTyping: (convId:number, userId:number, isTyping:boolean)=>void
  setOnline: (userId:number, isOnline:boolean)=>void
  searchMessages: (q:string, convId?:number)=>Promise<Message[]>
  markRead: (convId:number, lastId:number)=>void
}

export const useChatStore = create<ChatState>((set, get)=> ({
  conversations: [],
  currentConversationId: null,
  messages: {},
  hasMore: {},
  loadingConvs: false,
  loadingMessages: {},
  typingUsers: {},
  onlineUsers: new Set(),
  searchQuery: '',
  fetchConversations: async (search)=>{
    set({loadingConvs:true})
    try {
      const res = await convApi.list(search)
      if (res.success) set({conversations: res.data})
    } finally { set({loadingConvs:false}) }
  },
  setCurrent: (id)=>{
    set({currentConversationId: id})
    if (id) {
      const msgs = get().messages[id] || []
      const last = msgs[msgs.length-1]
      if (last) {
        get().markRead(id, last.id)
      }
    }
  },
  fetchMessages: async (convId, before)=>{
    set(state=>({ loadingMessages: { ...state.loadingMessages, [convId]: true } }))
    try {
      const res = await msgApi.list(convId, { before, limit: 50 })
      if (res.success) {
        const { messages, has_more } = res.data
        set(state=>{
          const existing = before ? (state.messages[convId]||[]) : []
          const merged = before ? [...messages, ...existing] : messages
          // dedupe by id
          const map = new Map<number, Message>(merged.map((m:Message)=>[m.id,m] as [number, Message]))
          const unique = Array.from(map.values()).sort((a:Message,b:Message)=>a.id-b.id)
          return { messages: {...state.messages, [convId]: unique }, hasMore: {...state.hasMore, [convId]: has_more } }
        })
      }
    } finally { set(state=>({ loadingMessages: { ...state.loadingMessages, [convId]: false } })) }
  },
  sendMessage: async (convId, content, replyTo, attachmentIds, type='text')=>{
    const res = await msgApi.send(convId, { content, reply_to_id: replyTo, attachment_ids: attachmentIds, message_type: type })
    if (res.success) {
      get().addMessage(res.data)
    }
  },
  addMessage: (msg)=>{
    set(state=>{
      const list = state.messages[msg.conversation_id] || []
      // dedup
      if (list.some(m=>m.id===msg.id)) return state
      return { messages: {...state.messages, [msg.conversation_id]: [...list, msg]} }
    })
    // update conversation last_message preview
    set(state=>{
      const convs = state.conversations.map(c=>{
        if (c.id===msg.conversation_id) {
          return { ...c, last_message: { id: msg.id, content: msg.content||'', sender_id: msg.sender_id, sender_username: msg.sender_username, created_at: msg.created_at, message_type: msg.message_type } as any,
            // if not current, increment unread
            unread_count: state.currentConversationId===msg.conversation_id ? 0 : (c.unread_count||0)+1
          }
        }
        return c
      })
      // sort by last_message time
      convs.sort((a,b)=>{
        const at = a.last_message?.created_at || a.updated_at || ''
        const bt = b.last_message?.created_at || b.updated_at || ''
        return bt.localeCompare(at)
      })
      return { conversations: convs }
    })
    // if message is in current conv, auto mark read
    const cur = get().currentConversationId
    if (cur===msg.conversation_id) {
      get().markRead(cur, msg.id)
    }
  },
  updateMessage: (msg)=>{
    set(state=>{
      const list = state.messages[msg.conversation_id] || []
      return { messages: {...state.messages, [msg.conversation_id]: list.map(m=> m.id===msg.id? msg : m)} }
    })
  },
  deleteMessagePlaceholder: (payload)=>{
    set(state=>{
      const cid = payload.conversation_id
      const list = state.messages[cid]||[]
      return { messages: {...state.messages, [cid]: list.map(m=> m.id===payload.id? {...m, content:'Message deleted', is_deleted:true} : m)} }
    })
  },
  editMessage: async (id, content)=>{
    const res = await msgApi.edit(id, content)
    if (res.success) get().updateMessage(res.data)
  },
  deleteMessage: async (id)=>{
    const res = await msgApi.delete(id)
    if (res.success) {
      // will be handled via ws, but also optimistic
      // find conv
      const allMsgs = Object.values(get().messages).flat()
      const msg = allMsgs.find(m=>m.id===id)
      if (msg) get().deleteMessagePlaceholder({id, conversation_id: msg.conversation_id})
    }
  },
  react: async (mid, emoji)=>{
    // optimistic toggle? Just call API, ws will broadcast
    try { await msgApi.react(mid, emoji) } catch {}
  },
  setTyping: (convId, userId, isTyping)=>{
    set(state=>{
      const setForConv = new Set(state.typingUsers[convId] || [])
      if (isTyping) setForConv.add(userId)
      else setForConv.delete(userId)
      return { typingUsers: {...state.typingUsers, [convId]: setForConv } }
    })
  },
  setOnline: (userId, isOnline)=>{
    set(state=>{
      const s = new Set(state.onlineUsers)
      if (isOnline) s.add(userId)
      else s.delete(userId)
      // also update conversations members
      const convs = state.conversations.map(c=>{
        let changed=false
        const members=c.members.map(m=>{
          if (m.user_id===userId && m.is_online!==isOnline) {changed=true; return {...m, is_online:isOnline}}
          return m
        })
        return changed? {...c, members} : c
      })
      return { onlineUsers: s, conversations: convs }
    })
  },
  searchMessages: async (q, convId)=>{
    const res = await msgApi.search(q, convId)
    if (res.success) return res.data
    return []
  },
  markRead: (convId, lastId)=>{
    set(state=>{
      const convs = state.conversations.map(c=> c.id===convId? {...c, unread_count:0}: c)
      return { conversations: convs }
    })
    wsService.markRead(convId, lastId)
  }
}))

// setup ws listeners - call once
let initialized = false
export function initChatWS() {
  if (initialized) return
  initialized=true
  wsService.on('message.new', (payload)=>{
    // payload is Message
    useChatStore.getState().addMessage(payload as Message)
    // notify if not focused
    if (document.hidden || useChatStore.getState().currentConversationId !== (payload as Message).conversation_id) {
      if ('Notification' in window && Notification.permission==='granted') {
        new Notification('Kryzen', { body: `New message from ${(payload as any).sender_display_name || 'someone'}` })
      }
    }
  })
  wsService.on('message.updated', (p)=> useChatStore.getState().updateMessage(p as Message))
  wsService.on('message.deleted', (p)=> useChatStore.getState().deleteMessagePlaceholder(p))
  wsService.on('reaction.added', (p)=>{
    // need to update message reactions - fetch messages again or optimistically add
    const state = useChatStore.getState()
    const mid = p.message_id
    // find message
    for (const [cid, msgs] of Object.entries(state.messages)) {
      const idx = msgs.findIndex(m=>m.id===mid)
      if (idx>=0) {
        const msg = msgs[idx]
        if (!msg.reactions.some(r=> r.user_id===p.user_id && r.emoji===p.emoji)) {
          const updated = {...msg, reactions: [...msg.reactions, {id:p.id, user_id:p.user_id, emoji:p.emoji}]}
          useChatStore.getState().updateMessage(updated as any)
        }
      }
    }
  })
  wsService.on('reaction.removed', (p)=>{
    const state= useChatStore.getState()
    for (const msgs of Object.values(state.messages)) {
      const target=msgs.find(m=>m.id===p.message_id)
      if (target) {
        const updated={...target, reactions: target.reactions.filter(r=> !(r.user_id===p.user_id && r.emoji===p.emoji))}
        useChatStore.getState().updateMessage(updated as any)
      }
    }
  })
  wsService.on('typing.start', (p)=> useChatStore.getState().setTyping(p.conversation_id, p.user_id, true))
  wsService.on('typing.stop', (p)=> useChatStore.getState().setTyping(p.conversation_id, p.user_id, false))
  wsService.on('presence.online', (p)=> useChatStore.getState().setOnline(p.user_id, true))
  wsService.on('presence.offline', (p)=> useChatStore.getState().setOnline(p.user_id, false))
  wsService.on('message.read', (p)=>{
    // can update read status UI if needed
  })
}
