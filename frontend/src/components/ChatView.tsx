import { useRef, useEffect, useState } from 'react'
import { useAuthStore } from '../store/auth'
import { useChatStore } from '../store/chat'
import { useSettingsStore } from '../store/settings'
import { MessageBubble } from './MessageBubble'
import { MessageComposer } from './MessageComposer'
import { ChatHeader } from './ChatHeader'
import { DragDropZone } from './DragDropZone'
import { Message } from '../types'

import { X, Bot, Sparkles, FileText, Reply, Edit3, Languages, Bookmark, MessageSquare, Users, Phone, Shield, Globe, ChevronRight } from 'lucide-react'
import { Bell, Search as SearchIcon, Moon, Sun } from 'lucide-react'

export function ChatView({
  onBack, onMobileViewChange, onCall, onProfile, onGroupInfo,
  replyTo, setReplyTo, editTarget, setEditTarget, editText, setEditText,
  lightbox, setLightbox, forwardMsg, setForwardMsg,
  selectedIds, setSelectedIds, savedIds, setSavedIds,
  onMobileMore, onReact, onSave, onAIAction, onPin,
  pinnedMessages, setPinnedMessages,
  aiPanelOpen, setAiPanelOpen, aiLoading, aiError, aiResult, setAiResult, handleAiPanelAction,
  isMuted, onMute, showPolls, showPinned, setShowPinned, showEvents, setShowEvents,
  showSchedule, setShowSchedule, showInsights, setShowInsights,
  activeRightTab, handleMessageSearch, onNewChat,
  totalUnread, onNotifications, onSearch, onSaved, onSettings, onThemeToggle, onLogout,
  onAgent,
  // Language selector (from ChatPage)
  showLanguageSelector, languages, languagesLoading, handleLanguageSelect, handleTranslateClick, onCloseLanguageSelector
}: any) {
  const { user } = useAuthStore()
  const settings = useSettingsStore()
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
  const [showRefresh, setShowRefresh] = useState(false)

  const listRef = useRef<HTMLDivElement>(null)
  const isLoadingMoreRef = useRef(false)
  const scrollSnapshotRef = useRef<{ prevHeight: number; prevTop: number; convId: number } | null>(null)
  const prevMsgLenRef = useRef(0)

  const typingNames = typingSet ? Array.from(typingSet).map((uid: any) => {
    const mem = currentConv?.members?.find((m: any) => m.user_id === uid)
    return mem?.display_name || 'Someone'
  }).join(', ') : ''

  const scrollToBottom = (smooth = true) => {
    const el = listRef.current; if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
    setShowNewIndicator(false); setIsAtBottom(true)
  }

  const handleMessageScroll = () => {
    const el = listRef.current; if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100
    setIsAtBottom(atBottom)
    if (atBottom) setShowNewIndicator(false)
    if (el.scrollTop < 80 && hasMore[currentConversationId!] && !isLoadingMoreRef.current && !isCurrentLoading) {
      const firstId = currentMsgs[0]?.id; if (!firstId) return
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
          if (listRef.current) { const newHeight = listRef.current.scrollHeight; listRef.current.scrollTop = prevTop + (newHeight - prevHeight) }
        })
      } else { scrollSnapshotRef.current = null }
      isLoadingMoreRef.current = false
    }
    prevLoadingRef.current = isCurrentLoading
  }, [isCurrentLoading, currentConversationId])

  useEffect(() => {
    const len = currentMsgs.length
    if (len > prevMsgLenRef.current) {
      if (isAtBottom) setTimeout(() => scrollToBottom(true), 50)
      else setShowNewIndicator(true)
    }
    prevMsgLenRef.current = len
  }, [currentMsgs.length])

  useEffect(() => {
    setIsAtBottom(true); setShowNewIndicator(false); setTimeout(() => scrollToBottom(false), 100)
  }, [currentConversationId])

  const handleSend = async (content: string, attachmentIds?: number[], type?: string) => {
    if (!currentConversationId) return
    if (editTarget) { await editMessage(editTarget.id, content); setEditTarget(null); setEditText(''); return }
    try { await sendMessage(currentConversationId, content, replyTo?.id, attachmentIds, type) }
    catch (e: any) { console.error('Send failed:', e) }
  }

  const handleRefresh = async () => {
    if (showRefresh) return; setShowRefresh(true)
    try { await fetchConversations(); if (currentConversationId) await fetchMessages(currentConversationId) } catch {}
    setShowRefresh(false)
  }

  const handleSelectDelete = async () => {
    if (selectedIds.size === 0) return
    if (!confirm(`Delete ${selectedIds.size} selected messages?`)) return
    for (const id of selectedIds) { const m = currentMsgs.find((x: any) => x.id === id); if (m && m.sender_id === user?.id) await deleteMessage(id) }
    setSelectedIds(new Set())
  }

  // ─── Loading: conversation selected but not yet found in store ───
  if (currentConversationId && !currentConv) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center animate-pulse">
            <span className="text-white font-bold text-sm">K</span>
          </div>
          <p className="text-sm text-muted-foreground">Loading conversation...</p>
        </div>
      </div>
    )
  }

  // ─── Welcome Screen (no conversation selected) ───
  if (!currentConv) {
    return (
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="chat-header shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-sm shrink-0">
              K
            </div>
            <div>
              <h1 className="font-bold text-lg gradient-text">Kryzen</h1>
              <p className="text-[11px] text-muted-foreground">Connect. Chat. Share.</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={onThemeToggle} className="icon-btn" title="Toggle theme">
              {settings.theme === 'dark' ? <Sun className="w-[18px] h-[18px]" /> : <Moon className="w-[18px] h-[18px]" />}
            </button>
            <button onClick={onNotifications} className="icon-btn relative" title="Notifications">
              <Bell className="w-[18px] h-[18px]" />
              {totalUnread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full gradient-primary text-[9px] text-white flex items-center justify-center font-bold">{totalUnread}</span>
              )}
            </button>
            <button onClick={onSearch} className="icon-btn" title="Search">
              <SearchIcon className="w-[18px] h-[18px]" />
            </button>
            <button onClick={onProfile} className="ml-1 cursor-pointer">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
              ) : (
                <div className="w-9 h-9 rounded-full gradient-primary flex items-center justify-center text-white font-bold text-xs">
                  {user?.display_name?.[0] || user?.username?.[0] || 'U'}
                </div>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center p-6 min-h-0 overflow-y-auto">
          <div className="max-w-lg w-full text-center">
            <div className="welcome-logo mx-auto mb-4 animate-float">
              <span className="text-4xl font-bold text-white">K</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">
              Welcome to <span className="gradient-text">Kryzen</span>
            </h1>
            <p className="text-muted-foreground mb-6 text-sm">
              Start a conversation, share ideas, and stay connected.
            </p>
            <button onClick={onNewChat} className="btn-gradient px-8 py-3 rounded-2xl text-sm font-semibold text-white mb-8">
              Start New Chat +
            </button>
            <div className="flex items-center gap-4 mb-6">
              <div className="flex-1 h-px bg-border/50" />
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Features</span>
              <div className="flex-1 h-px bg-border/50" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: MessageSquare, label: 'Messaging', desc: 'Real-time chats', gradient: 'linear-gradient(135deg, hsl(262 83% 58%), hsl(199 89% 48%))' },
                { icon: Users, label: 'Groups', desc: 'Team conversations', gradient: 'linear-gradient(135deg, hsl(142 76% 36%), hsl(199 89% 48%))' },
                { icon: Phone, label: 'Calls', desc: 'Voice & video', gradient: 'linear-gradient(135deg, hsl(38 92% 50%), hsl(0 84% 60%))' },
                { icon: Shield, label: 'Secure', desc: 'Private & encrypted', gradient: 'linear-gradient(135deg, hsl(262 83% 58%), hsl(330 81% 60%))' },
              ].map(({ icon: Icon, label, desc, gradient }, i) => (
                <div key={i} className="feature-card animate-slide-up" style={{ animationDelay: `${i * 0.08}s` }}>
                  <div className="feature-card-icon" style={{ background: gradient }}>
                    <Icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="font-semibold text-xs mb-1">{label}</h3>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ─── Active Conversation ───
  return (
    <DragDropZone onFilesUploaded={(ids: number[]) => { if (ids.length > 0) handleSend('', ids) }}>
      <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-background">
        <ChatHeader
          conv={currentConv}
          currentUserId={user?.id}
          onBack={onBack}
          onInfo={onGroupInfo}
          onCall={onCall}
          onMute={onMute}
          onSearch={handleMessageSearch}
          handleRefresh={handleRefresh}
          onAi={() => setAiPanelOpen(!aiPanelOpen)}
          onAgent={onAgent}
        />

        {typingNames && (
          <div className="px-4 py-1.5 text-xs text-muted-foreground glass-subtle shrink-0">
            <span className="font-medium">{typingNames}</span> is typing
            <span className="typing-dots ml-1"><span /><span /><span /></span>
          </div>
        )}

        {selectedIds.size > 0 && (
          <div className="px-3 py-2 gradient-primary text-white flex items-center justify-between text-sm shrink-0">
            <span>{selectedIds.size} selected</span>
            <div className="flex gap-2">
              <button onClick={handleSelectDelete} className="px-3 py-1 rounded-full bg-white/20 text-xs">Delete</button>
              <button onClick={() => setSelectedIds(new Set())} className="px-3 py-1 rounded-full bg-white/20 text-xs">Cancel</button>
            </div>
          </div>
        )}

        {editTarget && (
          <div className="px-3 py-2 bg-warning/10 border-b border-border flex items-center justify-between text-sm shrink-0">
            <span>Editing: <span className="font-medium">{editTarget.content?.slice(0, 40)}</span></span>
            <button onClick={() => { setEditTarget(null); setEditText('') }} className="px-3 py-1 rounded-full bg-muted border border-border text-xs">Cancel</button>
          </div>
        )}

        <div className="message-list flex-1 overflow-y-auto relative min-h-0" ref={listRef} onScroll={handleMessageScroll}>
          {isCurrentLoading && (
            <div className="sticky top-0 z-10 flex justify-center py-2">
              <span className="text-xs px-3 py-1 rounded-full glass animate-pulse">Loading older...</span>
            </div>
          )}
          {hasMore[currentConversationId!] && (
            <div className="text-center py-2">
              <button onClick={() => fetchMessages(currentConversationId!, currentMsgs[0]?.id)} className="text-xs px-3 py-1 rounded-full glass hover:opacity-80 transition-opacity">Load older</button>
            </div>
          )}
          <div className="py-2 px-2 sm:px-4">
            {currentMsgs.map((msg: any, idx: number) => {
              const prev = currentMsgs[idx - 1]
              const next = currentMsgs[idx + 1]
              const isOwn = msg.sender_id === user?.id
              const showAvatar = !!currentConv?.is_group && (!prev || prev.sender_id !== msg.sender_id)
              const prevDate = prev ? new Date(prev.created_at).toDateString() : null
              const msgDate = new Date(msg.created_at).toDateString()
              const showDateSep = prevDate !== msgDate
              const isLastInGroup = !next || next.sender_id !== msg.sender_id || (next && new Date(next.created_at).getTime() - new Date(msg.created_at).getTime() > 300000)
              return (
                <div key={msg.id}>
                  {showDateSep && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-border/50" />
                      <span className="text-[11px] text-muted-foreground font-medium px-2 py-0.5 rounded-full bg-surface-2/50">{new Date(msg.created_at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <div className="flex-1 h-px bg-border/50" />
                    </div>
                  )}
                  <div className={isLastInGroup ? 'mb-3' : 'mb-0.5'}>
                    <MessageBubble
                      msg={msg}
                      isOwn={!!isOwn}
                      isGroup={!!currentConv?.is_group}
                      showAvatar={showAvatar}
                      onReply={(m: any) => setReplyTo({ id: m.id, content: m.content || '', sender: m.sender_display_name || 'Unknown' })}
                      onEdit={(m: any) => { setEditTarget(m); setEditText(m.content || '') }}
                      onDelete={async (m: any) => { if (confirm('Delete?')) await deleteMessage(m.id) }}
                      onReact={onReact}
                      onCopy={(t: string) => navigator.clipboard.writeText(t)}
                      onForward={(m: any) => setForwardMsg(m)}
                      onSave={onSave}
                      onSelect={(m: any) => setSelectedIds((s: Set<number>) => { const n = new Set(s); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n })}
                      isSelected={selectedIds.has(msg.id)}
                      onImageClick={(url: string, name: string, all: any[], idx: number) => setLightbox({ images: all, idx })}
                      savedIds={savedIds}
                      onPin={onPin}
                      onAIAction={onAIAction}
                      onTranslateAction={handleTranslateClick}
                      onMobileMore={(m: any) => onMobileMore(m)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
          {showNewIndicator && (
            <button onClick={() => scrollToBottom(true)} className="sticky bottom-4 z-10 self-center px-4 py-1.5 rounded-full btn-gradient text-xs font-semibold text-white shadow-lg animate-bounce mx-auto block w-fit">
              ↓ New messages
            </button>
          )}
        </div>

        {aiResult && (
          <div className="mx-2 mb-2 p-3 rounded-xl glass-subtle flex items-start gap-3 animate-slide-up shrink-0">
            <div className="shrink-0 w-8 h-8 rounded-lg gradient-primary flex items-center justify-center"><Bot className="w-4 h-4 text-white" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] gradient-text font-semibold mb-1 uppercase tracking-wide">Kryzen AI · {aiResult.action}</p>
              <p className="text-sm whitespace-pre-wrap break-words">{aiResult.text}</p>
            </div>
            <button onClick={() => setAiResult(null)} className="shrink-0 icon-btn w-7 h-7"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {aiPanelOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={() => setAiPanelOpen(false)} />
            <div className="fixed bottom-[88px] right-3 left-3 sm:left-auto sm:w-[360px] z-50 p-4 rounded-2xl glass-strong shadow-2xl animate-slide-up flex flex-col gap-3 max-h-[65vh] overflow-hidden">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white"><Sparkles className="w-3.5 h-3.5" /></span>
                  Kryzen AI
                </h4>
                <button onClick={() => setAiPanelOpen(false)} className="icon-btn w-7 h-7"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Choose a contextual action.</p>
              <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1 overscroll-contain">
                {[
                  { action: 'summarize', label: 'Summarize conversation', icon: Sparkles },
                  { action: 'explain', label: 'Explain message', icon: FileText },
                  { action: 'translate', label: 'Translate message', icon: Languages },
                  { action: 'rewrite', label: 'Rewrite message', icon: Edit3 },
                  { action: 'reply', label: 'Generate reply', icon: Reply },
                  { action: 'extract-tasks', label: 'Extract tasks', icon: FileText },
                  { action: 'unread-summary', label: 'Summarize unread', icon: Bookmark }
                ].map(({ action, label, icon: Icon }) => (
                  <button
                    key={action}
                    onClick={() => {
                      if (action === 'translate') {
                        handleTranslateClick('panel')
                      } else {
                        handleAiPanelAction(action)
                      }
                      setAiPanelOpen(false)
                    }}
                    className="py-2.5 px-3 rounded-xl glass-subtle hover:bg-primary/10 text-sm text-left flex items-center gap-2 border border-border/50 transition-all active:scale-[0.98]"
                  >
                    <Icon className="w-4 h-4 text-primary" /> {label}
                  </button>
                ))}
              </div>
              {aiLoading && <p className="text-xs text-muted-foreground animate-pulse flex items-center gap-2"><span className="w-2 h-2 bg-primary rounded-full animate-bounce" /> Thinking...</p>}
              {aiError && <p className="text-xs text-destructive">Error: {aiError}</p>}
            </div>
          </>
        )}

        {showLanguageSelector && (
          <>
            <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm lg:hidden" onClick={onCloseLanguageSelector} />
            <div className="fixed bottom-[88px] right-3 left-3 sm:left-auto sm:w-[360px] z-50 p-4 rounded-2xl glass-strong shadow-2xl animate-slide-up flex flex-col gap-3 max-h-[65vh] overflow-hidden">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-sm flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg gradient-primary flex items-center justify-center text-white"><Globe className="w-3.5 h-3.5" /></span>
                  Select Language
                </h4>
                <button onClick={onCloseLanguageSelector} className="icon-btn w-7 h-7"><X className="w-4 h-4" /></button>
              </div>
              <p className="text-xs text-muted-foreground">Choose target language for translation.</p>
              <div className="flex-1 overflow-y-auto pr-1 overscroll-contain space-y-1 max-h-[50vh]">
                {languagesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <span className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  languages.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => handleLanguageSelect(lang.code, lang.name)}
                      className="py-2.5 px-3 rounded-xl glass-subtle hover:bg-primary/10 text-sm text-left flex items-center justify-between border border-border/50 transition-all active:scale-[0.98]"
                    >
                      <span className="flex items-center gap-2">
                        <span className="text-lg">{lang.code === 'en' ? '🇺🇸' : lang.code === 'es' ? '🇪🇸' : lang.code === 'fr' ? '🇫🇷' : lang.code === 'de' ? '🇩🇪' : lang.code === 'it' ? '🇮🇹' : lang.code === 'pt' ? '🇵🇹' : lang.code === 'ru' ? '🇷🇺' : lang.code === 'zh' ? '🇨🇳' : lang.code === 'ja' ? '🇯🇵' : lang.code === 'ko' ? '🇰🇷' : lang.code === 'ar' ? '🇸🇦' : lang.code === 'hi' ? '🇮🇳' : '🌐'}</span>
                        <span className="font-medium">{lang.name}</span>
                        {lang.native !== lang.name && <span className="text-xs text-muted-foreground">({lang.native})</span>}
                      </span>
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </button>
                  ))
                )}
              </div>
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
      </div>
    </DragDropZone>
  )
}
