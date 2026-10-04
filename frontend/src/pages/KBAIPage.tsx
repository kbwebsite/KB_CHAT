import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { Send, Sparkles, Trash2, Copy, Check, Square } from 'lucide-react'
import { aiApi } from '../services/api'
import { useAuthStore } from '../store/auth'

// Split the markdown renderer out of the route chunk; plain text shows first.
const AiMarkdown = lazy(() => import('../components/AiMarkdown'))
import { AiFace } from '../components/AiFace'

interface Message { role: 'user' | 'assistant'; content: string; timestamp: Date }

const quickQuestions = [
  'How do I create a group?',
  'How do video calls work?',
  'How do I mute notifications?',
  'How do I change my profile?',
  'How do polls work?',
  'Tips and tricks',
  'Troubleshoot issues',
  'Keyboard shortcuts',
]

export default function KBAIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [aiStatus, setAiStatus] = useState<{ live: boolean; provider?: string; model?: string } | null>(null)
  const [streaming, setStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const streamingRef = useRef(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const user = useAuthStore(s => s.user)

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages])

  useEffect(() => {
    aiApi.status()
      .then((r: any) => {
        if (r?.success) setAiStatus({ live: !!r.data?.live, provider: r.data?.provider, model: r.data?.model })
      })
      .catch(() => {})
  }, [])

  const stop = () => abortRef.current?.abort()

  const send = async () => {
    if (!input.trim() || loading) return
    const msg: Message = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, msg])
    setInput('')
    abortRef.current = new AbortController()
    streamingRef.current = false
    setStreaming(false)
    setLoading(true)
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      // Placeholder the assistant bubble, then fill it word-by-word as
      // tokens stream in (no more staring at dots for the full reply).
      const slot = { i: -1 }
      setMessages(prev => {
        const next = [...prev, { role: 'assistant' as const, content: '', timestamp: new Date() }]
        slot.i = next.length - 1
        return next
      })
      const append = (t: string) => {
        if (!streamingRef.current) {
          streamingRef.current = true
          setStreaming(true)
        }
        setMessages(prev => {
          const next = [...prev]
          if (next[slot.i] && next[slot.i].role === 'assistant') {
            next[slot.i] = { ...next[slot.i], content: next[slot.i].content + t }
          }
          return next
        })
      }
      const full = await aiApi.chatStream(msg.content, history, append, abortRef.current?.signal)
      if (!full.trim()) {
        setMessages(prev => {
          const next = [...prev]
          if (next[slot.i] && next[slot.i].role === 'assistant' && !next[slot.i].content) {
            next[slot.i] = { ...next[slot.i], content: 'Sorry, something went wrong. Please try again.' }
          }
          return next
        })
      }
    } catch {
      // Aborted streams keep their partial text; only real failures get a bubble.
      if (!abortRef.current?.signal.aborted) {
        setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() }])
      }
    }
    abortRef.current = null
    setLoading(false)
    inputRef.current?.focus()
  }

  const copyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const clearChat = () => {
    setMessages([])
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 p-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AiFace size={42} state={loading ? (streaming ? 'working' : 'thinking') : 'idle'} label="Kryzen AI" />
          <div>
            <h1 className="text-base font-semibold">Kryzen AI</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {loading ? (streaming ? 'Working on your reply…' : 'Thinking…') : 'Your personal assistant'}
              {aiStatus && !loading && (
                <span
                  className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    aiStatus.live ? 'bg-green-500/15 text-green-500' : 'bg-amber-500/15 text-amber-500'
                  }`}
                  title={aiStatus.live ? `Live model: ${aiStatus.model || aiStatus.provider}` : 'Answering from the built-in help guide — no cloud model configured'}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${aiStatus.live ? 'bg-green-500' : 'bg-amber-500'}`} />
                  {aiStatus.live ? 'Live AI' : 'Help-guide mode'}
                </span>
              )}
            </p>
          </div>
        </div>
        {messages.length > 0 && (
          <button onClick={clearChat} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors" title="Clear chat">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
            <AiFace size={64} state="idle" />
            <div>
              <p className="text-sm font-medium">Hi {user?.display_name || 'there'}! 👋</p>
              <p className="text-xs text-muted-foreground mt-1">How can I help you today?</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {quickQuestions.map(q => (
                <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="px-3 py-1.5 rounded-full bg-secondary text-xs hover:bg-secondary/80 transition-colors">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          const isLiveBubble =
            m.role === 'assistant' && loading && streaming && i === messages.length - 1
          return (
          <div key={i} className={`ai-msg-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] min-w-0 group relative px-4 py-3 rounded-2xl text-sm ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md whitespace-pre-wrap' : `bg-secondary rounded-bl-md ${isLiveBubble ? 'ai-working-glow' : ''}`}`}>
              {m.role === 'user' ? (
                m.content
              ) : (
                <Suspense fallback={<span className="whitespace-pre-wrap break-words">{m.content}</span>}>
                  <AiMarkdown text={m.content} />
                </Suspense>
              )}
              {m.role === 'assistant' && (
                <button onClick={() => copyMessage(m.content, i)}
                  className="absolute -right-8 top-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground transition-opacity">
                  {copiedIdx === i ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
          )
        })}
        {loading && !streaming && (
          <div className="ai-msg-in flex justify-start">
            <div className="bg-secondary px-3 py-2 rounded-2xl rounded-bl-md text-sm flex items-center gap-2.5">
              <AiFace size={28} state="thinking" />
              <span className="text-muted-foreground">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 p-4 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask Kryzen AI anything..." rows={1}
            className="flex-1 resize-none px-4 py-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 focus:ring-ring max-h-32" />
          {loading ? (
            <button onClick={stop}
              className="shrink-0 w-10 h-10 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-opacity"
              aria-label="Stop generating">
              <Square className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-opacity"
              aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
