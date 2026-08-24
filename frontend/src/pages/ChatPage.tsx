import { useEffect, useState, useRef, useCallback } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore, initChatWS } from '../store/chat'
import { useSettingsStore } from '../store/settings'
import { ConversationList } from '../components/ConversationList'
import { ChatHeader } from '../components/ChatHeader'
import { MessageBubble } from '../components/MessageBubble'
import { MessageComposer } from '../components/MessageComposer'
import { UserSearch } from '../components/UserSearch'
import { ProfilePanel } from '../components/ProfilePanel'
import { GroupPanel } from '../components/GroupPanel'
import { SettingsPanel } from '../components/SettingsPanel'
import { NotificationPanel } from '../components/NotificationPanel'
import { SavedMessagesPanel } from '../components/SavedMessagesPanel'
import { ContactsPanel } from '../components/ContactsPanel'
import { CallsPanel } from '../components/CallsPanel'
import { Lightbox } from '../components/Lightbox'
import { CallModal } from '../components/CallModal'
import { ServerStatus } from '../components/ServerStatus'
import { StatusPanel } from '../components/StatusPanel'
import { StatusViewer } from '../components/StatusViewer'
import { CommandPalette, buildCommands } from '../components/CommandPalette'
import { PollPanel } from '../components/PollPanel'
import { LinkPreview, hasUrl, extractUrls } from '../components/LinkPreview'
import { DragDropZone } from '../components/DragDropZone'
import EventPanel from '../components/EventPanel'
import ScheduleMessage from '../components/ScheduleMessage'
import ChatInsights from '../components/ChatInsights'
import { msgPinApi, pollApi, aiApi } from '../services/api'
import { convApi, extendedApi, savedApi, callsApi } from '../services/api'
import { useToastStore } from '../store/toast'
import { Message } from '../types'
import { Search, LogOut, Settings as SettingsIcon, Bookmark, Contact, Phone, MessageSquare, Users, Plus, Bell, Trash2, Download, X, Bot } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import wsService from '../services/websocket'

type SidebarTab = 'chats' | 'groups' | 'status' | 'calls' | 'contacts' | 'saved'
type RightTab = 'chat' | 'files' | 'media' | 'links' | 'voice' | 'polls' | 'pinned' | 'events' | 'schedule' | 'insights'

export default function ChatPage() {
  const { user, logout } = useAuthStore()
  const toast = useToastStore(s=> s.push)
  const {
    conversations, currentConversationId, messages, hasMore, loadingMessages, loadingConvs,
    fetchConversations, setCurrent, fetchMessages, sendMessage, editMessage, deleteMessage, react
  } = useChatStore() as any
  const settings = useSettingsStore()
  const [search, setSearch]=useState('')
  const [sidebarTab, setSidebarTab]=useState<SidebarTab>('chats')
  const [showUserSearch, setShowUserSearch]=useState(false)
  const [showProfile, setShowProfile]=useState(false)
  const [showGroupInfo, setShowGroupInfo]=useState(false)
  const [showSettings, setShowSettings]=useState(false)
  const [showNotifications, setShowNotifications]=useState(false)
  const [showSaved, setShowSaved]=useState(false)
  const [showContacts, setShowContacts]=useState(false)
  const [showCalls, setShowCalls]=useState(false)
  const [showStatus, setShowStatus]=useState(false)
  const [statusViewer, setStatusViewer]=useState<{statuses:any[], idx:number}|null>(null)
  const [showNewGroup, setShowNewGroup]=useState(false)
  const [groupTitle, setGroupTitle]=useState('')
  const [groupMembers, setGroupMembers]=useState<any[]>([])
  const [replyTo, setReplyTo]=useState<{id:number, content:string, sender:string}|null>(null)
  const [editTarget, setEditTarget]=useState<Message|null>(null)
  const [editText, setEditText]=useState('')
  const [messageSearch, setMessageSearch]=useState('')
  const [showMessageSearch, setShowMessageSearch]=useState(false)
  const [activeRightTab, setActiveRightTab]=useState<RightTab>('chat')
  const [selectedIds, setSelectedIds]=useState<Set<number>>(new Set())
  const [savedIds, setSavedIds]=useState<Set<number>>(new Set())
  const [lightbox, setLightbox]=useState<{images:{url:string,name:string}[], idx:number}|null>(null)
  const [forwardMsg, setForwardMsg]=useState<Message|null>(null)
  const [callModal, setCallModal]=useState<{open:boolean, type:'voice'|'video', peerName:string, peerAvatar?:string|null, incoming?:boolean, callId?:number, peerId?:number}|null>(null)
  const [isMuted, setIsMuted]=useState(false)
  const [showCommandPalette, setShowCommandPalette]=useState(false)
  const [drafts, setDrafts]=useState<Record<number, string>>({})
  const [showPolls, setShowPolls]=useState(false)
  const [showPinned, setShowPinned]=useState(false)
  const [showEvents, setShowEvents]=useState(false)
  const [showSchedule, setShowSchedule]=useState(false)
  const [showInsights, setShowInsights]=useState(false)
  const [aiResult, setAiResult]=useState<{text:string; action:string}|null>(null)
  const [pinnedMessages, setPinnedMessages]=useState<any[]>([])
  const [wallpaper] = useState(settings.chat_wallpaper)
  const [isAtBottom, setIsAtBottom]=useState(true)
  const [showNewIndicator, setShowNewIndicator]=useState(false)
  const isLoadingMoreRef = useRef(false)
  const searchRef=useRef<HTMLInputElement>(null)
  const listRef=useRef<HTMLDivElement>(null)
  const nav=useNavigate()

  useEffect(()=>{
    initChatWS()
    settings.init()
    const token=localStorage.getItem('kb_token')
    if (token) wsService.connect(token)
    fetchConversations()
    // load saved ids
    savedApi.list().then(r=>{ if(r.success) setSavedIds(new Set(r.data.map((x:any)=> x.message_id)))})
    // call incoming listener
    const off1 = wsService.on('call.incoming', (p)=>{
      setCallModal({open:true, type: p.call_type || 'voice', peerName: p.caller_display || p.caller_username || 'Unknown', peerAvatar: null, incoming:true, callId: p.id, peerId: p.caller_id})
    })
    const off2 = wsService.on('call.ended', ()=> setCallModal(null))
    const off3 = wsService.on('call.accepted', ()=> setCallModal(m=> m ? {...m, incoming:false} : null))
    return ()=>{ off1(); off2(); off3() }
  }, [])

  // keyboard shortcuts
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='k') { e.preventDefault(); setShowCommandPalette(true); }
      if (e.key==='Escape') { setShowProfile(false); setShowSettings(false); setShowNotifications(false); setShowSaved(false); setShowContacts(false); setShowCalls(false); setShowStatus(false); setStatusViewer(null); setForwardMsg(null); setLightbox(null); setEditTarget(null); setReplyTo(null); setShowCommandPalette(false); setShowPolls(false); setShowPinned(false); setShowEvents(false); setShowSchedule(false); setShowInsights(false); }
    }
    window.addEventListener('keydown', onKey)
    return ()=> window.removeEventListener('keydown', onKey)
  }, [])

  // draft management
  const loadDrafts = useCallback(() => {
    try { const raw = localStorage.getItem('kb_drafts'); if (raw) setDrafts(JSON.parse(raw)) } catch {}
  }, [])
  const saveDraft = useCallback((convId: number, text: string) => {
    setDrafts(prev => { const next = { ...prev, [convId]: text }; localStorage.setItem('kb_drafts', JSON.stringify(next)); return next })
  }, [])
  useEffect(() => { loadDrafts() }, [loadDrafts])

  const currentConv = conversations.find(c=> c.id===currentConversationId) || null
  const currentMsgs = currentConversationId ? (messages[currentConversationId]||[]) : []
  const typingSet = useChatStore((s)=> currentConversationId ? s.typingUsers[currentConversationId] : undefined)
  const [mobileView, setMobileView]=useState<'list'|'chat'>(typeof window !== 'undefined' && window.innerWidth < 1024 && currentConversationId ? 'chat' : 'list')
  useEffect(()=>{ if (currentConversationId && window.innerWidth < 1024) setMobileView('chat') }, [currentConversationId])

  // scrolling: handle new messages, preserve position on loading older
  const scrollToBottom = (smooth=true)=>{
    const el=listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setShowNewIndicator(false)
    setIsAtBottom(true)
  }

  const scrollSnapshotRef = useRef<{prevHeight:number, prevTop:number, convId:number} | null>(null)

  const handleMessageScroll = ()=>{
    const el=listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setIsAtBottom(atBottom)
    if (atBottom) setShowNewIndicator(false)
    // infinite scroll: near top
    if (el.scrollTop < 80 && hasMore[currentConversationId!] && !isLoadingMoreRef.current && !loadingMessages) {
      const firstId = currentMsgs[0]?.id
      if (!firstId) return
      isLoadingMoreRef.current = true
      scrollSnapshotRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop, convId: currentConversationId! }
      fetchMessages(currentConversationId!, firstId)
    }
  }

  // restore scroll position after older messages load
  const prevLoadingRef = useRef(loadingMessages)
  useEffect(()=>{
    if (prevLoadingRef.current && !loadingMessages && scrollSnapshotRef.current) {
      const { prevHeight, prevTop, convId } = scrollSnapshotRef.current
      if (convId === currentConversationId) {
        scrollSnapshotRef.current = null
        requestAnimationFrame(()=>{
          if (listRef.current) {
            const newHeight = listRef.current.scrollHeight
            listRef.current.scrollTop = prevTop + (newHeight - prevHeight)
          }
        })
      } else {
        scrollSnapshotRef.current = null
      }
      isLoadingMoreRef.current = false
    }
    prevLoadingRef.current = loadingMessages
  }, [loadingMessages, currentConversationId])

  // auto-scroll when new messages arrive only if user was at bottom
  const prevMsgLenRef=useRef(0)
  useEffect(()=>{
    const len=currentMsgs.length
    if (len > prevMsgLenRef.current) {
      if (isAtBottom) {
        // smooth scroll after render
        setTimeout(()=> scrollToBottom(true), 50)
      } else {
        setShowNewIndicator(true)
      }
    }
    prevMsgLenRef.current=len
  }, [currentMsgs.length])

  // when switching conversation, reset and scroll to bottom
  useEffect(()=>{
    setIsAtBottom(true)
    setShowNewIndicator(false)
    setTimeout(()=> scrollToBottom(false), 100)
  }, [currentConversationId])

  // filtered conversations by tab and search
  const filteredByTab = (()=> {
    let base = conversations
    if (sidebarTab==='groups') base = base.filter(c=> c.is_group)
    if (sidebarTab==='chats') base = base // all
    if (search) {
      const s=search.toLowerCase()
      base = base.filter(c=> (c.title||'').toLowerCase().includes(s) || c.last_message?.content?.toLowerCase().includes(s))
    }
    return base
  })()

  const typingMap = useChatStore(s=> s.typingUsers)

  const handlePin=async (id:number)=>{
    try { await convApi.pin(id); fetchConversations() } catch {}
  }
  const handleArchive=async (id:number)=>{
    try { await convApi.archive(id); fetchConversations() } catch {}
  }

  const handleSelect=async (id:number)=>{
    // save draft for current conversation before switching
    if (currentConversationId && drafts[currentConversationId]) {
      saveDraft(currentConversationId, drafts[currentConversationId])
    }
    setCurrent(id)
    fetchMessages(id)
    setShowGroupInfo(false)
    setActiveRightTab('chat')
    setIsMuted(false)
    // load pinned messages
    try { const res = await msgPinApi.list(id); if (res.success) setPinnedMessages(res.data) } catch {}
  }

  const handleStartChat=async (targetUser:any)=>{
    try {
      const res=await convApi.create({ participant_id: targetUser.id })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
        setShowUserSearch(false)
        setShowContacts(false)
        setSidebarTab('chats')
        if (window.innerWidth < 1024) setMobileView('chat')
      }
    } catch (e:any) { toast(e.response?.data?.detail || 'Failed to start chat', 'error') }
  }

  const handleCreateGroup=async ()=>{
    if (!groupTitle.trim()) return toast('Group name required', 'error')
    if (groupMembers.length===0) return toast('Add at least one member', 'error')
    try {
      const res=await convApi.create({ is_group:true, title: groupTitle, member_ids: groupMembers.map(m=>m.id) })
      if (res.success) {
        await fetchConversations()
        setCurrent(res.data.id)
        fetchMessages(res.data.id)
        setShowNewGroup(false)
        setGroupTitle('')
        setGroupMembers([])
      }
    } catch (e:any) { toast(e.response?.data?.detail || 'Failed', 'error') }
  }

  const handleSend=async (content:string, attachmentIds?:number[], type?:string)=>{
    if (!currentConversationId) return
    if (editTarget) {
      await editMessage(editTarget.id, content)
      setEditTarget(null)
      setEditText('')
      return
    }
    try {
      await sendMessage(currentConversationId, content, replyTo?.id, attachmentIds, type)
    } catch (e:any) {
      toast('Failed to send: ' + (e.response?.data?.message || e.message), 'error')
    }
  }

  const handleCopy=(t:string)=>{ navigator.clipboard.writeText(t); }
  const handleReact=async (id:number, emoji:string)=>{
    const msg=currentMsgs.find(m=> m.id===id)
    if (!msg || !user) return
    const myReacts = msg.reactions.filter(r=> r.user_id===user.id)
    const hasSame = myReacts.some(r=> r.emoji===emoji)
    try {
      if (hasSame) {
        // remove existing
        const { msgApi } = await import('../services/api')
        await msgApi.removeReaction(id, emoji)
      } else {
        // replace: remove all my previous reactions first (single reaction per user)
        const { msgApi } = await import('../services/api')
        for (const r of myReacts) {
          try { await msgApi.removeReaction(id, r.emoji) } catch {}
        }
        await msgApi.react(id, emoji)
      }
    } catch (e:any) {
      // fallback to store's react (for count)
      try { await react(id, emoji) } catch {}
    }
  }
  const handleForward=async (msg:Message)=>{
    setForwardMsg(msg)
  }
  const doForward=async (targetIds:number[])=>{
    if (!forwardMsg) return
    try {
      const res=await extendedApi.forward(forwardMsg.id, targetIds)
      if (res.success) { toast(`Forwarded to ${res.data.forwarded_to.length} chats`, 'success'); setForwardMsg(null); fetchConversations() }
    } catch (e:any) { toast(e.response?.data?.detail || 'Forward failed', 'error') }
  }
  const handleSave=async (msg:Message)=>{
    const isSaved = savedIds.has(msg.id)
    try {
      if (isSaved) { await savedApi.unsave(msg.id); setSavedIds(s=> { const n=new Set(s); n.delete(msg.id); return n }) }
      else { await savedApi.save(msg.id); setSavedIds(s=> new Set(s).add(msg.id)) }
    } catch (e:any) { toast(e.response?.data?.message || 'Save failed', 'error') }
  }
  const handleAIAction=async (msg:Message, action:string)=>{
    setAiResult(null)
    try {
      const text = msg.content || ''
      let res
      if (action==='summarize') res = await aiApi.summarize(text)
      else if (action==='translate') res = await aiApi.translate(text)
      else res = await aiApi.action(text, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.translation || res.data?.result || 'No result'
      setAiResult({ text: resultText, action })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
  }
  const handleSelectToggle=(msg:Message)=>{
    setSelectedIds(s=> { const n=new Set(s); if(n.has(msg.id)) n.delete(msg.id); else n.add(msg.id); return n })
  }
  const handleSelectDelete=async ()=>{
    if (selectedIds.size===0) return
    if (!confirm(`Delete ${selectedIds.size} selected messages?`)) return
    for (const id of selectedIds) {
      const m = currentMsgs.find(x=> x.id===id)
      if (m && m.sender_id===user?.id) await deleteMessage(id)
    }
    setSelectedIds(new Set())
  }
  const handleMute=async ()=>{
    if (!currentConv) return
    const next=!isMuted
    try { await extendedApi.mute(currentConv.id, next); setIsMuted(next) } catch {}
  }
  const handleClear=async ()=>{
    if (!currentConv) return
    if (!confirm('Clear all messages in this conversation? This cannot be undone.')) return
    try { await extendedApi.clear(currentConv.id); fetchMessages(currentConv.id); fetchConversations() } catch (e:any) { toast(e.response?.data?.message || 'Clear failed', 'error') }
  }
  const handleExport=async (fmt:'json'|'txt')=>{
    if (!currentConv) return
    try {
      if (fmt==='txt') {
        const blob = await extendedApi.exportChat(currentConv.id, 'txt') as Blob
        const url=URL.createObjectURL(blob)
        const a=document.createElement('a'); a.href=url; a.download=`kbchat_${currentConv.id}.txt`; a.click(); URL.revokeObjectURL(url)
      } else {
        const res=await extendedApi.exportChat(currentConv.id, 'json')
        const blob=new Blob([JSON.stringify(res.data, null, 2)], {type:'application/json'})
        const url=URL.createObjectURL(blob)
        const a=document.createElement('a'); a.href=url; a.download=`kbchat_${currentConv.id}.json`; a.click(); URL.revokeObjectURL(url)
      }
    } catch (e:any) { toast('Export failed', 'error') }
  }
  const handleCall=(type:'voice'|'video')=>{
    if (!currentConv) return
    const other = currentConv.members.find(m=> m.user_id!==user?.id)
    if (!other) return toast('No peer to call', 'error')
    // start call via API
    callsApi.start({ callee_id: other.user_id, conversation_id: currentConv.id, call_type: type })
      .then(r=>{
        if(r.success) setCallModal({open:true, type, peerName: other.display_name, peerAvatar: other.avatar_url, incoming:false, callId: r.data.id, peerId: other.user_id})
      })
      .catch(e=> toast(e.response?.data?.detail || 'Call failed', 'error'))
  }
  const handleCallAccept=async ()=>{
    if (callModal?.callId) { await callsApi.accept(callModal.callId); setCallModal(m=> m ? {...m, incoming:false} : null) }
  }
  const handleCallRejectOrEnd=async ()=>{
    if (callModal?.callId) await callsApi.end(callModal.callId, callModal.incoming ? 'rejected' : 'ended')
    setCallModal(null)
  }

  const typingNames = typingSet ? Array.from(typingSet).map(uid=>{
    const mem=currentConv?.members.find(m=> m.user_id===uid)
    return mem?.display_name || 'Someone'
  }).join(', ') : ''

  // filter messages by right tab
  const displayedMsgs = (()=> {
    if (activeRightTab==='chat') return currentMsgs
    if (activeRightTab==='files') return currentMsgs.filter(m=> m.attachments.some(a=> !a.mime_type.startsWith('image/')))
    if (activeRightTab==='media') return currentMsgs.filter(m=> m.attachments.some(a=> a.mime_type.startsWith('image/')))
    if (activeRightTab==='links') return currentMsgs.filter(m=> m.content && /https?:\/\//.test(m.content))
    if (activeRightTab==='voice') return currentMsgs.filter(m=> m.message_type==='voice' || m.attachments.some(a=> a.mime_type.startsWith('audio/')))
    return currentMsgs
  })()

  const totalUnread = conversations.reduce((a,b)=> a+b.unread_count, 0)

  return (
    <div className="h-[100dvh] flex flex-col bg-background">
      <header className="h-14 border-b bg-card flex items-center justify-between px-3 sm:px-4 shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">KB</div>
          <span className="font-bold hidden sm:inline">KB Chat</span>
          <span className="text-xs px-2 py-1 rounded-full bg-muted hidden sm:inline">Connect. Chat. Share.</span>
          <ServerStatus />
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          <button onClick={()=> { setShowNotifications(true); setShowSaved(false); setShowContacts(false); setShowCalls(false); setShowProfile(false); setShowSettings(false)}} className="p-2 rounded-full hover:bg-muted relative" title="Notifications">
            <Bell className="w-4 h-4"/>
            {totalUnread>0 && <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center">{totalUnread}</span>}
          </button>
          <button onClick={()=> setShowMessageSearch(!showMessageSearch)} className="p-2 rounded-full hover:bg-muted" title="Search (Ctrl+K)"><Search className="w-4 h-4"/></button>
          <button onClick={()=> { setShowSaved(true); setShowNotifications(false); setShowContacts(false); setShowCalls(false); setShowProfile(false); setShowSettings(false)}} className="hidden sm:flex p-2 rounded-full hover:bg-muted" title="Saved"><Bookmark className="w-4 h-4"/></button>
          <button onClick={()=> { setShowProfile(true); setShowNotifications(false); setShowSaved(false); setShowContacts(false); setShowCalls(false); setShowSettings(false)}} className="p-1 rounded-full hover:bg-muted">
            <div className="w-8 h-8 rounded-full overflow-hidden bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-white text-xs font-bold">
              {user?.avatar_url ? <img src={user.avatar_url} className="w-full h-full object-cover" alt=""/> : (user?.display_name?.[0] || 'U')}
            </div>
          </button>
          <button onClick={()=> { setShowSettings(true); setShowProfile(false); setShowNotifications(false); setShowSaved(false); setShowContacts(false); setShowCalls(false)}} className="p-2 rounded-full hover:bg-muted"><SettingsIcon className="w-4 h-4"/></button>
          <button onClick={async ()=>{ await logout(); nav('/login')}} className="p-2 rounded-full hover:bg-muted text-destructive"><LogOut className="w-4 h-4"/></button>
        </div>
      </header>

      {showMessageSearch && (
        <div className="border-b p-2 bg-card flex gap-2">
          <input ref={searchRef} value={messageSearch} onChange={e=>setMessageSearch(e.target.value)} placeholder="Search messages (Enter to search, Esc to close)..." className="flex-1 px-3 py-2 rounded-xl bg-muted outline-none text-sm" autoFocus />
          <button onClick={async ()=>{
            if (!messageSearch.trim()) return
            const msgs = await useChatStore.getState().searchMessages(messageSearch.trim(), currentConversationId || undefined)
            if (msgs.length>0) {
              // jump to first result's conversation
              const first = msgs[0]
              setCurrent(first.conversation_id)
              fetchMessages(first.conversation_id)
              if (window.innerWidth < 1024) setMobileView('chat')
              toast(`Found ${msgs.length} messages. Jumped to conversation.`, 'info')
            } else toast('No results', 'info')
          }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm">Search</button>
          <button onClick={()=> setShowMessageSearch(false)} className="px-3 py-2 rounded-xl bg-muted text-sm"><X className="w-4 h-4"/></button>
        </div>
      )}

      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left sidebar with navigation icons + list */}
        <div className={`${mobileView==='chat' ? 'hidden lg:flex' : 'flex'} w-full lg:w-[380px] shrink-0 border-r bg-card flex-col overflow-hidden min-h-0`}>
          {/* Icon nav */}
          <div className="w-16 border-r bg-muted/20 hidden sm:flex flex-col items-center py-4 gap-3">
            {[
              {id:'chats', icon: MessageSquare, label:'Chats', count: conversations.length},
              {id:'status', icon: Contact, label:'Status'},
              {id:'groups', icon: Users, label:'Groups', count: conversations.filter(c=>c.is_group).length},
              {id:'calls', icon: Phone, label:'Calls'},
              {id:'contacts', icon: Contact, label:'Contacts'},
              {id:'saved', icon: Bookmark, label:'Saved'},
              {id:'ai', icon: Bot, label:'KB AI'},
            ].map(item=> (
              <button key={item.id} onClick={()=>{
                if (item.id==='status') { setShowStatus(true); setShowContacts(false); setShowSaved(false); setShowCalls(false) }
                else if (item.id==='chats' || item.id==='groups') { setSidebarTab(item.id as any); setShowContacts(false); setShowSaved(false); setShowCalls(false); setShowStatus(false) }
                else if (item.id==='contacts') { setShowContacts(true); setShowSaved(false); setShowCalls(false); setShowStatus(false) }
                else if (item.id==='saved') { setShowSaved(true); setShowContacts(false); setShowCalls(false); setShowStatus(false) }
                else if (item.id==='calls') { setShowCalls(true); setShowContacts(false); setShowSaved(false); setShowStatus(false) }
                else if (item.id==='ai') { nav('/ai') }
              }} className={`w-10 h-10 rounded-xl flex flex-col items-center justify-center gap-0.5 ${(item.id==='status' && showStatus) || ((sidebarTab===item.id && !showContacts && !showSaved && !showCalls && !showStatus) || (item.id==='contacts' && showContacts) || (item.id==='saved' && showSaved) || (item.id==='calls' && showCalls)) ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`} title={item.label}>
                <item.icon className="w-5 h-5"/>
                {item.count !== undefined && item.count>0 && <span className="text-[9px]">{item.count}</span>}
              </button>
            ))}
          </div>

          {/* Mobile top tabs for sidebar */}
          <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
            <div className="sm:hidden flex gap-1 p-2 border-b overflow-x-auto scrollbar-none">
              {[
                {id:'chats', label:'Chats'},
                {id:'status', label:'Status'},
                {id:'groups', label:'Groups'},
                {id:'calls', label:'Calls'},
                {id:'contacts', label:'Contacts'},
                {id:'saved', label:'Saved'},
              ].map(t=> (
                <button key={t.id} onClick={()=>{
                  if (t.id==='status') { setShowStatus(true); setShowContacts(false); setShowSaved(false); setShowCalls(false) }
                  else if (t.id==='contacts') { setShowContacts(true); setShowSaved(false); setShowCalls(false); setShowStatus(false) }
                  else if (t.id==='saved') { setShowSaved(true); setShowContacts(false); setShowCalls(false); setShowStatus(false) }
                  else if (t.id==='calls') { setShowCalls(true); setShowContacts(false); setShowSaved(false); setShowStatus(false) }
                  else { setSidebarTab(t.id as any); setShowContacts(false); setShowSaved(false); setShowCalls(false); setShowStatus(false) }
                }} className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap shrink-0 ${ (t.id==='status' && showStatus) || (sidebarTab===t.id && !showContacts && !showSaved && !showCalls && !showStatus) || (t.id==='contacts' && showContacts) || (t.id==='saved' && showSaved) || (t.id==='calls' && showCalls) ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{t.label}</button>
              ))}
            </div>

            {/* Sidebar content switcher */}
            {showStatus ? (
              <StatusPanel onClose={()=> { setShowStatus(false); setSidebarTab('chats')}} onViewer={(s, all)=> setStatusViewer({statuses: all, idx: all.findIndex(x=> x.id===s.id)})} />
            ) : showContacts ? (
              <ContactsPanel onClose={()=> { setShowContacts(false); setSidebarTab('chats')}} onChat={handleStartChat} />
            ) : showSaved ? (
              <SavedMessagesPanel onClose={()=> { setShowSaved(false); setSidebarTab('chats')}} onJump={(cid, mid)=>{ setCurrent(cid); fetchMessages(cid); setShowSaved(false); setMobileView('chat')}} />
            ) : showCalls ? (
              <CallsPanel onClose={()=> { setShowCalls(false); setSidebarTab('chats')}} />
            ) : (
              <>
                <div className="flex items-center justify-between p-3 border-b">
                  <h2 className="font-semibold flex items-center gap-2">{sidebarTab==='groups' ? <Users className="w-4 h-4"/> : <MessageSquare className="w-4 h-4"/>} {sidebarTab==='groups' ? 'Groups' : 'Chats'}</h2>
                  <div className="flex gap-1">
                    <button onClick={()=> setShowNewGroup(true)} className="p-2 rounded-full hover:bg-muted" title="New Group"><Users className="w-4 h-4"/></button>
                    <button onClick={()=> setShowUserSearch(!showUserSearch)} className="p-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90" title="New Chat"><Plus className="w-4 h-4"/></button>
                  </div>
                </div>
                {showUserSearch && <div className="border-b bg-muted/20"><UserSearch onSelect={handleStartChat} /><button onClick={()=>setShowUserSearch(false)} className="w-full text-xs py-2 text-muted-foreground hover:bg-muted">Close</button></div>}
                {showNewGroup && (
                  <div className="p-3 border-b bg-muted/20 space-y-2">
                    <h3 className="font-medium text-sm">New Group</h3>
                    <input value={groupTitle} onChange={e=>setGroupTitle(e.target.value)} placeholder="Group name" className="w-full px-3 py-2 rounded-xl bg-background border outline-none text-sm" />
                    <div className="flex flex-wrap gap-1">
                      {groupMembers.map(m=> (
                        <span key={m.id} className="px-2 py-1 rounded-full bg-primary text-primary-foreground text-xs flex items-center gap-1">{m.display_name} <button onClick={()=> setGroupMembers(gm=> gm.filter(x=>x.id!==m.id))}>×</button></span>
                      ))}
                    </div>
                    <UserSearch onSelect={(u)=> { if (!groupMembers.find(m=>m.id===u.id)) setGroupMembers([...groupMembers, u]) }} />
                    <div className="flex gap-2">
                      <button onClick={handleCreateGroup} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium">Create</button>
                      <button onClick={()=> setShowNewGroup(false)} className="px-4 py-2 rounded-xl bg-background border text-sm">Cancel</button>
                    </div>
                  </div>
                )}
                <div className="flex-1 min-h-0">
                  <ConversationList conversations={filteredByTab} activeId={currentConversationId} onSelect={(id)=> { handleSelect(id); setMobileView('chat')}} search={search} onSearch={setSearch} typingMap={typingMap} currentUserId={user?.id} onPin={handlePin} onArchive={handleArchive} onMute={handleMute} loading={loadingConvs} />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Chat area */}
        <section className={`${mobileView==='list' ? 'hidden lg:flex' : 'flex'} flex-1 flex-col min-w-0 min-h-0 overflow-hidden bg-muted/20 ${settings.chat_wallpaper==='dots' ? 'bg-[radial-gradient(circle_at_1px_1px,rgba(0,0,0,0.06)_1px,transparent_0)] bg-[size:20px_20px] dark:bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.06)_1px,transparent_0)]' : settings.chat_wallpaper==='gradient' ? 'bg-gradient-to-br from-violet-500/5 to-indigo-500/5' : ''}`}>
          {currentConv ? (
            <DragDropZone onFilesUploaded={(ids)=> { if(ids.length>0) handleSend('', ids) }}>
              <ChatHeader conv={currentConv} currentUserId={user?.id} onBack={()=> setMobileView('list')} onInfo={()=> setShowGroupInfo(!showGroupInfo)} onCall={handleCall} onMute={handleMute} onSearch={()=> setShowMessageSearch(!showMessageSearch)} activeTab={activeRightTab} onTabChange={(t)=> setActiveRightTab(t as any)} />
              {typingNames && <div className="px-4 py-1 text-xs text-muted-foreground bg-card border-b">{typingNames} is typing...</div>}
              {selectedIds.size>0 && (
                <div className="px-3 py-2 bg-primary text-primary-foreground flex items-center justify-between text-sm">
                  <span>{selectedIds.size} selected</span>
                  <div className="flex gap-2">
                    <button onClick={handleSelectDelete} className="px-3 py-1 rounded-full bg-white text-primary text-xs flex items-center gap-1"><Trash2 className="w-3 h-3"/> Delete</button>
                    <button onClick={()=> setSelectedIds(new Set())} className="px-3 py-1 rounded-full bg-white/20 text-xs">Cancel</button>
                  </div>
                </div>
              )}
              {editTarget && (
                <div className="px-3 py-2 bg-amber-500/10 border-b flex items-center justify-between text-sm">
                  <span>Editing: <span className="font-medium">{editTarget.content?.slice(0,40)}</span></span>
                  <button onClick={()=> {setEditTarget(null); setEditText('')}} className="px-3 py-1 rounded-full bg-background border text-xs">Cancel</button>
                </div>
              )}
              {/* Message list */}
              <div className="flex-1 overflow-y-auto relative min-h-0" ref={listRef} onScroll={handleMessageScroll}>
                {loadingMessages && <div className="sticky top-0 z-10 flex justify-center py-2 bg-background/80 backdrop-blur"><span className="text-xs px-3 py-1 rounded-full bg-muted animate-pulse">Loading older...</span></div>}
                {hasMore[currentConversationId!] && activeRightTab==='chat' && <div className="text-center py-2"><button onClick={()=> fetchMessages(currentConversationId!, currentMsgs[0]?.id)} className="text-xs px-3 py-1 rounded-full bg-muted hover:bg-accent">Load older</button></div>}
                {activeRightTab==='chat' ? (
                  <div className="py-2 space-y-0.5">
                    {displayedMsgs.map((msg, idx)=>{
                      const prev = displayedMsgs[idx-1]
                      const isOwn = msg.sender_id === user?.id
                      const showAvatar = !!currentConv.is_group && (!prev || prev.sender_id !== msg.sender_id)
                      return <MessageBubble key={msg.id} msg={msg} isOwn={!!isOwn} isGroup={!!currentConv.is_group} showAvatar={showAvatar}
                        onReply={(m)=> setReplyTo({id:m.id, content: m.content||'', sender: m.sender_display_name||'Unknown'})}
                        onEdit={(m)=> { setEditTarget(m); setEditText(m.content||'')}}
                        onDelete={async (m)=>{ if(confirm('Delete?')) await deleteMessage(m.id)}}
                        onReact={handleReact}
                        onCopy={handleCopy}
                        onForward={handleForward}
                        onSave={handleSave}
                        onSelect={handleSelectToggle}
                        isSelected={selectedIds.has(msg.id)}
                        onImageClick={(url,name,all,idx)=> setLightbox({images:all, idx})}
                        savedIds={savedIds}
                        onPin={async (m)=>{
                          try {
                            if ((m as any).is_pinned) { await msgPinApi.unpin(m.id) } else { await msgPinApi.pin(m.id) }
                            if (currentConversationId) { const res = await msgPinApi.list(currentConversationId); if (res.success) setPinnedMessages(res.data) }
                            fetchMessages(currentConversationId!)
                          } catch {}
                        }}
                        onAIAction={handleAIAction}
                      />
                    })}
                  </div>
                ) : (
                  <div className="p-4">
                    <h3 className="font-medium mb-3">{activeRightTab.toUpperCase()}</h3>
                    {displayedMsgs.length===0 ? <p className="text-sm text-muted-foreground">No {activeRightTab} in this conversation.</p> : (
                      <div className="space-y-2">
                        {displayedMsgs.map(m=> (
                          <div key={m.id} className="p-3 rounded-xl bg-card border">
                            <p className="text-xs text-muted-foreground">{m.sender_display_name} • {new Date(m.created_at||'').toLocaleString()}</p>
                            <p className="text-sm mt-1 line-clamp-2">{m.content}</p>
                            {m.attachments.length>0 && <div className="mt-2 flex flex-wrap gap-2">
                              {m.attachments.map(a=> (
                                <a key={a.id} href={a.file_path.startsWith('/api') ? a.file_path : `/api/uploads/file/${a.filename}`} target="_blank" rel="noreferrer" className="text-xs px-2 py-1 rounded bg-muted hover:bg-accent">
                                  {a.original_filename} ({(a.file_size/1024).toFixed(1)}KB)
                                </a>
                              ))}
                            </div>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {showNewIndicator && (
                  <button onClick={()=> scrollToBottom(true)} className="sticky bottom-4 z-10 self-center px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs shadow-lg hover:bg-primary/90 animate-bounce mx-auto block w-fit">
                    ↓ New messages
                  </button>
                )}
              </div>
              {aiResult && (
                <div className="mx-2 mb-2 p-3 rounded-xl bg-violet-500/5 border border-violet-500/20 flex items-start gap-3 slide-up">
                  <div className="shrink-0 w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center"><Bot className="w-4 h-4 text-violet-500"/></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-violet-500 font-medium mb-1 uppercase tracking-wide">KB AI · {aiResult.action}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{aiResult.text}</p>
                  </div>
                  <button onClick={()=> setAiResult(null)} className="shrink-0 p-1 hover:bg-muted rounded"><X className="w-3.5 h-3.5"/></button>
                </div>
              )}
              <MessageComposer
                onSend={handleSend}
                onTyping={()=>{}}
                conversationId={currentConv.id}
                replyTo={replyTo}
                onCancelReply={()=> setReplyTo(null)}
              />
              {editTarget && (
                <div className="p-2 bg-card border-t flex gap-2">
                  <input value={editText} onChange={e=>setEditText(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-muted outline-none text-sm" placeholder="Edit message..." />
                  <button onClick={()=>{
                    if (editText.trim()) { editMessage(editTarget.id, editText.trim()); setEditTarget(null); setEditText('') }
                  }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm">Save</button>
                </div>
              )}
            </DragDropZone>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <div className="w-20 h-20 rounded-[1.5rem] bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white shadow-xl mb-4">
                <MessageSquare className="w-8 h-8"/>
              </div>
              <h3 className="font-semibold text-lg">Welcome to KB Chat</h3>
              <p className="text-sm text-muted-foreground mt-1 max-w-sm">Select a conversation or start a new chat. Try <kbd className="px-1.5 py-0.5 rounded bg-muted border text-xs">Ctrl+K</kbd> to search.</p>
              <button onClick={()=> setShowUserSearch(true)} className="mt-6 px-5 py-2.5 rounded-full bg-primary text-primary-foreground font-medium">Start a new chat</button>
            </div>
          )}
        </section>

        {/* Right panel */}
        {(showProfile || showGroupInfo || showSettings || showNotifications || showSaved || showContacts || showCalls || showPolls || showPinned || showEvents || showSchedule || showInsights) && (
          <aside className="absolute inset-y-0 right-0 w-full sm:w-[380px] bg-card border-l shadow-2xl z-30 flex flex-col overflow-hidden min-h-0 lg:relative lg:inset-auto lg:w-[360px] xl:w-[380px] shrink-0">
            {showProfile && <ProfilePanel onClose={()=> setShowProfile(false)} />}
            {showGroupInfo && currentConv && <GroupPanel conversation={currentConv} onClose={()=> setShowGroupInfo(false)} onUpdated={()=> fetchConversations()} />}
            {showSettings && <SettingsPanel onClose={()=> setShowSettings(false)} />}
            {showNotifications && <NotificationPanel onClose={()=> setShowNotifications(false)} onSelect={(cid)=>{ setCurrent(cid); fetchMessages(cid); setShowNotifications(false); setMobileView('chat')}} />}
            {showSaved && !showProfile && !showSettings && !showNotifications && !showGroupInfo && <SavedMessagesPanel onClose={()=> setShowSaved(false)} onJump={(cid,mid)=>{ setCurrent(cid); fetchMessages(cid); setShowSaved(false); setMobileView('chat')}} />}
            {showContacts && !showProfile && !showSettings && !showNotifications && !showSaved && !showGroupInfo && <ContactsPanel onClose={()=> setShowContacts(false)} onChat={handleStartChat} />}
            {showCalls && !showProfile && !showSettings && !showNotifications && !showSaved && !showContacts && !showGroupInfo && <CallsPanel onClose={()=> setShowCalls(false)} />}
            {showPolls && currentConv && <PollPanel conversationId={currentConv.id} onClose={()=> setShowPolls(false)} />}
            {showPinned && (
              <div className="flex flex-col h-full bg-card">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="font-semibold text-sm">Pinned Messages</h3>
                  <button onClick={()=> setShowPinned(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {pinnedMessages.length===0 ? <p className="text-sm text-muted-foreground text-center py-8">No pinned messages</p> : pinnedMessages.map(msg => (
                    <div key={msg.id} className="p-3 rounded-xl bg-muted/50 border text-sm cursor-pointer hover:bg-muted" onClick={()=>{ setShowPinned(false) }}>
                      <p className="text-xs text-muted-foreground">{msg.sender_display_name} • {new Date(msg.pinned_at || msg.created_at).toLocaleString()}</p>
                      <p className="mt-1 line-clamp-3">{msg.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showEvents && currentConv && (
              <div className="flex flex-col h-full bg-card">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="font-semibold text-sm">Events</h3>
                  <button onClick={()=> setShowEvents(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <EventPanel convId={currentConv.id} userId={user?.id || 0} />
                </div>
              </div>
            )}
            {showSchedule && currentConv && (
              <div className="flex flex-col h-full bg-card">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="font-semibold text-sm">Scheduled</h3>
                  <button onClick={()=> setShowSchedule(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ScheduleMessage convId={currentConv.id} />
                </div>
              </div>
            )}
            {showInsights && currentConv && (
              <div className="flex flex-col h-full bg-card">
                <div className="flex items-center justify-between p-3 border-b">
                  <h3 className="font-semibold text-sm">Insights</h3>
                  <button onClick={()=> setShowInsights(false)} className="p-1.5 rounded-lg hover:bg-muted"><X className="w-4 h-4"/></button>
                </div>
                <div className="flex-1 overflow-y-auto">
                  <ChatInsights convId={currentConv.id} />
                </div>
              </div>
            )}
          </aside>
        )}
      </div>

      {/* Overlays */}
      {lightbox && <Lightbox images={lightbox.images} startIndex={lightbox.idx} onClose={()=> setLightbox(null)} />}
      {callModal?.open && <CallModal open={callModal.open} type={callModal.type} peerName={callModal.peerName} peerAvatar={callModal.peerAvatar} isIncoming={callModal.incoming} callId={callModal.callId} peerId={callModal.peerId} onAccept={handleCallAccept} onReject={handleCallRejectOrEnd} onEnd={handleCallRejectOrEnd} />}
      {statusViewer && <StatusViewer statuses={statusViewer.statuses} startIndex={statusViewer.idx} onClose={()=> setStatusViewer(null)} />}
      <CommandPalette open={showCommandPalette} onClose={()=> setShowCommandPalette(false)} commands={buildCommands({
        onNewChat: ()=> setShowUserSearch(true), onNewGroup: ()=> setShowNewGroup(true),
        onNewStatus: ()=> { setShowStatus(true); setSidebarTab('status') },
        onSettings: ()=> setShowSettings(true), onSaved: ()=> setShowSaved(true),
        onCalls: ()=> setShowCalls(true), onNotifications: ()=> setShowNotifications(true),
        onToggleTheme: ()=> settings.update({theme: settings.theme==='dark'?'light':'dark'}),
        onLogout: ()=> { logout(); nav('/login') },
      })} />
      {forwardMsg && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold">Forward message</h3>
              <button onClick={()=> setForwardMsg(null)} className="p-2 hover:bg-muted rounded-full"><X className="w-4 h-4"/></button>
            </div>
            <div className="p-3 border-b bg-muted/20">
              <p className="text-sm line-clamp-2">{forwardMsg.content}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {conversations.map(c=> (
                <label key={c.id} className="flex items-center gap-3 p-2 hover:bg-muted rounded-xl cursor-pointer">
                  <input type="checkbox" id={`fwd-${c.id}`} className="w-4 h-4" />
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 text-white flex items-center justify-center text-xs">{c.title?.[0]}</div>
                  <span className="text-sm font-medium flex-1 truncate">{c.title}</span>
                </label>
              ))}
            </div>
            <div className="p-3 border-t flex gap-2">
              <button onClick={()=> setForwardMsg(null)} className="flex-1 py-2 rounded-xl bg-muted">Cancel</button>
              <button onClick={()=>{
                const ids:number[]=[]
                conversations.forEach(c=>{
                  const el=document.getElementById(`fwd-${c.id}`) as HTMLInputElement
                  if (el?.checked) ids.push(c.id)
                })
                if (ids.length===0) return toast('Select at least one chat', 'error')
                doForward(ids)
              }} className="flex-1 py-2 rounded-xl bg-primary text-primary-foreground font-medium">Forward</button>
            </div>
          </div>
        </div>
      )}

      {/* Group actions footer when chat selected */}
      {currentConv && (
        <div className="hidden">
          {/* hidden buttons for export/clear to satisfy UI states - actual buttons are in right panel but also provide quick actions */}
        </div>
      )}

      {/* Bottom action bar for group right panel extra actions */}
      {currentConv && showGroupInfo && (
        <div className="hidden sm:flex fixed bottom-4 right-4 sm:right-[400px] gap-2">
          <button onClick={handleExport.bind(null,'json')} className="p-2 rounded-full bg-card border shadow-lg" title="Export JSON"><Download className="w-4 h-4"/></button>
          <button onClick={handleExport.bind(null,'txt')} className="p-2 rounded-full bg-card border shadow-lg" title="Export TXT"><FileText className="w-4 h-4"/></button>
          <button onClick={handleClear} className="p-2 rounded-full bg-destructive text-destructive-foreground shadow-lg" title="Clear chat"><Trash2 className="w-4 h-4"/></button>
        </div>
      )}

      {/* Hidden export/clear for non-group */}
      {currentConv && !showGroupInfo && (
        <div className="fixed bottom-4 right-4 lg:right-6 flex gap-1 opacity-0 hover:opacity-100 transition">
          {/* placeholder for consistent layout */}
        </div>
      )}

      <div className="hidden sm:flex bg-card border-t px-3 py-1 items-center justify-between text-xs text-muted-foreground">
        <span>Press <kbd className="px-1 py-0.5 bg-muted border rounded">Ctrl+K</kbd> for commands • <kbd className="px-1 py-0.5 bg-muted border rounded">Enter</kbd> to send • Drag files to upload</span>
        <div className="flex gap-1">
          <button onClick={()=> setShowPolls(!showPolls)} className="px-2 py-0.5 rounded hover:bg-muted" title="Polls">Polls</button>
          <button onClick={()=> { setShowPinned(!showPinned); if(currentConversationId) msgPinApi.list(currentConversationId).then(r=>{ if(r.success) setPinnedMessages(r.data) }) }} className="px-2 py-0.5 rounded hover:bg-muted" title="Pinned">Pinned{pinnedMessages.length>0 && ` (${pinnedMessages.length})`}</button>
          <button onClick={()=> setShowEvents(!showEvents)} className="px-2 py-0.5 rounded hover:bg-muted" title="Events">Events</button>
          <button onClick={()=> setShowSchedule(!showSchedule)} className="px-2 py-0.5 rounded hover:bg-muted" title="Schedule">Schedule</button>
          <button onClick={()=> setShowInsights(!showInsights)} className="px-2 py-0.5 rounded hover:bg-muted" title="Insights">Insights</button>
        </div>
      </div>

      <div className="bg-amber-500 text-white text-xs text-center py-1.5 hidden" id="offline-banner">You're offline — will retry</div>
    </div>
  )
}

// helper to get FileText icon if not imported

function FileText(props:any){ return <svg {...props} xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg> }
