import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { authApi } from '../services/api'
import { MessageCircle, ArrowLeft, Mail, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [step, setStep] = useState<'email' | 'reset'>('email')
  const [email, setEmail] = useState('')
  const [token, setToken] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [loading, setLoading] = useState(false)
  const nav = useNavigate()

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!email) {
      setError('Please enter your email')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.forgotPassword(email)
      if (res.success) {
        // In dev mode, token is returned in response
        if (res.data?.token) {
          setToken(res.data.token)
          setStep('reset')
        } else {
          setSuccess(true)
        }
      } else {
        setError(res.message || 'Failed to send reset link')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to send reset link')
    }
    setLoading(false)
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!newPassword || !confirmPassword) {
      setError('Please fill all fields')
      return
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match')
      return
    }
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    setLoading(true)
    try {
      const res = await authApi.resetPassword(token, newPassword)
      if (res.success) {
        setSuccess(true)
        setTimeout(() => nav('/login'), 2000)
      } else {
        setError(res.message || 'Failed to reset password')
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to reset password')
    }
    setLoading(false)
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-2">Email Sent</h1>
          <p className="text-muted-foreground mb-6">
            If the email exists, a reset link has been sent.
          </p>
          <Link to="/login" className="text-primary hover:underline">
            Back to Login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      <div className="flex-1 flex flex-col justify-center px-6 sm:px-12 lg:px-16 max-w-xl mx-auto relative z-10">
        <Link to="/login" className="flex items-center gap-2 mb-8 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Login</span>
        </Link>

        <Link to="/" className="flex items-center gap-2 mb-8">
          <img src="/kryzen-logo.svg" alt="Kryzen" className="w-8 h-8 rounded-xl" />
          <span className="font-bold landing-hero-title">Kryzen</span>
        </Link>

        {step === 'email' ? (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Forgot password?</h1>
            <p className="text-muted-foreground mt-1">Enter your email and we'll send you a reset link.</p>

            <form onSubmit={handleRequestReset} className="mt-8 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="text-sm font-medium">Email</label>
                <div className="relative mt-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="auth-input w-full pl-10 pr-4 py-3 outline-none text-sm"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send Reset Link'}
              </button>
            </form>
          </>
        ) : (
          <>
            <h1 className="text-3xl font-bold tracking-tight">Reset password</h1>
            <p className="text-muted-foreground mt-1">Enter your new password below.</p>

            <form onSubmit={handleResetPassword} className="mt-8 space-y-4">
              {error && (
                <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                  {error}
                </div>
              )}
              <div>
                <label className="text-sm font-medium">New Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input mt-1 w-full px-4 py-3 outline-none text-sm"
                />
              </div>
              <div>
                <label className="text-sm font-medium">Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  className="auth-input mt-1 w-full px-4 py-3 outline-none text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50"
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>
          </>
        )}
      </div>

      <div className="hidden lg:flex flex-1 bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 auth-hero-panel items-center justify-center p-12 relative overflow-hidden">
        <div className="auth-mesh-bg" />
        <div className="relative max-w-md text-white">
          <MessageCircle className="w-12 h-12 mb-4 opacity-90" />
          <h2 className="text-3xl font-bold leading-tight">Secure account recovery.</h2>
          <p className="mt-3 text-white/80">We'll help you get back into your account quickly and safely.</p>
        </div>
      </div>
    </div>
  )
}