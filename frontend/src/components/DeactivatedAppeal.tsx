import { useEffect, useState } from 'react'
import { Mail, Send } from 'lucide-react'
import { configApi, moderationApi } from '../services/api'

/** Shown when sign-in is refused for a deactivated account: explains why,
 * offers the admin contact address, and files a reactivation request that
 * lands in the moderation queue. */
export function DeactivatedAppeal({ email }: { email: string }) {
  const [contact, setContact] = useState<string | null>(null)
  const [appealEmail, setAppealEmail] = useState(email)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    configApi
      .get()
      .then((cfg: any) => {
        const addr = cfg?.data?.supportEmail
        if (live && typeof addr === 'string' && addr.includes('@')) setContact(addr)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  const send = async (e: React.FormEvent) => {
    e.preventDefault()
    if (busy || sent) return
    if (!appealEmail.includes('@')) {
      setError('Enter your account email address.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await moderationApi.appeal(appealEmail.trim(), message.trim())
      setSent(true)
    } catch {
      setError('Could not send the request — try again later.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="p-4 rounded-2xl bg-destructive/10 border border-destructive/25" role="alert">
      <p className="text-sm font-bold">Your account is deactivated</p>
      <p className="text-xs text-muted-foreground mt-1">
        Sign-in is disabled for this account. {contact ? 'Contact an admin or send a review request below.' : 'Send a review request below.'}
      </p>
      {contact && (
        <a
          href={`mailto:${contact}?subject=${encodeURIComponent('Kryzen account reactivation')}&body=${encodeURIComponent(`Account email: ${appealEmail}`)}`}
          className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
        >
          <Mail className="w-3.5 h-3.5" /> {contact}
        </a>
      )}
      {sent ? (
        <p className="mt-3 text-xs font-semibold text-emerald-500">
          Request received — an admin will review your account.
        </p>
      ) : (
        <form onSubmit={send} className="mt-3">
          <label htmlFor="appeal-email" className="text-[11px] font-semibold text-muted-foreground">
            Account email
          </label>
          <input
            id="appeal-email"
            type="email"
            value={appealEmail}
            onChange={(e) => setAppealEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="auth-input w-full min-w-0 max-w-full mt-1.5 px-3 py-2.5 outline-none text-sm"
          />
          <label htmlFor="appeal-message" className="text-[11px] font-semibold text-muted-foreground">
            Request reactivation
          </label>
          <textarea
            id="appeal-message"
            value={message}
            onChange={(e) => setMessage(e.target.value.slice(0, 1000))}
            placeholder="Why should your account be restored?"
            rows={2}
            className="auth-input w-full min-w-0 max-w-full mt-1.5 px-3 py-2.5 outline-none text-sm resize-none"
          />
          {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-2 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-xs font-bold min-h-[44px] disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            <Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send review request'}
          </button>
        </form>
      )}
    </div>
  )
}
