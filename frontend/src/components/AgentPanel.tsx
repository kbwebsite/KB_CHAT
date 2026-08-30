import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Sparkles, Search, Upload, Trash2, Copy, Check, RotateCcw, FileCode, Loader2 } from 'lucide-react'
import { agentApi } from '../services/api'
import { useAuthStore } from '../store/auth'

interface AgentMessage {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: Date
  toolCalls?: Array<{ tool: string; input: any; output: string; success: boolean }>
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
  const [streaming, setStreaming] = useState(false)
  const [showIndexStatus, setShowIndexStatus] = useState(false)
  const [indexStatus, setIndexStatus] = useState<any>(null)
  const [indexLoading, setIndexLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const eventSourceRef = useRef<EventSource | null>(null)
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  const send = async () => {
    if (!input.trim() || loading) return

    const userMsg: AgentMessage = {
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }
    setMessages(prev => [...prev, userMsg])
    const currentInput = input.trim()
    setInput('')
    setLoading(true)
    setStreaming(true)

    try {
      // Use streaming endpoint
      const token = localStorage.getItem('kb_token')
      const response = await fetch('/api/ai/agent/chat/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ message: currentInput })
      })

      if (!response.ok) throw new Error('Stream failed')

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let assistantContent = ''
      let currentToolCalls: AgentMessage['toolCalls'] = []

      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
        toolCalls: []
      }
      let assistantIndex = messages.length
      setMessages(prev => [...prev, assistantMsg])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6)
            if (data === '[DONE]') continue
            try {
              const event = JSON.parse(data)
              handleStreamEvent(event, assistantIndex, setMessages)
            } catch (e) {
              console.error('Parse error:', e)
            }
          }
        }
      }
    } catch (error) {
      console.error('Stream error:', error)
      // Fallback to non-streaming
      try {
        const res = await agentApi.chat(currentInput)
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: res.data.response,
          timestamp: new Date(),
          toolCalls: res.data.actions_taken || []
        }])
      } catch {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: 'Sorry, something went wrong. Please try again.',
          timestamp: new Date()
        }])
      }
    } finally {
      setLoading(false)
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  const handleStreamEvent = (
    event: any,
    assistantIndex: number,
    setMessages: React.Dispatch<React.SetStateAction<AgentMessage[]>>
  ) => {
    setMessages(prev => {
      const next = [...prev]
      const msg = next[assistantIndex]
      if (!msg) return next

      switch (event.type) {
        case 'thought':
          return next // Could show thought in UI
        case 'action':
          return next
        case 'observation':
          // Update tool call with observation
          return next
        case 'final':
          next[assistantIndex] = {
            ...msg,
            content: event.content
          }
          return next
        default:
          return next
      }
    })
  }

  const checkIndexStatus = async () => {
    setIndexLoading(true)
    try {
      const res = await agentApi.indexStatus()
      setIndexStatus(res.data)
      setShowIndexStatus(true)
    } catch (e) {
      console.error('Failed to get index status:', e)
    }
    setIndexLoading(false)
  }

  const reindex = async (incremental = false) => {
    setIndexLoading(true)
    try {
      const res = await agentApi.index(incremental)
      setIndexStatus(res.data)
      setShowIndexStatus(true)
    } catch (e) {
      console.error('Reindex failed:', e)
    }
    setIndexLoading(false)
  }

  const quickQuestions = [
    'Explain the project structure',
    'How does authentication work?',
    'Find all API endpoints',
    'Show me the database models',
    'What are the WebSocket events?',
  ]

  return (
    <div className="agent-panel flex flex-col h-full bg-card">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Bot className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">Kryzen Agent</h2>
            <p className="text-[10px] text-muted-foreground">Code-aware AI assistant</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={checkIndexStatus}
            disabled={indexLoading}
            className="icon-btn w-7 h-7 text-xs"
            title="Index status"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => reindex(false)}
            disabled={indexLoading}
            className="icon-btn w-7 h-7 text-xs"
            title="Full reindex"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          {onMinimize && (
            <button onClick={onMinimize} className="icon-btn w-7 h-7" title="Minimize">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="icon-btn w-7 h-7" title="Close">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Index Status Banner */}
      {showIndexStatus && indexStatus && (
        <div className="shrink-0 p-3 border-b border-border bg-muted/30 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="font-medium">Index Status</span>
            <button onClick={() => setShowIndexStatus(false)} className="text-muted-foreground hover:text-foreground">×</button>
          </div>
          <div className="space-y-1 text-muted-foreground">
            <div>Total vectors: <span className="font-mono text-foreground">{indexStatus.total_vectors}</span></div>
            <div>Embedding model: <span className="font-mono text-foreground">{indexStatus.embedding_model}</span></div>
            <div>Store path: <span className="font-mono text-foreground truncate max-w-[200px]">{indexStatus.vector_store_path}</span></div>
            {indexStatus.message && <div className="text-emerald-500">{indexStatus.message}</div>}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => reindex(true)}
              disabled={indexLoading}
              className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-40"
            >
              {indexLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Incremental Update'}
            </button>
            <button
              onClick={() => reindex(false)}
              disabled={indexLoading}
              className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80 disabled:opacity-40"
            >
              Full Reindex
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-3 opacity-60">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center">
              <Bot className="w-6 h-6 text-violet-500" />
            </div>
            <div>
              <p className="text-sm font-medium">Ask me anything about your codebase</p>
              <p className="text-xs text-muted-foreground mt-1">I can read, write, edit files, run tests, and search code</p>
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
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-secondary rounded-bl-md'
            }`}>
              {m.content}
              {m.toolCalls && m.toolCalls.length > 0 && (
                <div className="mt-2 space-y-1">
                  {m.toolCalls.map((tc, ti) => (
                    <details key={ti} className="text-[10px] bg-background/50 rounded p-1.5">
                      <summary className="flex items-center gap-1 cursor-pointer text-muted-foreground">
                        <span className="font-mono">{tc.tool}</span>
                        <span className={tc.success ? 'text-emerald-500' : 'text-red-500'}>
                          {tc.success ? '✓' : '✗'}
                        </span>
                      </summary>
                      <div className="mt-1 font-mono text-[9px] whitespace-pre-wrap overflow-x-auto">
                        {typeof tc.input === 'object' ? JSON.stringify(tc.input, null, 2) : tc.input}
                      </div>
                      {tc.output && (
                        <div className="mt-1 p-1.5 bg-background rounded text-[9px] whitespace-pre-wrap overflow-x-auto max-h-32 overflow-y-auto">
                          {tc.output.slice(0, 500)}{tc.output.length > 500 ? '...' : ''}
                        </div>
                      )}
                    </details>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {streaming && (
          <div className="flex justify-start">
            <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-md text-sm flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-muted-foreground">Thinking...</span>
            </div>
          </div>
        )}
        {loading && !streaming && (
          <div className="flex justify-start">
            <div className="bg-secondary px-3 py-2 rounded-xl rounded-bl-md text-sm">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}
      </div>

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
            placeholder="Ask about code, request changes, run tests..."
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