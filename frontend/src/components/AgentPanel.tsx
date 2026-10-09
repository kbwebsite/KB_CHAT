import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { Send, Sparkles, Plus, FileSearch, Database, X } from 'lucide-react'
import { AiFace } from './AiFace'
import { agentApi } from '../services/api'
import { useAuthStore } from '../store/auth'

const AiMarkdown = lazy(() => import('./AiMarkdown'))

const AGENT_CONV_KEY = 'kb_agent_conv_id'

interface AgentMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export function AgentPanel({
  onClose,
  onMinimize,
}: {
  onClose: () => void
  onMinimize?: () => void
}) {
  const [messages, setMessages] = useState<AgentMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  // Which brain answered last: a real model ('live') or built-in tips ('mock').
  const [provider, setProvider] = useState<string | null>(null)
  const live = !!provider && provider.toLowerCase() !== 'mock'
  const [conversationId, setConversationId] = useState<number | null>(() => {
    const raw = localStorage.getItem(AGENT_CONV_KEY)
    const n = raw ? parseInt(raw, 10) : NaN
    return Number.isFinite(n) ? n : null
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const user = useAuthStore(s => s.user)
  // Code search over the server's code index (existing retrieve endpoint).
  const [showCode, setShowCode] = useState(false)
  const [codeQuery, setCodeQuery] = useState('')
  const [codeResults, setCodeResults] = useState<any[]>([])
  const [codeLoading, setCodeLoading] = useState(false)
  const [codeSearched, setCodeSearched] = useState(false)
  const codeAbortRef = useRef<AbortController | null>(null)
  // Code index state (existing index/status + incremental index endpoints).
  const [indexInfo, setIndexInfo] = useState<{ total_vectors?: number } | null>(null)
  const [indexLoading, setIndexLoading] = useState(false)
  const [indexMsg, setIndexMsg] = useState<string | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  // Restore persisted history for the active agent conversation.
  useEffect(() => {
    if (!conversationId) return
    let cancelled = false
    agentApi.history(conversationId).then((res: any) => {
      if (cancelled || !res?.success) return
      const rows = res.data?.messages || []
      setMessages(rows.map((r: any) => ({
        role: r.role === 'user' ? 'user' : 'assistant',
        content: r.content,
        timestamp: r.created_at ? new Date(r.created_at) : new Date(),
      })))
    }).catch(() => {
      // Conversation was deleted elsewhere — start fresh.
      if (!cancelled) {
        localStorage.removeItem(AGENT_CONV_KEY)
        setConversationId(null)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistConversation = (id: number | null | undefined) => {
    if (id == null) return
    setConversationId(id)
    localStorage.setItem(AGENT_CONV_KEY, String(id))
  }

  const newChat = async () => {
    if (loading) return
    setMessages([])
    setConversationId(null)
    localStorage.removeItem(AGENT_CONV_KEY)
    inputRef.current?.focus()
  }

  const send = async () => {
    if (!input.trim() || loading) return

    const userMsg: AgentMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }
    const currentInput = input.trim()
    setInput('')
    setLoading(true)

    const assistantMsg: AgentMessage = {
      role: 'assistant',
      content: '',
      timestamp: new Date(),
    }
    // No concurrent sends while loading, so the placeholder slot is stable.
    const slotIdx = messages.length + 1
    const fillSlot = (text: string) => {
      setMessages(prev => {
        const next = [...prev]
        if (next[slotIdx] && next[slotIdx].role === 'assistant') {
          next[slotIdx] = { ...next[slotIdx], content: text }
          return next
        }
        return [...prev, { role: 'assistant', content: text, timestamp: new Date() } as AgentMessage]
      })
    }

    try {
      // Use streaming endpoint
      const { getAccessToken } = await import('../services/session')
      const token = getAccessToken()
      const response = await fetch('/api/ai/agent/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: currentInput, conversation_id: conversationId })
      })

      if (!response.ok) throw new Error('Stream failed')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      setMessages(prev => [...prev, userMsg, assistantMsg])
      const parseLine = (line: string) => {
        if (!line.startsWith('data: ')) return
        const data = line.slice(6)
        if (data === '[DONE]') return
        try {
          const event = JSON.parse(data)
          if (event.type === 'conversation') {
            persistConversation(event.conversation_id)
            if (event.provider) setProvider(event.provider)
          } else if (event.type === 'final') {
            fillSlot(event.content ?? '')
          }
        } catch (e) {
          console.error('Parse error:', e)
        }
      }

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) parseLine(line)
      }
      // A final event split across the last chunks has no trailing newline
      // to trigger parsing above — flush the tail or the bubble stays empty.
      if (buffer.trim()) parseLine(buffer)
    } catch (error) {
      console.error('Stream error:', error)
      // Fallback to non-streaming (fills the placeholder, never duplicates)
      try {
        const res = await agentApi.chat(currentInput, conversationId)
        persistConversation(res.data?.conversation_id)
        if (res.data?.provider) setProvider(res.data.provider)
        fillSlot(res.data.response)
      } catch {
        fillSlot('Sorry, something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
      inputRef.current?.focus()
    }
  }

  const quickQuestions = [
    'How do I create a group chat?',
    'How do video calls work?',
    'How do I mute notifications?',
    'How do polls work?',
    'How do I schedule a message?',
    'My messages aren\'t sending — help!',
  ]

  const searchCode = async () => {
    const q = codeQuery.trim()
    if (!q || codeLoading) return
    codeAbortRef.current?.abort()
    const ctrl = new AbortController()
    codeAbortRef.current = ctrl
    setCodeLoading(true)
    setCodeSearched(false)
    try {
      const res: any = await agentApi.retrieve(q, 5, ctrl.signal)
      if (ctrl.signal.aborted) return
      const rows = res?.data?.results ?? res?.results
      setCodeResults(Array.isArray(rows) ? rows : [])
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setCodeResults([])
    }
    if (codeAbortRef.current === ctrl) codeAbortRef.current = null
    setCodeLoading(false)
    setCodeSearched(true)
  }

  const loadIndexStatus = async () => {
    try {
      const res: any = await agentApi.indexStatus()
      const info = res?.data ?? res
      if (info && typeof info.total_vectors === 'number') setIndexInfo(info)
    } catch {
      /* index status is best-effort; the section explains on failure */
    }
  }

  const refreshIndex = async () => {
    if (indexLoading) return
    setIndexLoading(true)
    setIndexMsg(null)
    try {
      // Incremental only: full reindex is admin-gated server-side.
      const res: any = await agentApi.index(true)
      const msg = String(res?.data?.message ?? res?.message ?? '').trim()
      const total = res?.data?.total_vectors ?? res?.total_vectors
      if (typeof total === 'number') setIndexInfo({ total_vectors: total })
      setIndexMsg(msg || 'Index refreshed.')
    } catch (e: any) {
      const status = e?.response?.status
      setIndexMsg(status === 403
        ? 'Index refresh needs admin rights on the server.'
        : 'Could not refresh the index — try again in a moment.')
    }
    setIndexLoading(false)
  }

  useEffect(() => {
    if (showCode && !indexInfo) void loadIndexStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCode])

  useEffect(() => () => { codeAbortRef.current?.abort() }, [])

  return (
    <div className="agent-panel flex flex-col h-full bg-card">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AiFace size={32} state={loading ? 'thinking' : 'idle'} label="Assistant" />
          <div>
            <h2 className="text-sm font-semibold">KB-CHAT Assistant</h2>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <span
                title={live ? 'Connected to a live AI model' : 'Answering from built-in tips (set AI_PROVIDER + key on the server for live AI)'}
                className={`inline-block w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400' : 'bg-amber-400'}`}
              />
              {loading ? 'Working…' : live ? 'Live AI' : 'Offline tips'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowCode(v => !v)} className={`icon-btn w-7 h-7 ${showCode ? 'text-primary' : ''}`} title="Code search" aria-label="Toggle code search" aria-expanded={showCode}>
            <FileSearch className="w-4 h-4" />
          </button>
          <button onClick={newChat} className="icon-btn w-7 h-7" title="New chat">
            <Plus className="w-4 h-4" />
          </button>
          {onMinimize && (
            <button onClick={onMinimize} className="icon-btn w-7 h-7" title="Minimize">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="icon-btn w-7 h-7" title="Close">
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
            <AiFace size={48} state="idle" />
            <div>
              <p className="text-sm font-medium">Hi! How can I help you with KB-CHAT?</p>
              <p className="text-xs text-muted-foreground mt-1">Ask me about features, settings, or troubleshooting</p>
            </div>
            <div className="flex flex-wrap gap-1.5 justify-center max-w-xs">
              {quickQuestions.map(q => (
                <button
                  key={q}
                  onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="px-2.5 py-1 rounded-full bg-secondary text-[10px] hover:bg-secondary/80 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] min-w-0 px-3 py-2 rounded-xl text-sm ${
              m.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap'
                : 'bg-secondary rounded-bl-md'
            }`}>
              {m.role === 'user' ? (
                m.content
              ) : (
                <Suspense fallback={<span className="whitespace-pre-wrap break-words">{m.content}</span>}>
                  <AiMarkdown text={m.content} />
                </Suspense>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="ai-msg-in flex justify-start">
            <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-md text-sm flex items-center gap-2">
              <AiFace size={26} state="thinking" />
              <span className="text-muted-foreground">Working…</span>
            </div>
          </div>
        )}
      </div>

      {/* Code search over the server code index */}
      {showCode && (
        <div className="shrink-0 border-t border-border p-3 space-y-2 max-h-[45%] overflow-y-auto min-h-0">
          <div className="flex gap-2">
            <label htmlFor="agent-code-query" className="sr-only">Search codebase</label>
            <input
              id="agent-code-query"
              value={codeQuery}
              onChange={e => setCodeQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') void searchCode() }}
              placeholder="Search codebase…"
              className="flex-1 min-w-0 px-3 py-2 rounded-xl bg-secondary text-sm outline-none focus:ring-2 focus:ring-ring min-h-[44px]"
            />
            <button
              onClick={() => void searchCode()}
              disabled={!codeQuery.trim() || codeLoading}
              className="shrink-0 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 min-h-[44px] min-w-[44px]"
              aria-label="Search codebase"
            >
              {codeLoading ? '…' : 'Go'}
            </button>
          </div>
          {codeLoading ? (
            <p className="text-xs text-muted-foreground" aria-label="Searching codebase">Searching…</p>
          ) : codeSearched && codeResults.length === 0 ? (
            <p className="text-xs text-muted-foreground">No code matches found.</p>
          ) : (
            codeResults.map((r: any, i: number) => (
              <div key={`${r.file_path}:${r.start_line}:${i}`} className="rounded-xl bg-secondary/60 border border-border/50 px-2.5 py-2 min-w-0">
                <p className="text-xs font-semibold truncate" title={r.file_path}>
                  {r.file_path}{typeof r.start_line === 'number' ? `:${r.start_line}` : ''}
                </p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[r.name, r.language, r.chunk_type].filter(Boolean).join(' · ')}
                  {typeof r.score === 'number' ? ` · ${r.score.toFixed(2)}` : ''}
                </p>
              </div>
            ))
          )}
          <div className="flex items-center gap-2 pt-1">
            <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" aria-hidden />
            <p className="flex-1 text-[11px] text-muted-foreground min-w-0 truncate">
              {indexInfo ? `${indexInfo.total_vectors} vectors indexed` : 'Code index status unknown'}
            </p>
            <button
              onClick={() => void refreshIndex()}
              disabled={indexLoading}
              className="shrink-0 px-3 py-2 rounded-xl bg-secondary text-[11px] font-semibold disabled:opacity-40 min-h-[44px]"
              aria-label="Refresh code index"
            >
              {indexLoading ? '…' : 'Refresh'}
            </button>
          </div>
          {indexMsg && <p className="text-[11px] text-muted-foreground">{indexMsg}</p>}
        </div>
      )}

      {/* Input */}
      <div className="shrink-0 p-3 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                send()
              }
            }}
            placeholder="Ask me anything about KB-CHAT..."
            rows={1}
            className="flex-1 resize-none px-3 py-2 rounded-xl bg-secondary text-sm outline-none focus:ring-2 focus:ring-ring max-h-24"
            disabled={loading}
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="shrink-0 w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-opacity"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}