import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Sparkles, Trash2, Copy, Check } from 'lucide-react'
import { aiApi } from '../services/api'
import { useAuthStore } from '../store/auth'

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
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const user = useAuthStore(s => s.user)

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const msg: Message = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, msg])
    setInput('')
    setLoading(true)
    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }))
      const res = await aiApi.chat(msg.content, history)
      setMessages(prev => [...prev, { role: 'assistant', content: res.data.reply, timestamp: new Date() }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() }])
    }
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
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold">Kryzen AI</h1>
            <p className="text-xs text-muted-foreground">Your personal assistant</p>
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
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center shadow-lg shadow-violet-500/10">
              <Bot className="w-8 h-8 text-violet-500" />
            </div>
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
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] group relative px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${m.role === 'user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary rounded-bl-md'}`}>
              {m.content}
              {m.role === 'assistant' && (
                <button onClick={() => copyMessage(m.content, i)}
                  className="absolute -right-8 top-1 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-secondary text-muted-foreground transition-opacity">
                  {copiedIdx === i ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
                </button>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-secondary px-4 py-3 rounded-2xl rounded-bl-md text-sm">
              <div className="flex gap-1">
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
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
          <button onClick={send} disabled={loading || !input.trim()}
            className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-opacity">
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  )
}
