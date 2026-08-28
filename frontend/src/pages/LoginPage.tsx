import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../services/api'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

declare global { interface Window { google?: any } }

export default function LoginPage() {
  const [identifier, setIdentifier]=useState('')
  const [password, setPassword]=useState('')
  const [show, setShow]=useState(false)
  const [error, setError]=useState<string|null>(null)
  const [googleLoading, setGoogleLoading]=useState(false)
  const { login, loading } = useAuthStore()
  const nav=useNavigate()
  const googleBtnRef=useRef<HTMLDivElement>(null)

  const handleSubmit=async (e:React.FormEvent)=>{
    e.preventDefault()
    setError(null)
    if (!identifier || !password) { setError('Please fill all fields'); return }
    try {
      await login(identifier, password)
      nav('/chat')
    } catch (err:any) {
      setError(err.response?.data?.detail || err.message || 'Login failed')
    }
  }

  const handleGoogleLogin=async (credential:string)=>{
    setGoogleLoading(true)
    setError(null)
    try {
      const res = await authApi.google(credential)
      if (res.success) {
        localStorage.setItem('kb_token', res.data.access_token)
        localStorage.setItem('kb_user', JSON.stringify(res.data.user))
        nav('/chat')
      } else {
        setError(res.message || 'Google login failed')
      }
    } catch (err:any) {
      setError(err.response?.data?.detail || 'Google login failed')
    }
    setGoogleLoading(false)
  }

  // Initialize Google Identity Services
  useEffect(()=>{
    const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID
    if (!clientId) return
    const script = document.createElement('script')
    script.src = 'https://accounts.google.com/gsi/client'
    script.async = true
    script.onload = ()=>{
      if (window.google?.accounts?.id) {
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: (response:any)=> handleGoogleLogin(response.credential),
        })
        if (googleBtnRef.current) {
          window.google.accounts.id.renderButton(googleBtnRef.current, {
            theme: 'outline', size: 'large', width: '100%', text: 'continue_with',
          })
        }
      }
    }
    document.head.appendChild(script)
    return ()=> { document.head.removeChild(script) }
  }, [])

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 max-w-xl mx-auto">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <img src="/kryzen-logo.svg" alt="Kryzen" className="w-8 h-8 rounded-xl" />
          <span className="font-bold landing-hero-title">Kryzen</span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">Sign in to continue to Kryzen.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>}
          <div>
            <label className="text-sm font-medium">Email or Username</label>
            <input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="you@example.com or username" className="auth-input mt-1 w-full px-4 py-3 outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="relative mt-1">
              <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="auth-input w-full px-4 py-3 pr-10 outline-none text-sm" />
              <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors">{show? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
            </div>
          </div>
          <button disabled={loading} className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <div className="mt-4">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--k-border)]/40"/></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
          </div>
          <div className="mt-4">
            {import.meta.env.VITE_GOOGLE_CLIENT_ID ? (
              <div ref={googleBtnRef} className="w-full flex justify-center"/>
            ) : (
              <button disabled className="auth-google-btn w-full py-3 rounded-xl text-sm text-muted-foreground cursor-not-allowed">
                Google Sign-In (not configured)
              </button>
            )}
            {googleLoading && <p className="text-xs text-center text-muted-foreground mt-2">Signing in with Google...</p>}
          </div>
        </div>

        <p className="text-sm text-center text-muted-foreground mt-4">Don't have an account? <Link to="/signup" className="text-primary font-semibold hover:underline">Create one</Link></p>
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 auth-hero-panel items-center justify-center p-12">
        <div className="relative max-w-md text-white">
          <MessageCircle className="w-12 h-12 mb-4 opacity-90" />
          <h2 className="text-3xl font-bold leading-tight">Every message,<br/>instantly delivered.</h2>
          <p className="mt-3 text-white/80">Join thousands who connect daily on Kryzen. Secure, fast, and beautifully simple.</p>
          <div className="mt-8 p-4 rounded-2xl auth-hero-quote">
            <p className="text-sm text-white/90">"Kryzen feels like the messaging app we always wanted — clean, fast, no clutter."</p>
            <p className="text-xs text-white/60 mt-2">— Early user</p>
          </div>
        </div>
      </div>
    </div>
  )
}
