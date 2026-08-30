import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Sparkles, MessageCircle, Loader2 } from 'lucide-react'
import { agentApi } from '../services/api'
import { useAuthStore } from '../store/auth'

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
  const [streaming, setStreaming] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const user = useAuthStore(s => s.user)

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages])

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

      const assistantMsg: AgentMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date(),
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
              if (event.type === 'final') {
                setMessages(prev => {
                  const next = [...prev]
                  if (next[assistantIndex]) {
                    next[assistantIndex] = { ...next[assistantIndex], content: event.content }
                  }
                  return next
                })
              }
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

  const quickQuestions = [
    'How do I create a group chat?',
    'How do video calls work?',
    'How do I mute notifications?',
    'How do polls work?',
    'How do I schedule a message?',
    'My messages aren\'t sending — help!',
  ]

  return (
    <div className="agent-panel flex flex-col h-full bg-card">
      {/* Header */}
      <div className="shrink-0 p-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
            <MessageCircle className="w-4 h-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-semibold">KB-CHAT Assistant</h2>
            <p className="text-[10px] text-muted-foreground">Your KB-CHAT helper</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
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
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-teal-600/20 flex items-center justify-center">
              <MessageCircle className="w-6 h-6 text-emerald-500" />
            </div>
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
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-xl text-sm whitespace-pre-wrap ${
              m.role === 'user'
                ? 'bg-primary text-primary-foreground rounded-br-md'
                : 'bg-secondary rounded-bl-md'
            }`}>
              {m.content}
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