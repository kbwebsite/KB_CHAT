import { useState, useRef, useEffect, lazy, Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { Send, Sparkles, Trash2, Copy, Check, Square, Image as ImageIcon, Download, Paperclip, X, Search, MessageCircle } from 'lucide-react'
import { aiApi, agentApi } from '../services/api'
import { useAuthStore } from '../store/auth'

// Split the markdown renderer out of the route chunk; plain text shows first.
const AiMarkdown = lazy(() => import('../components/AiMarkdown'))
import { AiFace } from '../components/AiFace'

interface SmartHit { id: number; content: string; sender: string; conversation: string; conversation_id: number; created_at: string | null }
interface Message { role: 'user' | 'assistant'; content: string; timestamp: Date; imageUrl?: string; fileName?: string; hits?: SmartHit[] }

const HISTORY_CAP = 50

function loadHistory(userId: string | number | undefined): Message[] {
  if (userId == null) return []
  try {
    const raw = localStorage.getItem(`kb_ai_history_${userId}`)
    if (!raw) return []
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter((m: any) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .slice(-HISTORY_CAP)
      .map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ? new Date(m.timestamp) : new Date(),
        ...(typeof m.imageUrl === 'string' ? { imageUrl: m.imageUrl } : {}),
        ...(typeof m.fileName === 'string' ? { fileName: m.fileName } : {}),
        ...(Array.isArray(m.hits) ? { hits: m.hits.filter((h: any) => h && typeof h.conversation_id === 'number') } : {}),
      }))
  } catch {
    return []
  }
}

/** Generated image with load-failure fallback (free backend can 500 when busy). */
function GeneratedImage({ url, prompt }: { url: string; prompt: string }) {
  const [failed, setFailed] = useState(false)
  const [retry, setRetry] = useState(0)
  if (failed) {
    return (
      <div className="space-y-2 min-w-52">
        <p className="text-xs text-muted-foreground">The image didn&apos;t load — the image service may be busy.</p>
        <div className="flex gap-3">
          <button
            onClick={() => { setFailed(false); setRetry((r) => r + 1) }}
            className="text-xs font-medium text-primary hover:underline"
          >
            Retry
          </button>
          <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <Download className="w-3.5 h-3.5" /> Open full size
          </a>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2">{prompt}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      <a href={url} target="_blank" rel="noreferrer">
        <img
          key={retry}
          src={retry ? `${url}&retry=${retry}` : url}
          alt={prompt}
          loading="lazy"
          onError={() => setFailed(true)}
          className="rounded-xl max-w-full max-h-80 object-cover"
        />
      </a>
      <p className="text-xs text-muted-foreground line-clamp-2">{prompt}</p>
      <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
        <Download className="w-3.5 h-3.5" /> Open full size
      </a>
    </div>
  )
}

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
  const user = useAuthStore(s => s.user)
  const nav = useNavigate()
  const [messages, setMessages] = useState<Message[]>(() => loadHistory(user?.id))
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)
  const [aiStatus, setAiStatus] = useState<{ live: boolean; provider?: string; model?: string } | null>(null)
  const [imageMode, setImageMode] = useState(false)
  const [searchMode, setSearchMode] = useState(false)
  const [imgLoading, setImgLoading] = useState(false)
  const [anaLoading, setAnaLoading] = useState(false)
  const [searchLoading, setSearchLoading] = useState(false)
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const attachRef = useRef<HTMLInputElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  // Shared assistant thread (PE-2K unification): the same server-side agent
  // conversation the in-chat Agent panel uses, keyed by one localStorage id.
  const [agentConvId, setAgentConvId] = useState<number | null>(() => {
    try {
      const raw = localStorage.getItem('kb_agent_conv_id')
      const n = raw ? parseInt(raw, 10) : NaN
      return Number.isFinite(n) ? n : null
    } catch {
      return null
    }
  })
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages])
  useEffect(() => () => {
    abortRef.current?.abort()
    searchAbortRef.current?.abort()
  }, [])

  // Memory: persist the conversation per user so refreshes keep context.
  useEffect(() => {
    if (user?.id == null) return
    try {
      localStorage.setItem(`kb_ai_history_${user.id}`, JSON.stringify(messages.slice(-HISTORY_CAP)))
    } catch {}
  }, [messages, user?.id])

  const persistAgentConv = (id: number | null | undefined) => {
    if (id == null) return
    setAgentConvId(id)
    try {
      localStorage.setItem('kb_agent_conv_id', String(id))
    } catch {}
  }

  // Shared thread restore: server history wins when a shared conversation
  // exists; otherwise the legacy local history stands (first run).
  useEffect(() => {
    if (agentConvId == null) return
    let cancelled = false
    agentApi.history(agentConvId).then((res: any) => {
      if (cancelled || !res?.success) return
      const rows = res.data?.messages || []
      if (rows.length === 0) return
      setMessages(rows
        .filter((r: any) => r && (r.role === 'user' || r.role === 'assistant') && typeof r.content === 'string')
        .map((r: any) => ({
          role: r.role as 'user' | 'assistant',
          content: r.content,
          timestamp: r.created_at ? new Date(r.created_at) : new Date(),
        })))
    }).catch(() => {
      // Conversation was deleted elsewhere — drop the stale key.
      if (!cancelled) {
        try { localStorage.removeItem('kb_agent_conv_id') } catch {}
        setAgentConvId(null)
      }
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentConvId])

  useEffect(() => {
    aiApi.status()
      .then((r: any) => {
        if (r?.success) setAiStatus({ live: !!r.data?.live, provider: r.data?.provider, model: r.data?.model })
      })
      .catch(() => {})
  }, [])

  const stop = () => abortRef.current?.abort()

  const sendImage = async () => {
    if (!input.trim() || imgLoading || loading) return
    const prompt = input.trim()
    setMessages(prev => [...prev, { role: 'user', content: prompt, timestamp: new Date() }])
    setInput('')
    setImgLoading(true)
    const slot = { i: -1 }
    setMessages(prev => {
      const next = [...prev, { role: 'assistant' as const, content: prompt, timestamp: new Date(), imageUrl: 'pending' }]
      slot.i = next.length - 1
      return next
    })
    try {
      const r: any = await aiApi.generateImage(prompt)
      const url = r?.data?.image_url ?? r?.image_url
      if (!url) throw new Error('no image url')
      setMessages(prev => {
        const next = [...prev]
        if (next[slot.i] && next[slot.i].role === 'assistant') {
          next[slot.i] = { ...next[slot.i], imageUrl: url }
        }
        return next
      })
    } catch {
      setMessages(prev => {
        const next = [...prev]
        if (next[slot.i] && next[slot.i].role === 'assistant') {
          const { imageUrl: _drop, ...rest } = next[slot.i]
          next[slot.i] = { ...rest, content: 'Could not generate that image — the image service may be busy. Try again in a moment.' }
        }
        return next
      })
    }
    setImgLoading(false)
    inputRef.current?.focus()
  }

  const send = async () => {
    if (!input.trim() || loading) return
    const msg: Message = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev => [...prev, msg])
    setInput('')
    abortRef.current = new AbortController()
    const signal = abortRef.current.signal
    setLoading(true)
    const pushReply = (text: string) => {
      setMessages(prev => [...prev, { role: 'assistant' as const, content: text, timestamp: new Date() }])
    }
    try {
      const full = await agentApi.chatStream(msg.content, agentConvId, {
        onConversation: (id, provider) => {
          persistAgentConv(id)
          if (provider) {
            setAiStatus(s => ({ live: provider.toLowerCase() !== 'mock', provider, model: s?.model }))
          }
        },
        onFinal: pushReply,
      }, signal)
      if (!full.trim()) {
        pushReply('Sorry, something went wrong. Please try again.')
      }
    } catch {
      if (!signal.aborted) {
        // Stream failed: fall back to the non-streaming turn.
        try {
          const res: any = await agentApi.chat(msg.content, agentConvId)
          persistAgentConv(res.data?.conversation_id)
          if (res.data?.provider) {
            setAiStatus(s => ({ live: String(res.data.provider).toLowerCase() !== 'mock', provider: res.data.provider, model: s?.model }))
          }
          pushReply(res.data.response)
        } catch {
          pushReply('Sorry, something went wrong. Please try again.')
        }
      }
    }
    abortRef.current = null
    setLoading(false)
    inputRef.current?.focus()
  }

  const sendSearch = async () => {
    const query = input.trim()
    if (!query || searchLoading || loading) return
    searchAbortRef.current?.abort()
    const ctrl = new AbortController()
    searchAbortRef.current = ctrl
    setMessages(prev => [...prev, { role: 'user', content: query, timestamp: new Date() }])
    setInput('')
    setSearchLoading(true)
    try {
      // smartSearch is membership-scoped server-side: only chats you belong to.
      const r: any = await aiApi.smartSearch(query, ctrl.signal)
      if (ctrl.signal.aborted) return
      const summary = String(r?.data?.summary ?? r?.summary ?? '').trim()
      const hits: SmartHit[] = Array.isArray(r?.data?.results ?? r?.results)
        ? (r.data?.results ?? r.results).filter((h: any) => h && typeof h.conversation_id === 'number')
        : []
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: summary || (hits.length ? `Found ${hits.length} match${hits.length === 1 ? '' : 'es'}.` : 'No matching messages found.'),
        timestamp: new Date(),
        hits,
      }])
    } catch (e: any) {
      if (ctrl.signal.aborted || e?.code === 'ERR_CANCELED' || e?.name === 'CanceledError') return
      setMessages(prev => [...prev, { role: 'assistant', content: 'Search failed — try again in a moment.', timestamp: new Date() }])
    }
    if (searchAbortRef.current === ctrl) searchAbortRef.current = null
    setSearchLoading(false)
    inputRef.current?.focus()
  }

  const copyMessage = (content: string, idx: number) => {
    navigator.clipboard.writeText(content)
    setCopiedIdx(idx)
    setTimeout(() => setCopiedIdx(null), 2000)
  }

  const clearChat = () => {
    setMessages([])
    setAttachFile(null)
    // One shared thread: clearing here resets it everywhere.
    setAgentConvId(null)
    if (user?.id != null) {
      try {
        localStorage.removeItem(`kb_ai_history_${user.id}`)
        localStorage.removeItem('kb_agent_conv_id')
      } catch {}
    }
  }

  const sendFile = async () => {
    const file = attachFile
    if (!file || anaLoading || loading) return
    const isAudio = file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|webm|opus)$/i.test(file.name)
    const question = input.trim()
    setMessages(prev => [...prev, {
      role: 'user',
      content: question || (isAudio ? `Transcribe ${file.name}` : `Analyze ${file.name}`),
      timestamp: new Date(),
      fileName: file.name,
    }])
    setInput('')
    setAttachFile(null)
    setAnaLoading(true)
    const slot = { i: -1 }
    setMessages(prev => {
      const next = [...prev, { role: 'assistant' as const, content: '', timestamp: new Date(), fileName: file.name }]
      slot.i = next.length - 1
      return next
    })
    try {
      // Audio files go to the transcription endpoint, everything else to analysis.
      const r: any = isAudio
        ? await aiApi.transcribe(file)
        : await aiApi.analyzeFile(file, question || undefined)
      const analysis = String(r?.data?.transcription ?? r?.transcription ?? r?.data?.analysis ?? r?.analysis ?? '').trim()
      if (!analysis) throw new Error(isAudio ? 'empty transcription' : 'empty analysis')
      setMessages(prev => {
        const next = [...prev]
        if (next[slot.i] && next[slot.i].role === 'assistant') {
          next[slot.i] = { ...next[slot.i], content: analysis }
        }
        return next
      })
    } catch {
      setMessages(prev => {
        const next = [...prev]
        if (next[slot.i] && next[slot.i].role === 'assistant') {
          next[slot.i] = { ...next[slot.i], content: isAudio ? 'Could not transcribe that audio — try again in a moment.' : 'Could not analyze that file — try again in a moment.' }
        }
        return next
      })
    }
    setAnaLoading(false)
    inputRef.current?.focus()
  }

  return (
    <div className="flex flex-col h-full relative overflow-hidden" style={{ background: 'linear-gradient(180deg, #0a0a1a 0%, var(--bg-primary) 40%)' }}>
      {/* Ambient 3D orbs */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden>
        <div className="absolute w-72 h-72 rounded-full" style={{ background: 'radial-gradient(circle, rgba(var(--accent-rgb), 0.22), transparent 70%)', top: '-90px', right: '-70px', filter: 'blur(50px)', animation: 'ambientDrift 14s ease-in-out infinite' }} />
        <div className="absolute w-60 h-60 rounded-full" style={{ background: 'radial-gradient(circle, rgba(var(--cyan-rgb), 0.14), transparent 70%)', top: '32%', left: '-90px', filter: 'blur(50px)', animation: 'ambientDrift 18s ease-in-out infinite reverse' }} />
        <div className="absolute w-52 h-52 rounded-full" style={{ background: 'radial-gradient(circle, rgba(var(--pink-rgb), 0.12), transparent 70%)', bottom: '8%', right: '12%', filter: 'blur(50px)', animation: 'ambientDrift 12s ease-in-out infinite' }} />
      </div>
      {/* Header */}
      <div className="shrink-0 relative p-4 border-b border-white/10 flex items-center justify-between" style={{ background: 'rgba(10,10,26,0.72)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)' }}>
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="absolute -inset-1.5 rounded-2xl kryzen-accent-gradient opacity-60 blur-md" aria-hidden />
            <AiFace size={42} state={loading || imgLoading || anaLoading || searchLoading ? 'thinking' : 'idle'} label="Kryzen AI" />
          </div>
          <div>
            <h1 className="text-base font-extrabold tracking-tight gradient-text">Kryzen AI</h1>
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              {loading ? 'Thinking…' : imgLoading ? 'Dreaming up your image…' : anaLoading ? 'Reading your file…' : searchLoading ? 'Searching your chats…' : 'Your personal assistant'}
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
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 relative">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-28 h-28 rounded-full border border-white/10" aria-hidden />
              <div className="absolute w-36 h-36 rounded-full border border-white/5" aria-hidden />
              <div className="absolute w-24 h-24 rounded-full kryzen-accent-gradient opacity-30 blur-xl" aria-hidden />
              <AiFace size={72} state="idle" />
            </div>
            <div>
              <p className="text-lg font-extrabold tracking-tight">Hi <span className="gradient-text">{user?.display_name || 'there'}</span>! 👋</p>
              <p className="text-xs text-muted-foreground mt-1">How can I help you today?</p>
            </div>
            <div className="flex flex-wrap gap-2 justify-center max-w-md">
              {quickQuestions.map(q => (
                <button key={q} onClick={() => { setInput(q); inputRef.current?.focus() }}
                  className="gradient-border px-3.5 py-1.5 rounded-full bg-white/[0.05] backdrop-blur text-xs font-medium hover:bg-white/[0.1] hover:-translate-y-0.5 transition-all">
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => {
          return (
          <div key={i} className={`ai-msg-in flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[80%] min-w-0 group relative px-4 py-3 rounded-2xl text-sm ${
                m.role === 'user'
                  ? 'text-white rounded-br-md whitespace-pre-wrap kryzen-accent-gradient-3'
                  : 'rounded-bl-md border border-white/10'
              }`}
              style={m.role === 'user'
                ? { boxShadow: '0 6px 24px rgba(var(--accent-rgb), 0.35), inset 0 1px 0 rgba(255,255,255,0.25)' }
                : { background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)', boxShadow: '0 4px 20px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)' }
              }
            >
              {m.imageUrl ? (
                m.imageUrl === 'pending' ? (
                  <div className="ai-shimmer w-60 h-60 rounded-xl flex flex-col items-center justify-center gap-2 border border-white/10">
                    <AiFace size={44} state="working" />
                    <span className="text-xs text-muted-foreground">Dreaming…</span>
                  </div>
                ) : (
                  <GeneratedImage url={m.imageUrl} prompt={m.content} />
                )
              ) : m.role === 'user' ? (
                <>
                  {m.fileName && (
                    <span className="mb-1.5 flex items-center gap-1.5 text-xs opacity-90">
                      <Paperclip className="w-3 h-3" />
                      <span className="truncate max-w-52">{m.fileName}</span>
                    </span>
                  )}
                  <span>{m.content}</span>
                </>
              ) : (
                <Suspense fallback={<span className="whitespace-pre-wrap break-words">{m.content}</span>}>
                  <AiMarkdown text={m.content} />
                </Suspense>
              )}
              {m.role === 'assistant' && m.hits && m.hits.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  {m.hits.map(h => (
                    <button
                      key={h.id}
                      onClick={() => nav(`/chat?conv=${h.conversation_id}`)}
                      aria-label={`Open chat ${h.conversation} with message from ${h.sender}`}
                      className="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl bg-white/[0.04] border border-white/10 hover:bg-white/[0.09] transition-colors text-left min-h-[44px]"
                    >
                      <MessageCircle className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden />
                      <span className="flex-1 min-w-0">
                        <span className="block text-xs font-semibold truncate">{h.sender} <span className="font-normal text-muted-foreground">in {h.conversation}</span></span>
                        <span className="block text-xs text-muted-foreground truncate">{h.content}</span>
                      </span>
                    </button>
                  ))}
                </div>
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
        {loading && (
          <div className="ai-msg-in flex justify-start">
            <div className="px-3 py-2 rounded-2xl rounded-bl-md text-sm flex items-center gap-2.5 border border-white/10" style={{ background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(12px)' }}>
              <AiFace size={28} state="thinking" />
              <span className="gradient-text font-semibold">Thinking…</span>
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 relative p-4 pb-[max(16px,env(safe-area-inset-bottom))]">
        {attachFile && (
          <div className="ai-msg-in mb-2 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs">
            <Paperclip className="w-3.5 h-3.5 text-primary" />
            <span className="truncate max-w-48">{attachFile.name}</span>
            <span className="text-muted-foreground">· {(attachFile.size / 1024).toFixed(0)} KB</span>
            <button onClick={() => setAttachFile(null)} className="p-0.5 rounded-full hover:bg-white/10" aria-label="Remove attachment">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
        <div
          className="flex gap-2 items-end rounded-2xl border border-white/10 px-2 py-2 transition-shadow focus-within:border-primary/50"
          style={{ background: 'rgba(12,12,28,0.78)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', boxShadow: '0 8px 32px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.06)' }}
        >
          <input
            ref={attachRef}
            type="file"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0]
              if (f) {
                if (f.size > 5 * 1024 * 1024) {
                  setMessages(prev => [...prev, { role: 'assistant', content: 'That file is over 5 MB — attach something smaller.', timestamp: new Date() }])
                } else {
                  setAttachFile(f)
                  setImageMode(false)
                  setSearchMode(false)
                }
              }
              e.target.value = ''
            }}
          />
          <button
            onClick={() => attachRef.current?.click()}
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              attachFile ? 'kryzen-accent-gradient-3 text-white shadow-lg' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
            aria-label="Attach a file for analysis"
            title="Attach a text file, code, or PDF for AI analysis"
          >
            <Paperclip className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setImageMode(v => !v); setSearchMode(false) }}
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              imageMode ? 'kryzen-accent-gradient-3 text-white shadow-lg' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
            style={imageMode ? { boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.5)' } : undefined}
            aria-label="Toggle image generation"
            title={imageMode ? 'Image mode on — describe a picture' : 'Generate an image instead of chatting'}
          >
            <ImageIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setSearchMode(v => !v); setImageMode(false); setAttachFile(null) }}
            className={`shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
              searchMode ? 'kryzen-accent-gradient-3 text-white shadow-lg' : 'text-muted-foreground hover:text-foreground hover:bg-white/5'
            }`}
            style={searchMode ? { boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.5)' } : undefined}
            aria-label="Toggle chat search"
            title={searchMode ? 'Search mode on — find messages in your chats' : 'Search your chats instead of chatting'}
          >
            <Search className="w-4 h-4" />
          </button>
          <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); searchMode ? sendSearch() : imageMode ? sendImage() : attachFile ? sendFile() : send() } }}
            placeholder={searchMode ? 'Search your chats…' : imageMode ? 'Describe the image…' : 'Ask Kryzen AI anything...'} rows={1}
            className="flex-1 resize-none px-2 py-2.5 bg-transparent text-sm outline-none max-h-32 placeholder:text-muted-foreground/60" />
          {attachFile ? (
            <button onClick={sendFile} disabled={anaLoading || loading}
              className="shrink-0 w-10 h-10 rounded-xl kryzen-accent-gradient-3 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all"
              style={{ boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.5)' }}
              aria-label="Analyze file">
              <Send className="w-4 h-4" />
            </button>
          ) : imageMode ? (
            <button onClick={sendImage} disabled={!input.trim() || imgLoading}
              className="shrink-0 w-10 h-10 rounded-xl kryzen-accent-gradient-3 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all"
              style={{ boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.5)' }}
              aria-label="Generate image">
              <ImageIcon className="w-4 h-4" />
            </button>
          ) : loading ? (
            <button onClick={stop}
              className="shrink-0 w-10 h-10 rounded-xl bg-destructive text-destructive-foreground flex items-center justify-center hover:bg-destructive/90 transition-opacity"
              aria-label="Stop generating">
              <Square className="w-4 h-4" />
            </button>
          ) : searchMode ? (
            <button onClick={sendSearch} disabled={!input.trim() || searchLoading}
              className="shrink-0 w-10 h-10 rounded-xl kryzen-accent-gradient-3 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all"
              style={{ boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.5)' }}
              aria-label="Search chats">
              <Search className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={send} disabled={!input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl kryzen-accent-gradient-3 text-white flex items-center justify-center hover:opacity-90 disabled:opacity-40 transition-all"
              style={{ boxShadow: '0 4px 16px rgba(var(--accent-rgb), 0.5)' }}
              aria-label="Send">
              <Send className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
