import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../services/api'
import { FirebaseAuth } from '../components/FirebaseAuth'
import {
  Eye, EyeOff, Lock, User, Loader2, ArrowRight,
  ShieldCheck, Zap, MessageCircle, Sparkles, Check,
} from 'lucide-react'

type Particle = { left: string; size: number; duration: string; delay: string; color: string; bottom: string }

export default function LoginPage() {
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [glow, setGlow] = useState({ x: 50, y: 28 })
  const { login, loading, setToken, setUser } = useAuthStore()
  const nav = useNavigate()

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

  return (
    <div
      className="auth-stage min-h-screen relative overflow-hidden flex"
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
      <div className="flex-1 flex items-center justify-center px-5 sm:px-10 py-10 relative z-10">
        <div className="w-full max-w-md">
          <Link to="/" className="auth-form-entrance inline-flex items-center gap-3 group">
            <span className="auth-logo-orb w-11 h-11 rounded-2xl flex items-center justify-center text-white">
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
            <h1 className="mt-3 text-4xl font-extrabold tracking-tight leading-[1.02]">
              Sign in to<br /><span className="auth-gradient-word">your universe.</span>
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">Pick up every conversation right where you left it.</p>
          </div>

          <div className="auth-card auth-form-entrance mt-6 rounded-3xl p-6 sm:p-7">
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div key={error} className="auth-error-shake p-3 rounded-xl bg-destructive/10 border border-destructive/25 text-destructive text-sm" role="alert">
                  {error}
                </div>
              )}
              <div>
                <label className="text-[13px] font-semibold text-muted-foreground">Email or Username</label>
                <div className="auth-field auth-input mt-1.5 flex items-center gap-2.5 px-4">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    value={identifier}
                    onChange={e => setIdentifier(e.target.value)}
                    placeholder="you@example.com or username"
                    autoComplete="username"
                    className="bg-transparent flex-1 py-3 outline-none text-sm placeholder:text-current/50"
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-[13px] font-semibold text-muted-foreground">Password</label>
                  <Link to="/forgot-password" className="text-xs text-primary hover:underline font-medium">Forgot?</Link>
                </div>
                <div className="auth-field auth-input mt-1.5 flex items-center gap-2.5 px-4">
                  <Lock className="w-4 h-4 text-muted-foreground shrink-0" />
                  <input
                    type={show ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="bg-transparent flex-1 py-3 outline-none text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShow(!show)}
                    aria-label={show ? 'Hide password' : 'Show password'}
                    className="p-1 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                disabled={loading}
                className="auth-submit-btn auth-btn-shine w-full py-3.5 rounded-2xl text-white font-bold text-[15px] disabled:opacity-60 flex items-center justify-center gap-2 group"
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Signing you in...</>
                ) : (
                  <>Sign In <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" /></>
                )}
              </button>
            </form>

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
      <div className="hidden lg:flex flex-1 items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-violet-700/80 via-indigo-700/60 to-cyan-600/50" />
        <div className="auth-mesh-bg" />
        <div className="auth-marquee-ring absolute w-[560px] h-[560px] rounded-full opacity-20 blur-sm" />
        <div className="auth-spin-slow absolute w-[440px] h-[440px] rounded-full border border-dashed border-white/20" />

        <div className="relative w-full max-w-md text-white">
          <div className="auth-showcase-bubble auth-float-slow rounded-3xl p-4 bg-white/10 border border-white/15 backdrop-blur-xl shadow-2xl" style={{ animationDelay: '0.1s' }}>
            <div className="flex gap-2.5">
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500 to-orange-400 shrink-0 ring-2 ring-white/30" />
              <div>
                <p className="text-sm font-medium">Hey! Are we still on for tomorrow? ✨</p>
                <p className="text-[11px] text-white/60 mt-1">10:42 AM</p>
              </div>
            </div>
          </div>

          <div className="auth-showcase-bubble auth-float-slower rounded-3xl p-4 mt-4 ml-14 bg-white text-slate-900 shadow-2xl" style={{ animationDelay: '0.25s' }}>
            <div className="flex gap-2.5 justify-end">
              <div>
                <p className="text-sm font-medium">Absolutely! Can't wait 🎉</p>
                <p className="text-[11px] text-slate-400 mt-1 text-right">10:43 AM ✓✓</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-cyan-400 shrink-0" />
            </div>
          </div>

          <div className="auth-showcase-bubble auth-float-slow rounded-3xl px-4 py-3 mt-4 mr-16 bg-black/30 border border-white/15 backdrop-blur-xl flex items-center gap-3" style={{ animationDelay: '0.4s' }}>
            <div className="flex gap-1 typing-indicator"><span /><span /><span /></div>
            <p className="text-xs text-white/70 italic">Maya is typing a surprise...</p>
            <span className="ml-auto relative flex h-2.5 w-2.5">
              <span className="auth-pulse-dot absolute inline-flex h-full w-full rounded-full bg-emerald-400" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-400" />
            </span>
          </div>

          <div className="auth-showcase-bubble mt-8 rounded-2xl auth-hero-quote p-4 flex items-center gap-4" style={{ animationDelay: '0.55s' }}>
            <div className="flex -space-x-2.5">
              {['from-pink-500 to-orange-400', 'from-emerald-500 to-teal-500', 'from-violet-500 to-cyan-400'].map((g, i) => (
                <div key={i} className={`w-9 h-9 rounded-full bg-gradient-to-br ${g} ring-2 ring-white/40`} />
              ))}
            </div>
            <div>
              <p className="text-sm font-semibold">2M+ messages fly daily</p>
              <p className="text-xs text-white/60">Secure • Fast • Beautifully simple</p>
            </div>
            <MessageCircle className="w-6 h-6 ml-auto text-white/50" />
          </div>
        </div>
      </div>
    </div>
  )
}
