import { useState, useRef, useEffect } from 'react'
import { Bot, Send, Sparkles, Code, FileText, Languages, Trash2, Copy, Check, Upload } from 'lucide-react'
import { aiApi } from '../services/api'
import { useAuthStore } from '../store/auth'

interface Message { role: 'user' | 'assistant'; content: string; timestamp: Date }

export default function KBAIPage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [action, setAction] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [codeLang, setCodeLang] = useState('javascript')
  const [actionResult, setActionResult] = useState('')
  const [copied, setCopied] = useState(false)
  const [fileLoading, setFileLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const user = useAuthStore(s=> s.user)

  useEffect(()=>{ scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight) }, [messages])

  const send = async () => {
    if (!input.trim() || loading) return
    const msg: Message = { role: 'user', content: input.trim(), timestamp: new Date() }
    setMessages(prev=> [...prev, msg])
    setInput('')
    setLoading(true)
    try {
      const history = messages.map(m=> ({ role: m.role, content: m.content }))
      const res = await aiApi.chat(msg.content, history)
      setMessages(prev=> [...prev, { role: 'assistant', content: res.data.reply, timestamp: new Date() }])
    } catch { setMessages(prev=> [...prev, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.', timestamp: new Date() }]) }
    setLoading(false)
    inputRef.current?.focus()
  }

  const runCodeAction = async (act: string) => {
    if (!codeInput.trim()) return
    setAction(act)
    setActionResult('')
    try {
      const res = await aiApi.action(codeInput, codeLang, act)
      setActionResult(res.data.result)
    } catch { setActionResult('Error performing action.') }
  }

  const copyResult = () => {
    navigator.clipboard.writeText(actionResult)
    setCopied(true)
    setTimeout(()=> setCopied(false), 2000)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileLoading(true)
    const msg: Message = { role: 'user', content: `📄 Uploaded: ${file.name} (${(file.size/1024).toFixed(1)}KB)`, timestamp: new Date() }
    setMessages(prev=> [...prev, msg])
    try {
      const res = await aiApi.analyzeFile(file, 'Analyze this file and explain what it does. Point out any issues or improvements.')
      setMessages(prev=> [...prev, { role: 'assistant', content: res.data.analysis, timestamp: new Date() }])
    } catch { setMessages(prev=> [...prev, { role: 'assistant', content: 'Failed to analyze file.', timestamp: new Date() }]) }
    setFileLoading(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const quickActions = [
    { icon: <Sparkles className="w-4 h-4"/>, label: 'Explain', action: 'explain' },
    { icon: <Code className="w-4 h-4"/>, label: 'Fix', action: 'fix' },
    { icon: <FileText className="w-4 h-4"/>, label: 'Improve', action: 'improve' },
    { icon: <Languages className="w-4 h-4"/>, label: 'Translate', action: 'convert' },
  ]

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Chat Panel */}
      <div className="flex-1 flex flex-col min-h-0 border-r border-border">
        <div className="shrink-0 p-4 border-b border-border flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center">
            <Bot className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-semibold">KB AI Assistant</h1>
            <p className="text-xs text-muted-foreground">Ask anything about your project</p>
          </div>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500/20 to-indigo-600/20 flex items-center justify-center">
                <Bot className="w-8 h-8 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-medium">How can I help?</p>
                <p className="text-xs text-muted-foreground mt-1">Ask about code, fix bugs, add features, or explain concepts</p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center max-w-md">
                {['Explain my codebase', 'Fix recent errors', 'Add dark mode', 'Summarize conversation'].map(q=> (
                  <button key={q} onClick={()=>{ setInput(q); inputRef.current?.focus() }}
                    className="px-3 py-1.5 rounded-full bg-secondary text-xs hover:bg-secondary/80 transition-colors">{q}</button>
                ))}
              </div>
              <button onClick={()=> fileRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-sm hover:bg-secondary/80 transition-colors">
                <Upload className="w-4 h-4"/> Upload file for analysis
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={handleFileUpload}
                accept=".txt,.md,.py,.js,.ts,.jsx,.tsx,.css,.html,.json,.csv,.xml,.yaml,.yml,.toml,.ini,.sql,.sh,.rb,.go,.rs,.java,.c,.cpp,.h,.hpp,.cs,.swift,.kt,.pdf,.png,.jpg,.jpeg,.gif,.webp,.svg" />
            </div>
          )}
          {messages.map((m,i)=> (
            <div key={i} className={`flex ${m.role==='user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm whitespace-pre-wrap ${m.role==='user' ? 'bg-primary text-primary-foreground rounded-br-md' : 'bg-secondary rounded-bl-md'}`}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start"><div className="bg-secondary px-4 py-3 rounded-2xl rounded-bl-md text-sm">
              <div className="flex gap-1"><span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:0ms]"/><span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:150ms]"/><span className="w-2 h-2 bg-muted-foreground/40 rounded-full animate-bounce [animation-delay:300ms]"/></div>
            </div></div>
          )}
        </div>

        <div className="shrink-0 p-4 pb-[max(16px,env(safe-area-inset-bottom))] border-t border-border">
          <div className="flex gap-2 items-end">
            <textarea ref={inputRef} value={input} onChange={e=> setInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter' && !e.shiftKey){ e.preventDefault(); send() } }}
              placeholder="Ask KB AI..." rows={1}
              className="flex-1 resize-none px-4 py-3 rounded-xl bg-secondary text-sm outline-none focus:ring-2 focus:ring-ring max-h-32" />
            <button onClick={send} disabled={loading || !input.trim()}
              className="shrink-0 w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 disabled:opacity-40 transition-opacity">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Code Actions Panel */}
      <div className="w-full lg:w-96 flex flex-col min-h-0 border-t lg:border-t-0 border-border bg-card">
        <div className="shrink-0 p-4 border-b border-border">
          <h2 className="text-sm font-semibold flex items-center gap-2"><Code className="w-4 h-4"/> Code Actions</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Language</label>
            <select value={codeLang} onChange={e=> setCodeLang(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-secondary text-sm outline-none">
              <option value="javascript">JavaScript</option>
              <option value="typescript">TypeScript</option>
              <option value="python">Python</option>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="json">JSON</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Paste code</label>
            <textarea value={codeInput} onChange={e=> setCodeInput(e.target.value)}
              placeholder="Paste code here..." rows={6}
              className="w-full px-3 py-2 rounded-lg bg-secondary text-xs font-mono outline-none focus:ring-2 focus:ring-ring resize-none" />
          </div>
          <div className="flex flex-wrap gap-2">
            {quickActions.map(a=> (
              <button key={a.action} onClick={()=> runCodeAction(a.action)} disabled={!codeInput.trim()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary text-xs hover:bg-secondary/80 disabled:opacity-40 transition-opacity">
                {a.icon} {a.label}
              </button>
            ))}
          </div>
          {actionResult && (
            <div className="relative">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-muted-foreground">Result ({action})</span>
                <button onClick={copyResult} className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  {copied ? <Check className="w-3 h-3"/> : <Copy className="w-3 h-3"/>} {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre className="p-3 rounded-lg bg-background text-xs font-mono overflow-x-auto whitespace-pre-wrap border border-border">{actionResult}</pre>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
