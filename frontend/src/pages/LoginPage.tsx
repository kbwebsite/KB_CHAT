import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { MessageCircle, Eye, EyeOff } from 'lucide-react'

export default function LoginPage() {
  const [identifier, setIdentifier]=useState('')
  const [password, setPassword]=useState('')
  const [show, setShow]=useState(false)
  const [error, setError]=useState<string|null>(null)
  const { login, loading } = useAuthStore()
  const nav=useNavigate()

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

  return (
    <div className="min-h-screen flex">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 max-w-xl mx-auto">
        <Link to="/" className="flex items-center gap-2 mb-8">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-white font-bold text-xs">KB</div>
          <span className="font-bold">KB Chat</span>
        </Link>
        <h1 className="text-3xl font-bold tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1">Sign in to continue to KB Chat.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && <div className="p-3 rounded-xl bg-destructive/10 text-destructive text-sm">{error}</div>}
          <div>
            <label className="text-sm font-medium">Email or Username</label>
            <input value={identifier} onChange={e=>setIdentifier(e.target.value)} placeholder="you@example.com or username" className="mt-1 w-full px-4 py-3 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm" />
          </div>
          <div>
            <label className="text-sm font-medium">Password</label>
            <div className="relative mt-1">
              <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" className="w-full px-4 py-3 pr-10 rounded-xl bg-muted border border-transparent focus:bg-background focus:border-primary outline-none text-sm" />
              <button type="button" onClick={()=>setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-muted-foreground">{show? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
            </div>
          </div>
          <button disabled={loading} className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-semibold hover:bg-primary/90 disabled:opacity-50 shadow-lg shadow-primary/20">
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
          <p className="text-sm text-center text-muted-foreground">Don't have an account? <Link to="/signup" className="text-primary font-semibold hover:underline">Create one</Link></p>
        </form>
      </div>
      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 relative overflow-hidden items-center justify-center p-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.15),transparent_50%)]" />
        <div className="relative max-w-md text-white">
          <MessageCircle className="w-12 h-12 mb-4 opacity-90" />
          <h2 className="text-3xl font-bold leading-tight">Every message,<br/>instantly delivered.</h2>
          <p className="mt-3 text-white/80">Join thousands who connect daily on KB Chat. Secure, fast, and beautifully simple.</p>
          <div className="mt-8 p-4 rounded-2xl bg-white/10 backdrop-blur border border-white/15">
            <p className="text-sm text-white/90">"KB Chat feels like the messaging app we always wanted — clean, fast, no clutter."</p>
            <p className="text-xs text-white/60 mt-2">— Early user</p>
          </div>
        </div>
      </div>
    </div>
  )
}
