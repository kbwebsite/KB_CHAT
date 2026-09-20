import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../services/api'
import { FirebaseAuth } from '../components/FirebaseAuth'
import {
  Eye, EyeOff, Lock, User, Loader2, ArrowRight, Send,
  ShieldCheck, Zap, MessageCircle, Sparkles, Check, Heart, AlertTriangle,
} from 'lucide-react'

type Particle = { left: string; size: number; duration: string; delay: string; color: string; bottom: string }
type DemoMsg = { id: number; from: 'them' | 'me'; text: string; likes: number; liked: boolean }

const TYPE_WORDS = ['your universe.', 'your people.', 'your crew.', 'your story.']
const CANNED_REPLIES = [
  'That was instant — imagine this with E2EE on ⚡',
  'Delivered before you even blinked ✨',
  'Tap the ❤️ on my bubble — try it!',
  'Now imagine groups, calls, KB AI… all here 🔥',
]
const MARQUEE_PILLS = ['⚡ Real-time', '🔒 E2EE-ready', '👥 Groups', '📞 Calls', '🎨 Themes', '📎 Media', '🔔 Push', '🤖 KB AI', '😀 Reactions', '📌 Polls']

/* Animated stat that counts up on mount */
function Stat({ value, decimals = 0, suffix, label }: { value: number; decimals?: number; suffix: string; label: string }) {
  const [n, setN] = useState(0)
  useEffect(() => {
    let raf = 0
    const t0 = performance.now()
    const dur = 1400
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setN(value * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return (
    <div className="text-center">
      <p className="auth-stat-num text-xl font-extrabold text-white">{n.toFixed(decimals)}{suffix}</p>
      <p className="text-[11px] text-white/60">{label}</p>
    </div>
  )
}

/* Live playground: type + get a reply. 100% local — no account needed. */
function DemoChat({ idPrefix }: { idPrefix: string }) {
  const [msgs, setMsgs] = useState<DemoMsg[]>([
    { id: 1, from: 'them', text: 'Hey! This is a live demo — send me something 👇', likes: 3, liked: false },
  ])
  const [draft, setDraft] = useState('')
  const [typing, setTyping] = useState(false)
  const replyIdx = useRef(0)
  const idRef = useRef(2)
  const scrollRef = useRef<HTMLDivElement>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [msgs, typing])
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const send = () => {
    const text = draft.trim()
    if (!text || typing) return
    setMsgs(m => [...m, { id: idRef.current++, from: 'me', text, likes: 0, liked: false }])
    setDraft('')
    setTyping(true)
    timer.current = setTimeout(() => {
      setTyping(false)
      const reply = CANNED_REPLIES[replyIdx.current++ % CANNED_REPLIES.length]
      setMsgs(m => [...m, { id: idRef.current++, from: 'them', text: reply, likes: 0, liked: false }])
    }, 1100)
  }

  const toggleLike = (id: number) =>
    setMsgs(m => m.map(x => (x.id === id ? { ...x, liked: !x.liked, likes: x.likes + (x.liked ? -1 : 1) } : x)))

  return (
    <div className="rounded-2xl bg-black/30 border border-white/15 backdrop-blur-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/10">
        <span className="auth-pulse-ring w-2.5 h-2.5 rounded-full bg-emerald-400" />
        <p className="text-xs font-bold tracking-widest text-white/80">LIVE DEMO — NO ACCOUNT NEEDED</p>
      </div>
      <div ref={scrollRef} className="auth-demo-scroll px-3.5 py-3 space-y-2.5 max-h-56 overflow-y-auto">
        {msgs.map(m => (
          <div key={m.id} className={`auth-msg-in auth-bubble-hover relative rounded-2xl px-3.5 py-2 max-w-[85%] text-[13px] leading-snug ${m.from === 'me' ? 'ml-auto bg-white text-slate-900 rounded-br-md shadow-lg' : 'bg-white/10 text-white border border-white/10 rounded-bl-md'}`}>
            <p>{m.text}</p>
            <button
              type="button"
              onClick={() => toggleLike(m.id)}
              aria-label={m.liked ? 'Unlike message' : 'Like message'}
              className={`auth-react-bar absolute -bottom-2.5 ${m.from === 'me' ? 'left-2' : 'right-2'} flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold shadow-lg ${m.liked ? 'bg-pink-500 text-white' : 'bg-black/60 text-white/80 border border-white/15'}`}
            >
              <Heart key={`${m.id}-${m.liked}`} className={`w-3 h-3 auth-like-pop ${m.liked ? 'fill-current' : ''}`} />
              {m.likes > 0 && m.likes}
            </button>
          </div>
        ))}
        {typing && (
          <div className="auth-msg-in flex items-center gap-2 bg-white/10 border border-white/10 rounded-2xl rounded-bl-md px-3.5 py-2.5 w-fit">
            <span className="flex gap-1 typing-indicator"><span /><span /><span /></span>
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 px-3 pb-3">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send() }}
          placeholder="Type here, hit Enter…"
          aria-label="Try the live demo chat"
          className="flex-1 min-w-0 bg-white/10 border border-white/15 rounded-full px-4 py-2 text-[13px] text-white placeholder:text-white/40 outline-none focus:border-cyan-300/60 focus:bg-white/15 transition-colors"
        />
        <button
          type="button"
          onClick={send}
          aria-label="Send demo message"
          className="w-9 h-9 shrink-0 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 flex items-center justify-center text-white shadow-lg hover:scale-110 active:scale-90 transition-transform"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
      <span className="hidden">{idPrefix}</span>
    </div>
  )
}

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [caps, setCaps] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [glow, setGlow] = useState({ x: 50, y: 28 })
  const [tilt, setTilt] = useState({ rx: 0, ry: 0, active: false })
  const [mag, setMag] = useState({ x: 0, y: 0 })
  const { login, loading, setToken, setUser } = useAuthStore()
  const nav = useNavigate()

  /* Typewriter headline */
  const [wordIdx, setWordIdx] = useState(0)
  const [chars, setChars] = useState(TYPE_WORDS[0].length)
  const [deleting, setDeleting] = useState(true)
  useEffect(() => {
    const word = TYPE_WORDS[wordIdx % TYPE_WORDS.length]
    let delay = deleting ? 32 : 65
    if (!deleting && chars === word.length) delay = 1700
    if (deleting && chars === 0) delay = 350
    const t = setTimeout(() => {
      if (!deleting && chars === word.length) { setDeleting(true); return }
      if (deleting && chars === 0) {
        setDeleting(false)
        setWordIdx(i => (i + 1) % TYPE_WORDS.length)
        return
      }
      setChars(c => c + (deleting ? -1 : 1))
    }, delay)
    return () => clearTimeout(t)
  }, [chars, deleting, wordIdx])
  const typed = TYPE_WORDS[wordIdx % TYPE_WORDS.length].slice(0, chars)

  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: 26 }, (_, i) => ({
        left: `${(i * 37.7 + 11) % 100}%`,
        bottom: `${(i * 23.3) % 40}%`,
        size: 2 + ((i * 7) % 4),
        duration: `${7 + ((i * 13) % 9)}s`,
        delay: `${(i * 0.7) % 8}s`,
        color: i % 3 === 0 ? '#a78bfa' : i % 3 === 1 ? '#67e8f9' : '#f9a8d4',
      })),
    []
  )

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!identifier || !password) { setError('Please fill all fields'); return }
    try {
      await login(identifier, password)
      nav('/chat')
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Login failed')
    }
  }

  // Exchanges a Firebase ID token for a regular app session.
  // NOTE: must go through the auth store (not raw localStorage) — the
  // Protected/PublicOnly guards read store state, so a direct localStorage
  // write leaves /chat bouncing back to /login until a full page reload.
  const handleFirebaseSession = async (idToken: string) => {
    const res = await authApi.firebase(idToken)
    if (res.success) {
      setToken(res.data.access_token)
      setUser(res.data.user)
      nav('/chat')
    } else {
      throw new Error(res.message || 'Could not start your session.')
    }
  }

  const onTilt = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const px = (e.clientX - r.left) / r.width - 0.5
    const py = (e.clientY - r.top) / r.height - 0.5
    setTilt({ rx: -py * 7, ry: px * 9, active: true })
  }
  const onMag = (e: React.MouseEvent<HTMLButtonElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    setMag({ x: ((e.clientX - r.left) / r.width - 0.5) * 8, y: ((e.clientY - r.top) / r.height - 0.5) * 6 })
  }

  return (
    <div
      className="auth-stage min-h-screen relative overflow-hidden flex flex-col lg:flex-row"
      style={{ ['--mx' as any]: `${glow.x}%`, ['--my' as any]: `${glow.y}%` } as React.CSSProperties}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        setGlow({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 })
      }}
    >
      <div className="auth-grid-overlay" />
      <div className="auth-orb auth-orb-a" />
      <div className="auth-orb auth-orb-b" />
      <div className="auth-orb auth-orb-c" />
      {particles.map((p, i) => (
        <span
          key={i}
          className="auth-particle"
          style={{
            left: p.left, bottom: p.bottom, width: p.size, height: p.size,
            background: p.color, boxShadow: `0 0 10px ${p.color}`,
            animationDuration: p.duration, animationDelay: p.delay,
          }}
        />
      ))}

      {/* ── Left: form ─────────────────────────────── */}
      <div className="flex-1 min-w-0 flex items-center justify-center px-5 sm:px-10 py-10 relative z-10">
        <div className="w-full max-w-md min-w-0">
          <Link to="/" className="auth-form-entrance inline-flex items-center gap-3 group">
            <span className="auth-logo-orb w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-transform group-hover:scale-110 group-hover:rotate-6">
              <MessageCircle className="w-5 h-5" />
            </span>
            <span className="leading-tight">
              <span className="block font-extrabold text-lg tracking-tight landing-hero-title">Kryzen</span>
              <span className="block text-[11px] text-muted-foreground tracking-widest uppercase">Connect • Chat • Share</span>
            </span>
          </Link>

          <div className="auth-form-entrance mt-7">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[11px] font-semibold tracking-wide">
              <Sparkles className="w-3 h-3" /> WELCOME BACK
            </span>
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight leading-[1.05] min-h-[5.2rem]">
              Sign in to<br /><span className="auth-gradient-word">{typed}</span><span className="auth-caret" />
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">Pick up every conversation right where you left it.</p>
          </div>

          <div
            className="auth-tilt-wrap auth-form-entrance mt-6"
            onMouseMove={onTilt}
            onMouseLeave={() => setTilt({ rx: 0, ry: 0, active: false })}
          >
            <div
              className={`auth-card auth-tilt rounded-3xl p-6 sm:p-7 min-w-0 max-w-full overflow-hidden ${tilt.active ? '' : 'auth-tilt-reset'}`}
              style={{ ['--rx' as any]: `${tilt.rx}deg`, ['--ry' as any]: `${tilt.ry}deg` } as React.CSSProperties}
            >
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && (
                  <div key={error} className="auth-error-shake p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm" role="alert">
                    {error}
                  </div>
                )}
                <div>
                  <label className="text-[13px] font-semibold text-muted-foreground">Email or Username</label>
                  <div className="auth-field auth-input mt-1.5 flex items-center gap-2.5 px-4 min-w-0 max-w-full overflow-hidden">
                    <User className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      value={identifier}
                      onChange={e => setIdentifier(e.target.value)}
                      placeholder="you@example.com or username"
                      autoComplete="username"
                      autoFocus
                      className="bg-transparent flex-1 min-w-0 w-full py-3 outline-none text-sm"
                    />
                  </div>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[13px] font-semibold text-muted-foreground">Password</label>
                    <Link to="/forgot-password" className="text-xs text-primary hover:underline font-medium">Forgot?</Link>
                  </div>
                  <div className="auth-field auth-input mt-1.5 flex items-center gap-2.5 px-4 min-w-0 max-w-full overflow-hidden">
                    <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                    <input
                      type={show ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      onKeyUp={e => setCaps(!!(e as any).getModifierState?.('CapsLock'))}
                      onBlur={() => setCaps(false)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                      className="bg-transparent flex-1 min-w-0 w-full py-3 outline-none text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      aria-label={show ? 'Hide password' : 'Show password'}
                      className="p-1 text-muted-foreground hover:text-foreground hover:scale-110 active:scale-90 transition-all"
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {caps && (
                    <p className="auth-msg-in mt-1.5 flex items-center gap-1.5 text-xs text-amber-300">
                      <AlertTriangle className="w-3.5 h-3.5" /> Caps Lock is on
                    </p>
                  )}
                </div>
                <button
                  disabled={loading}
                  onMouseMove={onMag}
                  onMouseLeave={() => setMag({ x: 0, y: 0 })}
                  style={{ transform: `translate(${mag.x}px, ${mag.y}px)` }}
                  className="auth-submit-btn auth-btn-shine auth-magnetic w-full py-3.5 rounded-2xl text-white font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2 group"
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Signing you in...</>
                  ) : (
                    <>Sign In <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1.5" /></>
                  )}
                </button>
              </form>

              <div className="auth-marquee mt-5 -mx-1">
                <div className="auth-marquee-track">
                  {[...MARQUEE_PILLS, ...MARQUEE_PILLS].map((p, i) => (
                    <span key={i} className="shrink-0 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-[11px] text-white/70">{p}</span>
                  ))}
                </div>
              </div>

              <div className="mt-5">
                <div className="relative">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                  <div className="relative flex justify-center text-[11px] uppercase tracking-widest">
                    <span className="px-3 text-muted-foreground" style={{ background: '#0d0d1c' }}>or continue with</span>
                  </div>
                </div>
                <div className="mt-4">
                  <FirebaseAuth onSession={handleFirebaseSession} />
                </div>
              </div>
            </div>
          </div>

          {/* Mobile demo */}
          <div className="lg:hidden mt-5">
            <DemoChat idPrefix="m" />
          </div>

          <p className="auth-form-entrance text-sm text-center text-muted-foreground mt-5">
            New to Kryzen? <Link to="/signup" className="text-primary font-bold hover:underline">Create an account</Link>
          </p>
          <div className="auth-form-entrance mt-4 flex items-center justify-center gap-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1"><ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Encrypted</span>
            <span className="flex items-center gap-1"><Zap className="w-3.5 h-3.5 text-amber-300" /> Instant delivery</span>
            <span className="flex items-center gap-1"><Check className="w-3.5 h-3.5 text-cyan-300" /> No ads</span>
          </div>
        </div>
      </div>

      {/* ── Right: animated showcase (desktop) ─────── */}
      <div className="hidden lg:flex flex-1 items-center justify-center p-10 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-700/80 via-indigo-700/60 to-cyan-600/50" />
        <div className="auth-mesh-bg" />
        <div className="auth-marquee-ring absolute w-[560px] h-[560px] rounded-full opacity-20 blur-sm" />
        <div className="auth-spin-slow absolute w-[440px] h-[440px] rounded-full border border-dashed border-white/20" />

        <div className="relative w-full max-w-md text-white my-auto">
          <div className="auth-showcase-bubble auth-float-slow auth-bubble-hover rounded-3xl p-4 bg-white/10 border border-white/15 backdrop-blur-xl shadow-2xl" style={{ animationDelay: '0.1s' }}>
            <div className="flex gap-2.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 shrink-0 ring-2 ring-white/30" />
              <div>
                <p className="text-sm font-medium">Hey! Are we still on for tomorrow? ✨</p>
                <p className="text-[11px] text-white/60 mt-1">10:42 AM</p>
              </div>
            </div>
          </div>

          <div className="auth-showcase-bubble auth-float-slower auth-bubble-hover rounded-3xl p-4 mt-4 ml-14 bg-white text-slate-900 shadow-2xl" style={{ animationDelay: '0.25s' }}>
            <div className="flex gap-2.5 justify-end">
              <div>
                <p className="text-sm font-medium">Absolutely! Can't wait 🎉</p>
                <p className="text-[11px] text-slate-400 mt-1 text-right">10:43 AM ✓✓</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 shrink-0" />
            </div>
          </div>

          <div className="auth-showcase-bubble mt-4" style={{ animationDelay: '0.4s' }}>
            <DemoChat idPrefix="d" />
          </div>

          <div className="auth-showcase-bubble mt-4 rounded-2xl auth-hero-quote px-6 py-4 flex items-center justify-between" style={{ animationDelay: '0.55s' }}>
            <Stat value={2} suffix="M+" label="msgs daily" />
            <div className="w-px h-9 bg-white/15" />
            <Stat value={99.9} decimals={1} suffix="%" label="uptime" />
            <div className="w-px h-9 bg-white/15" />
            <Stat value={140} suffix="+" label="countries" />
          </div>
        </div>
      </div>
    </div>
  )
}
