import { useRef, useEffect, useState, useCallback } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { ChatHeader } from './ChatHeader'
import { DragDropZone } from './DragDropZone'
import { msgPinApi, aiApi } from '../services/api'
import { Message } from '../types'
import { X, Bot, Sparkles, FileText, Reply, Edit3, Languages, MessageSquare } from 'lucide-react'

export function ChatView({
  onBack,
  onMobileViewChange,
  onCall,
  onProfile,
  onGroupInfo,
  replyTo,
  setReplyTo,
  editTarget,
  setEditTarget,
  editText,
  setEditText,
  lightbox,
  setLightbox,
  forwardMsg,
  setForwardMsg,
  selectedIds,
  setSelectedIds,
  savedIds,
  setSavedIds,
  onMobileMore
}: any) {
  const { user } = useAuthStore()
  const {
    currentConversationId, messages, hasMore, loadingMessages,
    sendMessage, editMessage, deleteMessage, fetchMessages, fetchConversations
  } = useChatStore() as any

  const isCurrentLoading = currentConversationId ? loadingMessages[currentConversationId] : false
  const currentConv = useChatStore(s => s.conversations.find((c: any) => c.id === currentConversationId))
  const currentMsgs = currentConversationId ? (messages[currentConversationId] || []) : []
  const typingSet = useChatStore((s: any) => currentConversationId ? s.typingUsers[currentConversationId] : undefined)

  const [isAtBottom, setIsAtBottom] = useState(true)
  const [showNewIndicator, setShowNewIndicator] = useState(false)
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  const [aiResult, setAiResult] = useState<{ text: string; action: string } | null>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)
  const [pinnedMessages, setPinnedMessages] = useState<any[]>([])
  const [showRefresh, setShowRefresh] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const isLoadingMoreRef = useRef(false)
  const scrollSnapshotRef = useRef<{ prevHeight: number; prevTop: number; convId: number } | null>(null)
  const prevMsgLenRef = useRef(0)

  const typingNames = typingSet ? Array.from(typingSet).map((uid: any) => {
    const mem = currentConv?.members.find((m: any) => m.user_id === uid)
    return mem?.display_name || 'Someone'
  }).join(', ') : ''

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setShowNewIndicator(false)
    setIsAtBottom(true)
  }

  const handleMessageScroll = () => {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setIsAtBottom(atBottom)
    if (atBottom) setShowNewIndicator(false)
    if (el.scrollTop < 80 && hasMore[currentConversationId!] && !isLoadingMoreRef.current && !isCurrentLoading) {
      const firstId = currentMsgs[0]?.id
      if (!firstId) return
      isLoadingMoreRef.current = true
      scrollSnapshotRef.current = { prevHeight: el.scrollHeight, prevTop: el.scrollTop, convId: currentConversationId! }
      fetchMessages(currentConversationId!, firstId)
    }
  }

  const prevLoadingRef = useRef(isCurrentLoading)
  useEffect(() => {
    if (prevLoadingRef.current && !isCurrentLoading && scrollSnapshotRef.current) {
      const { prevHeight, prevTop, convId } = scrollSnapshotRef.current
      if (convId === currentConversationId) {
        scrollSnapshotRef.current = null
        requestAnimationFrame(() => {
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
    prevLoadingRef.current = isCurrentLoading
  }, [isCurrentLoading, currentConversationId])

  useEffect(() => {
    const len = currentMsgs.length
    if (len > prevMsgLenRef.current) {
      if (isAtBottom) {
        setTimeout(() => scrollToBottom(true), 50)
      } else {
        setShowNewIndicator(true)
      }
    }
    prevMsgLenRef.current = len
  }, [currentMsgs.length])

  useEffect(() => {
    setIsAtBottom(true)
    setShowNewIndicator(false)
    setTimeout(() => scrollToBottom(false), 100)
  }, [currentConversationId])

  const handleSend = async (content: string, attachmentIds?: number[], type?: string) => {
    if (!currentConversationId) return
    if (editTarget) {
      await editMessage(editTarget.id, content)
      setEditTarget(null)
      setEditText('')
      return
    }
    try {
      await sendMessage(currentConversationId, content, replyTo?.id, attachmentIds, type)
    } catch (e: any) {
      console.error('Send failed:', e)
    }
  }

  const handleReact = async (id: number, emoji: string) => {
    const msg = currentMsgs.find((m: any) => m.id === id)
    if (!msg || !user) return
    const myReacts = msg.reactions.filter((r: any) => r.user_id === user.id)
    const hasSame = myReacts.some((r: any) => r.emoji === emoji)
    try {
      if (hasSame) {
        const { msgApi } = await import('../services/api')
        await msgApi.removeReaction(id, emoji)
      } else {
        const { msgApi } = await import('../services/api')
        for (const r of myReacts) {
          try { await msgApi.removeReaction(id, r.emoji) } catch {}
        }
        await msgApi.react(id, emoji)
      }
    } catch {}
  }

  const handleAIAction = async (msg: Message, action: string) => {
    setAiResult(null)
    try {
      const text = msg.content || ''
      let res
      if (action === 'summarize') res = await aiApi.summarize(text)
      else if (action === 'translate') res = await aiApi.translate(text)
      else res = await aiApi.action(text, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.translation || res.data?.result || 'No result'
      setAiResult({ text: resultText, action })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
  }

  const handleAiPanelAction = async (action: string) => {
    setAiLoading(true)
    setAiError(null)
    try {
      const msgs = currentConversationId ? (messages[currentConversationId] || []) : []
      const recentText = msgs.slice(-10).map((m: any) => `${m.sender_display_name || 'User'}: ${m.content}`).join('\n')
      const contextText = recentText || 'No conversation context available.'
      let res
      if (action === 'summarize') res = await aiApi.summarize(contextText)
      else if (action === 'translate') res = await aiApi.translate(contextText)
      else res = await aiApi.action(contextText, 'text', action)
      const resultText = res.data?.reply || res.data?.summary || res.data?.translation || res.data?.result || 'No result'
      setAiResult({ text: resultText, action })
    } catch { setAiResult({ text: 'AI action failed. Please try again.', action }) }
    setAiLoading(false)
  }

  const handleRefresh = async () => {
    if (showRefresh) return
    setShowRefresh(true)
    try {
      await fetchConversations()
      if (currentConversationId) await fetchMessages(currentConversationId)
    } catch {}
    setShowRefresh(false)
  }

  const handlePin = async (m: any) => {
    try {
      if ((m as any).is_pinned) { await msgPinApi.unpin(m.id) } else { await msgPinApi.pin(m.id) }
      if (currentConversationId) { const res = await msgPinApi.list(currentConversationId); if (res.success) setPinnedMessages(res.data) }
      fetchMessages(currentConversationId!)
    } catch {}
  }

  const handleSave = async (msg: Message) => {
    const { savedApi } = await import('../services/api')
    const isSaved = savedIds.has(msg.id)
    try {
      if (isSaved) { await savedApi.unsave(msg.id); setSavedIds((s: Set<number>) => { const n = new Set(s); n.delete(msg.id); return n }) }
      else { await savedApi.save(msg.id); setSavedIds((s: Set<number>) => new Set(s).add(msg.id)) }
    } catch {}
  }

  // Empty state when no conversation selected
  if (!currentConv) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 min-h-0">
        <div className="text-center px-4">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-primary/10 flex items-center justify-center">
            <MessageSquare className="w-8 h-8 text-primary" />
          </div>
          <h2 className="text-lg font-semibold mb-2">Welcome to Kryzen</h2>
          <p className="text-sm text-muted-foreground max-w-sm">
            Select a conversation from the sidebar or start a new chat to begin messaging.
          </p>
        </div>
      </div>
    )
  }

  return (
    <DragDropZone onFilesUploaded={(ids: number[]) => { if (ids.length > 0) handleSend('', ids) }}>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
        <ChatHeader
          conv={currentConv}
          currentUserId={user?.id}
          onBack={() => { onMobileViewChange('list'); setReplyTo(null); setEditTarget(null); setEditText(''); setSelectedIds(new Set()) }}
          onInfo={() => onGroupInfo(true)}
          onCall={onCall}
          onSearch={() => {}}
          onAi={() => setAiPanelOpen(!aiPanelOpen)}
          handleRefresh={handleRefresh}
        />

        {typingNames && (
          <div className="px-4 py-1 text-xs text-muted-foreground bg-muted border-b border-border">
            <span className="font-medium">{typingNames}</span> is typing
            <span className="typing-dots ml-1"><span /><span /><span /></span>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="px-3 py-2 bg-primary text-primary-foreground flex items-center justify-between text-sm">
            <span>{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <button onClick={() => { selectedIds.forEach((id: number) => { const m = currentMsgs.find((x: any) => x.id === id); if (m && m.sender_id === user?.id) deleteMessage(id) }); setSelectedIds(new Set()) }} className="px-3 py-1 rounded-full bg-white text-primary text-xs">Delete</button>
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 rounded-full bg-white/20 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {editTarget && (
          <div className="px-3 py-2 bg-warning/10 border-b border-border flex items-center justify-between text-sm">
            <span>Editing: <span className="font-medium">{editTarget.content?.slice(0, 40)}</span></span>
            <button onClick={() => { setEditTarget(null); setEditText('') }} className="px-3 py-1 rounded-full bg-muted border border-border text-xs">Cancel</button>
          </div>
        )}

        <div className="message-list flex-1 overflow-y-auto relative min-h-0" ref={listRef} onScroll={handleMessageScroll}>
          {isCurrentLoading && (
            <div className="sticky top-0 z-10 flex justify-center py-2 bg-muted/80 backdrop-blur">
              <span className="text-xs px-3 py-1 rounded-full bg-muted animate-pulse">Loading older...</span>
            </div>
          )}
          {hasMore[currentConversationId!] && (
            <div className="text-center py-2">
              <button onClick={() => fetchMessages(currentConversationId!, currentMsgs[0]?.id)} className="text-xs px-3 py-1 rounded-full bg-muted hover:bg-muted/80 transition-colors">
                Load older
              </button>
            </div>
          )}
          <div className="py-2 space-y-0.5">
            {currentMsgs.map((msg: any, idx: number) => {
              const prev = currentMsgs[idx - 1]
              const isOwn = msg.sender_id === user?.id
              const showAvatar = !!currentConv.is_group && (!prev || prev.sender_id !== msg.sender_id)
              return (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={!!isOwn}
                  isGroup={!!currentConv.is_group}
                  showAvatar={showAvatar}
                  onReply={(m: any) => setReplyTo({ id: m.id, content: m.content || '', sender: m.sender_display_name || 'Unknown' })}
                  onEdit={(m: any) => { setEditTarget(m); setEditText(m.content || '') }}
                  onDelete={async (m: any) => { if (confirm('Delete?')) await deleteMessage(m.id) }}
                  onReact={handleReact}
                  onCopy={(t: string) => navigator.clipboard.writeText(t)}
                  onForward={(m: any) => setForwardMsg(m)}
                  onSave={handleSave}
                  onSelect={(m: any) => {
                    setSelectedIds((s: Set<number>) => {
                      const n = new Set(s)
                      if (n.has(m.id)) n.delete(m.id)
                      else n.add(m.id)
                      return n
                    })
                  }}
                  isSelected={selectedIds.has(msg.id)}
                  onImageClick={(url: string, name: string, all: any[], idx: number) => setLightbox({ images: all, idx })}
                  savedIds={savedIds}
                  onPin={handlePin}
                  onAIAction={handleAIAction}
                  onMobileMore={(m: any) => onMobileMore(m)}
                />
              )
            })}
          </div>
          {showNewIndicator && (
            <button onClick={() => scrollToBottom(true)} className="sticky bottom-4 z-10 self-center px-4 py-1.5 rounded-full bg-primary text-primary-foreground text-xs shadow-lg hover:bg-primary/90 animate-bounce mx-auto block w-fit">
              ↓ New messages
            </button>
          )}
        </div>

        {aiResult && (
          <div className="mx-2 mb-2 p-3 rounded-xl bg-accent/5 border border-accent/20 flex items-start gap-3 slide-up">
            <div className="shrink-0 w-8 h-8 rounded-lg bg-accent/10 flex items-center justify-center"><Bot className="w-4 h-4 text-accent" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-accent font-medium mb-1 uppercase tracking-wide">Kryzen AI · {aiResult.action}</p>
              <p className="text-sm whitespace-pre-wrap break-words">{aiResult.text}</p>
            </div>
            <button onClick={() => setAiResult(null)} className="shrink-0 p-1 hover:bg-muted rounded transition-colors"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {aiPanelOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={() => setAiPanelOpen(false)} />
            <div className="fixed bottom-[88px] right-3 left-3 sm:left-auto sm:w-[360px] z-50 p-4 rounded-2xl bg-card border border-border shadow-2xl slide-up flex flex-col gap-3 max-h-[65vh] overflow-hidden modal-entrance">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center text-primary-foreground"><Sparkles className="w-3.5 h-3.5" /></span>
                  Kryzen AI
                </h4>
                <button onClick={() => setAiPanelOpen(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Choose a contextual action — uses existing AI where available.</p>
              <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1 overscroll-contain">
                {[
                  { action: 'summarize', label: 'Summarize conversation', icon: Sparkles },
                  { action: 'explain', label: 'Explain message', icon: FileText },
                  { action: 'translate', label: 'Translate message', icon: Languages },
                  { action: 'rewrite', label: 'Rewrite message', icon: Edit3 },
                  { action: 'reply', label: 'Generate reply', icon: Reply }
                ].map(({ action, label, icon: Icon }) => (
                  <button key={action} onClick={() => { handleAiPanelAction(action); setAiPanelOpen(false) }} className="py-2.5 px-3 rounded-xl bg-accent/10 hover:bg-accent/15 text-accent text-sm text-left flex items-center gap-2 border border-accent/10 transition-all active:scale-[0.98]">
                    <Icon className="w-4 h-4" /> {label}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-2"><span className="w-2 h-2 bg-accent rounded-full animate-bounce" /> Thinking...</p>}
              {aiError && <p className="text-xs text-destructive">Error: {aiError}</p>}
            </div>
          </>
        )}

        <MessageComposer
          onSend={handleSend}
          onTyping={() => {}}
          conversationId={currentConv.id}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
        />

        {editTarget && (
          <div className="p-2 bg-muted border-t border-border flex gap-2">
            <input value={editText} onChange={e => setEditText(e.target.value)} className="flex-1 px-3 py-2 rounded-xl bg-background border border-border outline-none text-sm" placeholder="Edit message..." />
            <button onClick={() => {
              if (editText.trim()) { editMessage(editTarget.id, editText.trim()); setEditTarget(null); setEditText('') }
            }} className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium transition-colors hover:bg-primary/90">
              Save
            </button>
          </div>
        )}
      </div>
    </DragDropZone>
  )
}