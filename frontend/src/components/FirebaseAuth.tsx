import { useEffect, useRef, useState } from 'react'
import {
  GoogleAuthProvider,
  RecaptchaVerifier,
  createUserWithEmailAndPassword,
  getRedirectResult,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPhoneNumber,
  signInWithPopup,
  signInWithRedirect,
  type ConfirmationResult,
} from 'firebase/auth'
import { getFirebaseAuth, ensureFirebaseAsync } from '../services/firebase'

function friendlyAuthError(e: any): string {
  const code = e?.code || ''
  if (code === 'auth/operation-not-allowed') return 'This sign-in method is not enabled yet. Please use another method for now.'
  if (code === 'auth/unauthorized-domain') return 'This site is not authorized for Firebase sign-in yet. In Firebase Console → Authentication → Settings → Authorized domains, add this site domain.'
  if (code === 'auth/internal-error') return 'Sign-in was interrupted before reaching the server. If you use Brave, turn Shields down for this site and allow popups + third-party cookies, then retry. Otherwise check that this domain is in Firebase Authorized domains and the sign-in method is enabled.'
  if (code === 'auth/invalid-phone-number' || code === 'auth/missing-phone-number') return 'Enter a valid phone number with country code, e.g. +919876543210.'
  if (code === 'auth/invalid-verification-code') return 'Wrong code. Check the SMS and try again.'
  if (code === 'auth/code-expired') return 'That code expired. Request a new one.'
  if (code === 'auth/too-many-requests') return 'Too many attempts. Wait a bit and try again.'
  if (code === 'auth/popup-blocked') return 'Popup was blocked. Allow popups for this site and retry.'
  if (code === 'auth/popup-closed-by-user') return 'Popup closed before finishing.'
  if (code === 'auth/network-request-failed') return 'Network error. Check your connection and retry.'
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'Email or password is incorrect.'
  if (code === 'auth/email-already-in-use') return 'An account with this email already exists. Try signing in.'
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.'
  if (code === 'auth/invalid-email') return 'Enter a valid email address.'
  return e?.message || 'Sign-in failed. Please try again.'
}

/**
 * Firebase sign-in: Email, Google, and Phone tabs. On success the Firebase
 * ID token is handed to onSession(), which exchanges it with our backend for
 * a regular app session (same kb_token flow as every other login method).
 */
export function FirebaseAuth({ onSession }: { onSession: (idToken: string) => Promise<void> }) {
  const [tab, setTab] = useState<'email' | 'google' | 'phone'>('email')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [code, setCode] = useState('')
  const [confirmRes, setConfirmRes] = useState<ConfirmationResult | null>(null)
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null)
  const [verificationSentTo, setVerificationSentTo] = useState<string | null>(null)
  const [resent, setResent] = useState(false)
  const recaptchaRef = useRef<RecaptchaVerifier | null>(null)
  const [unavailable, setUnavailable] = useState<string | null>(null)

  const [ready, setReady] = useState(false)
  const [redirecting, setRedirecting] = useState(false)
  useEffect(() => {
    let cancelled = false
    ensureFirebaseAsync()
      .then(async () => {
        // Returning from a Google redirect sign-in — complete the session.
        try {
          const result = await getRedirectResult(getFirebaseAuth())
          if (result?.user && !cancelled) {
            setRedirecting(true)
            try {
              await onSession(await result.user.getIdToken())
            } catch (err: any) {
              const detail = err?.response?.data?.detail
              if (!cancelled) setError(detail || err?.message || 'Could not start your session.')
            } finally {
              if (!cancelled) {
                setRedirecting(false)
                setReady(true)
              }
            }
            return
          }
        } catch (err: any) {
          if (!cancelled) setError(friendlyAuthError(err))
        }
        if (!cancelled) setReady(true)
      })
      .catch((e: any) => {
        if (!cancelled) setUnavailable(e?.message || 'Firebase is not configured.')
      })
    return () => {
      cancelled = true
      try {
        recaptchaRef.current?.clear()
      } catch {}
      recaptchaRef.current = null
    }
  }, [])

  if (unavailable) return null
  if (!ready) {
    return (
      <p className="text-xs text-center text-muted-foreground">
        {redirecting ? 'Finishing Google sign-in...' : 'Loading sign-in options...'}
      </p>
    )
  }

  const finish = async (idToken: string, fallbackEmail?: string) => {
    setBusy(true)
    setError(null)
    try {
      await onSession(idToken)
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      // Backend returns 503 when Firebase credentials are missing; surface it
      // precisely instead of a generic “session failed”. The one place this
      // still hits is an emulator-only local backend without a service account.
      if (err?.response?.status === 503) {
        setError('The server is not yet configured for Firebase logins — try again in a minute, or use another sign-in method.')
      } else if (typeof detail === 'string' && detail.toLowerCase().includes('verify')) {
        // Backend refuses unverified password-provider emails by design.
        // Keep the user on a path forward: check inbox + resend.
        if (fallbackEmail) setVerificationSentTo(fallbackEmail)
        setResent(false)
        setError(detail + ' — check your inbox (and spam) for the verification link, then try again.')
      } else {
        setError(detail || err?.message || 'Could not start your session.')
      }
    } finally {
      setBusy(false)
    }
  }

  const handleResendVerification = async () => {
    setBusy(true)
    setError(null)
    try {
      const auth = getFirebaseAuth()
      const user = auth.currentUser
      if (!user) {
        setError('Sign in with your email + password first, then resend the verification email.')
        return
      }
      await sendEmailVerification(user)
      setVerificationSentTo(user.email || email.trim() || null)
      setResent(true)
    } catch (err: any) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password) {
      setError('Enter your email and password.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const auth = getFirebaseAuth()
      let cred
      try {
        cred = await signInWithEmailAndPassword(auth, email.trim(), password)
      } catch (err: any) {
        if (err?.code === 'auth/user-not-found' || err?.code === 'auth/invalid-credential') {
          cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
          // New accounts must verify before the backend accepts them —
          // without this email the user is stuck in a verify-first loop.
          try {
            await sendEmailVerification(cred.user)
          } catch {
            /* non-fatal: user can resend from the UI */
          }
          setVerificationSentTo(email.trim())
          setResent(false)
        } else {
          throw err
        }
      }
      await finish(await cred.user.getIdToken(), email.trim())
    } catch (err: any) {
      const msg = friendlyAuthError(err)
      if (err?.code === 'auth/email-already-in-use' && tab !== 'google') {
        setError(msg + ' — switch to Email tab and sign in.')
      } else {
        setError(msg)
      }
    } finally {
      setBusy(false)
    }
  }

  const handleGoogle = async () => {
    setBusy(true)
    setError(null)
    const auth = getFirebaseAuth()
    const provider = new GoogleAuthProvider()
    try {
      const cred = await signInWithPopup(auth, provider)
      await finish(await cred.user.getIdToken())
    } catch (err: any) {
      // Popups are killed by Brave Shields, popup blockers, and strict
      // third-party-cookie settings — redirect survives all of those, so
      // fall back to it automatically instead of stranding the user.
      if (err?.code === 'auth/internal-error' || err?.code === 'auth/popup-blocked') {
        try {
          setRedirecting(true)
          await signInWithRedirect(auth, provider)
          return // browser leaves for Google; result is handled on return
        } catch (redirectErr: any) {
          setError(friendlyAuthError(redirectErr))
        } finally {
          setRedirecting(false)
        }
      } else if (err?.code === 'auth/invalid-credential') {
        setError('Google sign-in failed — the app is not authorized for this domain. Add it under: Firebase Console → Authentication → Settings → Authorized domains.')
      } else {
        setError(friendlyAuthError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const ensureRecaptcha = () => {
    const auth = getFirebaseAuth()
    if (!recaptchaRef.current) {
      recaptchaRef.current = new RecaptchaVerifier(auth, 'kb-recaptcha', { size: 'invisible' })
    }
    return recaptchaRef.current
  }

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = phone.replace(/[\s-]/g, '')
    if (!/^\+\d{8,15}$/.test(digits)) {
      setError('Enter a valid phone number with country code, e.g. +919876543210.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const auth = getFirebaseAuth()
      const confirmation = await signInWithPhoneNumber(auth, digits, ensureRecaptcha())
      setConfirmRes(confirmation)
      setCodeSentTo(digits)
    } catch (err: any) {
      try {
        recaptchaRef.current?.clear()
      } catch {}
      recaptchaRef.current = null
      if (err?.code === 'auth/internal-error') {
        setError(
          'Could not start phone verification. Content blockers (Brave Shields, ad blockers) often block the verification check — turn them off for this site and retry. If it still fails, the Phone provider needs enabling in Firebase Console (Authentication → Sign-in method → Phone), which can also require billing for SMS.',
        )
      } else {
        setError(friendlyAuthError(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!confirmRes || code.trim().length < 4) {
      setError('Enter the verification code from the SMS.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const cred = await confirmRes.confirm(code.trim())
      await finish(await cred.user.getIdToken())
    } catch (err: any) {
      setError(friendlyAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    { id: 'email', label: 'Email' },
    { id: 'google', label: 'Google' },
    { id: 'phone', label: 'Phone' },
  ] as const

  return (
    <div className="w-full">
      <div id="kb-recaptcha" />
      <div className="flex gap-1 p-1 rounded-xl bg-muted mb-3" role="tablist" aria-label="Sign-in methods">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => { setTab(t.id); setError(null) }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${tab === t.id ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="p-3 mb-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm" role="alert">
          {error}
        </div>
      )}

      {tab === 'email' && verificationSentTo && (
        <div className="p-3 mb-3 rounded-xl bg-primary/10 border border-primary/20 text-sm" role="status">
          Verification email sent to <span className="font-semibold">{verificationSentTo}</span>.
          Click the link in your inbox (check spam), then sign in again.
          <div className="mt-2 flex items-center gap-2">
            <button type="button" disabled={busy} onClick={handleResendVerification} className="underline font-medium disabled:opacity-50">
              {busy ? 'Sending...' : 'Resend verification email'}
            </button>
            {resent && <span className="text-xs text-muted-foreground">Sent — check your inbox.</span>}
          </div>
        </div>
      )}

      {tab === 'email' && (
        <form onSubmit={handleEmail} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            placeholder="Email address"
            autoComplete="email"
            className="auth-input w-full px-4 py-3 outline-none text-sm"
          />
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Password (min 6 chars for new accounts)"
            autoComplete="current-password"
            className="auth-input w-full px-4 py-3 outline-none text-sm"
          />
          <button disabled={busy} className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50">
            {busy ? 'Please wait...' : 'Continue with Email'}
          </button>
          <p className="text-[11px] text-muted-foreground text-center">New here? Entering a fresh email creates your account.</p>
        </form>
      )}

      {tab === 'google' && (
        <button disabled={busy} onClick={handleGoogle} className="auth-google-btn w-full py-3 rounded-xl text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-2">
          <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
            <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.3H12v4.5h6.5c-.1 1.1-.8 2.7-2.4 3.8l-.1.1 3.5 2.7.2.1c2.2-2 3.8-5 3.8-8.9z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9l-3.8-2.9c-1 .7-2.4 1.2-4.1 1.2-3.2 0-5.9-2.1-6.8-5.1l-.1.1-3.6 2.8v.1C3.5 21.3 7.5 24 12 24z" />
            <path fill="#FBBC05" d="M5.2 14.3c-.2-.7-.4-1.5-.4-2.3s.1-1.6.4-2.3l-.1-.1-3.5-2.7-.1.1C.5 8.9 0 10.4 0 12s.5 3.1 1.5 4.4l3.7-2.1z" />
            <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.5 0 3.5 2.7 1.5 6.7l3.7 2.9c.9-3 3.6-4.9 6.8-4.9z" />
          </svg>
          {busy ? 'Please wait...' : 'Continue with Google'}
        </button>
      )}

      {tab === 'phone' && (
        !confirmRes ? (
          <form onSubmit={handleSendCode} className="space-y-3">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+919876543210"
              autoComplete="tel"
              className="auth-input w-full px-4 py-3 outline-none text-sm"
            />
            <button disabled={busy} className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50">
              {busy ? 'Sending...' : 'Send verification code'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-3">
            <p className="text-xs text-muted-foreground text-center">
              Code sent to {codeSentTo}.{' '}
              <button type="button" className="underline" onClick={() => { setConfirmRes(null); setCode('') }}>
                Wrong number?
              </button>
            </p>
            <input
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
              placeholder="6-digit code"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="auth-input w-full px-4 py-3 outline-none text-sm text-center tracking-widest"
            />
            <button disabled={busy} className="auth-submit-btn w-full py-3 rounded-xl text-white font-semibold disabled:opacity-50">
              {busy ? 'Verifying...' : 'Verify & sign in'}
            </button>
          </form>
        )
      )}
    </div>
  )
}
