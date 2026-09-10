import { create } from 'zustand'
import { Conversation, Message } from '../types'
import { convApi, msgApi } from '../services/api'
import { useAuthStore } from './auth'
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
  sendMessage: (convId:number, content:string, replyTo?:number, attachmentIds?:number[], type?:string, extra?:{voice_duration?:number, is_encrypted?:boolean, nonce?:string, displayContent?:string})=>Promise<void>
  addMessage: (msg:Message)=>void
  replaceMessage: (tempId:number, real:Message)=>void
  removeMessage: (convId:number, msgId:number)=>void
  updateMessage: (msg:Message)=>void
  deleteMessagePlaceholder: (payload:any)=>void
  editMessage: (id:number, content:string)=>Promise<void>
  deleteMessage: (id:number)=>Promise<void>
  react: (mid:number, emoji:string)=>Promise<void>
  setTyping: (convId:number, userId:number, isTyping:boolean)=>void
  setOnline: (userId:number, isOnline:boolean)=>void
  searchMessages: (q:string, convId?:number)=>Promise<Message[]>
  markRead: (convId:number, lastId:number)=>void
  setMessageStatus: (convId:number, msgId:number, status:string)=>void
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
  sendMessage: async (convId, content, replyTo, attachmentIds, type='text', extra)=>{
    // Optimistic UI: show the message instantly (server round-trips can take
    // seconds on cold production instances), then reconcile with the real row.
    const me = useAuthStore.getState().user
    const tempId = -Date.now()
    const temp: Message = {
      id: tempId, conversation_id: convId,
      sender_id: me?.id ?? null, sender_username: me?.username ?? null,
      sender_display_name: me?.display_name ?? null, sender_avatar: me?.avatar_url ?? null,
      content: extra?.displayContent ?? content, message_type: type, reply_to_id: replyTo ?? null,
      is_deleted: false, is_edited: false,
      created_at: new Date().toISOString(),
      attachments: [], reactions: [], status: 'sending' as any,
    }
    get().addMessage(temp)
    try {
      const res = await msgApi.send(convId, { content, reply_to_id: replyTo, attachment_ids: attachmentIds, message_type: type, ...(extra?.voice_duration != null ? { voice_duration: extra.voice_duration } : {}), ...(extra?.is_encrypted ? { is_encrypted: true, nonce: extra.nonce } : {}) })
      if (res.success) {
        get().replaceMessage(tempId, res.data)
      } else {
        get().removeMessage(convId, tempId)
        throw new Error(res.message || 'Send failed')
      }
    } catch (e) {
      get().removeMessage(convId, tempId)
      throw e
    }
  },
  replaceMessage: (tempId, real)=>{
    set(state=>{
      const list = state.messages[real.conversation_id] || []
      // Drop the optimistic placeholder; add real unless WS already delivered it.
      const withoutTemp = list.filter(m=> m.id !== tempId)
      if (withoutTemp.some(m=> m.id === real.id)) {
        return { messages: { ...state.messages, [real.conversation_id]: withoutTemp } }
      }
      return { messages: { ...state.messages, [real.conversation_id]: [...withoutTemp, real] } }
    })
    // refresh the conversation preview with the authoritative message
    set(state=>{
      const convs = state.conversations.map(c=>{
        if (c.id===real.conversation_id) {
          return { ...c, last_message: { id: real.id, content: real.content||'', sender_id: real.sender_id, sender_username: real.sender_username, created_at: real.created_at, message_type: real.message_type } as any }
        }
        return c
      })
      return { conversations: convs }
    })
  },
  removeMessage: (convId, msgId)=>{
    set(state=>{
      const list = state.messages[convId] || []
      return { messages: { ...state.messages, [convId]: list.filter(m=> m.id !== msgId) } }
    })
  },
  addMessage: (msg)=>{
    // Ignore our own optimistic echoes arriving back over the socket before
    // the HTTP response reconciles them (matched by content+type proximity
    // is unreliable, so the replace step handles the temp row instead).
    if (msg.id < 0) return
    set(state=>{
      const list = state.messages[msg.conversation_id] || []
      // dedup
      if (list.some(m=>m.id===msg.id)) return state
      return { messages: {...state.messages, [msg.conversation_id]: [...list, msg]} }
    })
    // Message from a conversation we don't list yet (e.g. a new contact
    // messaged us first) — pull the conversation list so it appears.
    if (!get().conversations.some(c=> c.id === msg.conversation_id)) {
      get().fetchConversations().catch(()=>{})
    }
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
    // if message is in current conv, auto mark read (never for optimistic
    // placeholders — negative temp ids would corrupt the read cursor)
    const cur = get().currentConversationId
    if (cur===msg.conversation_id && msg.id > 0) {
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
    // Optimistic content swap with rollback — the server round-trip (and its
    // fan-out) no longer gates the UI.
    let prev: Message | undefined
    for (const msgs of Object.values(get().messages)) {
      const found = (msgs as Message[]).find(m=> m.id === id)
      if (found) { prev = found; break }
    }
    if (prev) get().updateMessage({ ...prev, content, is_edited: true })
    try {
      const res = await msgApi.edit(id, content)
      if (res.success) get().updateMessage(res.data)
      else if (prev) get().updateMessage(prev)
    } catch {
      if (prev) get().updateMessage(prev)
    }
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
    // Optimistic add with rollback; the authoritative WS event dedups.
    const me = useAuthStore.getState().user?.id
    const apply = (add: boolean) => set(state=>{
      const messages: Record<number, Message[]> = { ...state.messages }
      let changed = false
      for (const cid of Object.keys(messages)) {
        const list = messages[Number(cid)]
        const idx = list.findIndex(m=> m.id === mid)
        if (idx < 0) continue
        const msg = list[idx]
        if (add) {
          if (msg.reactions.some(r=> r.user_id === me && r.emoji === emoji)) continue
          const next = [...list]
          next[idx] = { ...msg, reactions: [...msg.reactions, { id: -Date.now(), user_id: me as number, emoji }] }
          messages[Number(cid)] = next
          changed = true
        } else {
          const next = [...list]
          next[idx] = { ...msg, reactions: msg.reactions.filter(r=> !(r.user_id === me && r.emoji === emoji)) }
          messages[Number(cid)] = next
          changed = true
        }
      }
      if (!changed) return state
      return { messages }
    })
    apply(true)
    try { await msgApi.react(mid, emoji) } catch { apply(false) }
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
  },
  setMessageStatus: (convId, msgId, status)=>{
    const order: Record<string, number> = { sent: 0, delivered: 1, read: 2 }
    if (!(status in order)) return
    set(state=>{
      const list = state.messages[convId] || []
      let changed = false
      const next = list.map(m=>{
        if (m.id !== msgId) return m
        const cur = order[m.status || 'sent'] ?? 0
        if (order[status] > cur) { changed = true; return { ...m, status } }
        return m
      })
      if (!changed) return state
      return { messages: { ...state.messages, [convId]: next } }
    })
  },
}))

// setup ws listeners - call once
let initialized = false
export function initChatWS() {
  if (initialized) return
  initialized=true
  wsService.on('message.new', (payload)=>{
    // payload is Message
    const msg = payload as Message
    useChatStore.getState().addMessage(msg)
    // Device-arrival ack: message reached us -> sender upgrades to double tick.
    // Fire-and-forget; the server also backfills on history fetch.
    try {
      const me = useAuthStore.getState().user?.id
      if (me != null && msg.sender_id !== me) {
        msgApi.delivered(msg.id).catch(()=>{})
      }
    } catch {}
    // notify if not focused
    if (document.hidden || useChatStore.getState().currentConversationId !== msg.conversation_id) {
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
    // Legacy event kept for compatibility; authoritative upgrades arrive
    // via message.status. Upgrade optimistically for 1-1 chats only when
    // the payload targets our own message.
    try {
      const me = useAuthStore.getState().user?.id
      const st = useChatStore.getState()
      const list = st.messages[p.conversation_id] || []
      const target = list.find(m=> m.id === p.message_id)
      if (target && target.sender_id === me && p.user_id !== me) {
        // Only trust it outright in 1-1 chats; group quorums come via status.
        const conv = st.conversations.find(c=> c.id === p.conversation_id)
        if (conv && !conv.is_group) st.setMessageStatus(p.conversation_id, p.message_id, 'read')
      }
    } catch {}
  })
  wsService.on('message.status', (p)=>{
    // Authoritative tick upgrade from the server (quorum-aware for groups).
    if (p && p.message_id && p.conversation_id && p.status) {
      useChatStore.getState().setMessageStatus(p.conversation_id, p.message_id, p.status)
    }
  })
}
