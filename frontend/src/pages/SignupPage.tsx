import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../services/api'
import { Eye, EyeOff } from 'lucide-react'

declare global { interface Window { google?: any } }

export default function SignupPage() {
  const [form, setForm]=useState({ display_name:'', username:'', email:'', password:'', confirm_password:'' })
  const [error, setError]=useState<string|null>(null)
  const [show, setShow]=useState(false)
  const [googleLoading, setGoogleLoading]=useState(false)
  const { signup, loading } = useAuthStore()
  const nav=useNavigate()
  const googleBtnRef=useRef<HTMLDivElement>(null)

  const handle=async (e:React.FormEvent)=>{
    e.preventDefault()
    setError(null)
    if (!form.display_name || !form.username || !form.email || !form.password) { setError('Fill all fields'); return }
    if (form.password !== form.confirm_password) { setError('Passwords do not match'); return }
    if (form.password.length<6) { setError('Password must be at least 6 chars'); return }
    try {
      await signup(form)
      nav('/chat')
    } catch (err:any) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) setError(detail.map((d:any)=> d.msg).join(', '))
      else setError(detail || err.response?.data?.message || err.message || 'Signup failed')
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
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 max-w-xl mx-auto py-8 relative z-10">
        <Link to="/" className="flex items-center gap-2 mb-6 auth-form-entrance">
          <img src="/kryzen-logo.svg" alt="Kryzen" className="w-8 h-8 rounded-xl" />
          <span className="font-bold landing-hero-title">Kryzen</span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight auth-form-entrance">Create account</h1>
        <p className="text-muted-foreground mt-1 auth-form-entrance">Join Kryzen in seconds.</p>

        <form onSubmit={handle} className="mt-6 space-y-3.5 auth-form-entrance">
          {error && <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">{error}</div>}
          <div>
            <label className="text-sm font-medium">Display Name</label>
            <input value={form.display_name} onChange={e=>setForm({...form, display_name:e.target.value})} placeholder="Alex Morgan" className="auth-input mt-1 w-full px-4 py-3 outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Username</label>
            <input value={form.username} onChange={e=>setForm({...form, username:e.target.value})} placeholder="alex_morgan" className="auth-input mt-1 w-full px-4 py-3 outline-none text-sm" />
            <p className="text-[11px] text-muted-foreground mt-1">Letters, numbers, _ and - only. 3+ chars.</p>
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="alex@example.com" className="auth-input mt-1 w-full px-4 py-3 outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="relative mt-1">
              <input type={show?'text':'password'} value={form.password} onChange={e=>setForm({...form, password:e.target.value})} placeholder="••••••••" className="auth-input w-full px-4 py-3 pr-10 outline-none text-sm" />
              <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors">{show? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Confirm Password</label>
            <input type={show?'text':'password'} value={form.confirm_password} onChange={e=>setForm({...form, confirm_password:e.target.value})} placeholder="••••••••" className="auth-input w-full mt-1 px-4 py-3 outline-none text-sm" />
          </div>
          <button disabled={loading} className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 mt-2">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-4 auth-form-entrance">
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

        <p className="text-sm text-center text-muted-foreground mt-4 auth-form-entrance">Already have an account? <Link to="/login" className="text-primary font-semibold hover:underline">Sign in</Link></p>
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 auth-hero-panel items-center justify-center p-12 relative overflow-hidden">
        <div className="auth-mesh-bg" />
        <div className="relative max-w-md text-white hero-entrance-delay">
          <h2 className="text-3xl font-bold leading-tight">Connect with everyone<br/>you care about.</h2>
          <p className="mt-3 text-white/80">Private conversations, vibrant groups, and seamless sharing — all in one beautiful app.</p>
          <ul className="mt-6 space-y-2 text-sm text-white/90">
            <li>✓ End-to-end ready architecture</li>
            <li>✓ Message edits, deletes & reactions</li>
            <li>✓ Light & dark themes</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
