import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { authApi } from '../services/api'
import { FirebaseAuth } from '../components/FirebaseAuth'
import { Eye, EyeOff } from 'lucide-react'

export default function SignupPage() {
  const [form, setForm]=useState({ display_name:'', email:'', password:'', confirm_password:'' })
  const [error, setError]=useState<string|null>(null)
  const [show, setShow]=useState(false)
  const [verifyStep, setVerifyStep]=useState(false)
  const [code, setCode]=useState('')
  const [verifyBusy, setVerifyBusy]=useState(false)
  const [verifyMsg, setVerifyMsg]=useState<string|null>(null)
  const { signup, loading, setToken, setUser } = useAuthStore()
  const nav=useNavigate()

  const handle=async (e:React.FormEvent)=>{
    e.preventDefault()
    setError(null)
    if (!form.display_name || !form.email || !form.password) { setError('Fill all fields'); return }
    if (form.password !== form.confirm_password) { setError('Passwords do not match'); return }
    if (form.password.length<6) { setError('Password must be at least 6 chars'); return }
    try {
      const data = await signup(form)
      // A verification code went to the inbox — confirm it before chatting.
      if (data?.verification_sent) {
        setVerifyStep(true)
        setVerifyMsg(`We sent a 6-digit code to ${form.email}. Enter it below.`)
        return
      }
      nav('/chat')
    } catch (err:any) {
      const detail = err.response?.data?.detail
      if (Array.isArray(detail)) setError(detail.map((d:any)=> d.msg).join(', '))
      else setError(detail || err.response?.data?.message || err.message || 'Signup failed')
    }
  }

  const handleVerify=async (e:React.FormEvent)=>{
    e.preventDefault()
    setError(null)
    if (code.trim().length !== 6) { setError('Enter the 6-digit code'); return }
    setVerifyBusy(true)
    try {
      const res = await authApi.verifyEmail(form.email.trim(), code.trim())
      if (res.success) nav('/chat')
      else setError(res.message || 'Verification failed')
    } catch (err:any) {
      setError(err.response?.data?.detail || 'Invalid or expired code')
    } finally {
      setVerifyBusy(false)
    }
  }

  const handleResend=async ()=>{
    setError(null)
    setVerifyMsg(null)
    setVerifyBusy(true)
    try {
      const res = await authApi.sendVerification(form.email.trim())
      if (res.success) setVerifyMsg('New code sent — check your inbox (and spam).')
      else setError(res.message || 'Could not resend the code')
    } catch (err:any) {
      const detail = err.response?.data?.detail
      setError(detail || 'Could not resend the code yet — wait a minute and retry')
    } finally {
      setVerifyBusy(false)
    }
  }

  // Firebase tabs (Email/Google/Phone) share this session exchange.
  // NOTE: must go through the auth store (not raw localStorage) — the
  // Protected/PublicOnly guards read store state, so a direct localStorage
  // write leaves /chat bouncing back to the auth page until a full reload.
  const handleFirebaseSession=async (idToken:string)=>{
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
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="flex-1 min-w-0 w-full flex flex-col justify-center px-6 sm:px-12 lg:px-16 max-w-xl mx-auto py-8 relative z-10">
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
            <input value={form.display_name} onChange={e=>setForm({...form, display_name:e.target.value})} placeholder="Alex Morgan" autoComplete="name" className="auth-input mt-1 w-full min-w-0 max-w-full px-4 py-3 outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Email</label>
            <input type="email" value={form.email} onChange={e=>setForm({...form, email:e.target.value})} placeholder="alex@example.com" autoComplete="email" className="auth-input mt-1 w-full min-w-0 max-w-full px-4 py-3 outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="relative mt-1">
              <input type={show?'text':'password'} value={form.password} onChange={e=>setForm({...form, password:e.target.value})} placeholder="••••••••" autoComplete="new-password" className="auth-input w-full min-w-0 max-w-full px-4 py-3 pr-10 outline-none text-sm" />
              <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground transition-colors">{show? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium">Confirm Password</label>
            <input type={show?'text':'password'} value={form.confirm_password} onChange={e=>setForm({...form, confirm_password:e.target.value})} placeholder="••••••••" autoComplete="new-password" className="auth-input w-full min-w-0 max-w-full mt-1 px-4 py-3 outline-none text-sm" />
          </div>
          <button disabled={loading} className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50 mt-2">
            {loading ? 'Creating...' : 'Create Account'}
          </button>
        </form>

        {verifyStep && (
          <form onSubmit={handleVerify} className="mt-4 p-4 rounded-2xl bg-primary/10 border border-primary/20 auth-form-entrance">
            <p className="text-sm font-semibold">Check your inbox</p>
            {verifyMsg && <p className="text-xs text-muted-foreground mt-1">{verifyMsg}</p>}
            <input
              value={code}
              onChange={e=>setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              className="auth-input w-full min-w-0 max-w-full mt-3 px-4 py-3 outline-none text-sm text-center tracking-[0.5em]"
            />
            <button disabled={verifyBusy} className="auth-submit-btn w-full py-3 mt-3 rounded-xl text-white font-semibold disabled:opacity-50">
              {verifyBusy ? 'Verifying...' : 'Verify & start chatting'}
            </button>
            <div className="flex items-center justify-between mt-2">
              <button type="button" disabled={verifyBusy} onClick={handleResend} className="text-xs text-primary hover:underline font-medium disabled:opacity-50">
                Resend code
              </button>
              <button type="button" onClick={()=>nav('/chat')} className="text-xs text-muted-foreground hover:underline">
                Skip for now
              </button>
            </div>
          </form>
        )}

        <div className="mt-4 auth-form-entrance">
          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-[var(--k-border)]/40"/></div>
            <div className="relative flex justify-center text-xs uppercase"><span className="bg-background px-2 text-muted-foreground">or</span></div>
          </div>
          <div className="mt-4">
            <FirebaseAuth onSession={handleFirebaseSession} tabs={['google']} />
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
