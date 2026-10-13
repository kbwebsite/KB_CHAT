import { useState } from 'react'
import { Send } from 'lucide-react'
import { feedbackApi } from '../../services/api'

const CATS = [
  { id: 'bug', label: 'Bug', emoji: '🐞' },
  { id: 'idea', label: 'Idea', emoji: '💡' },
  { id: 'other', label: 'Other', emoji: '💬' },
]

/** In-app feedback: category + message, straight to the team queue. */
export function FeedbackForm({ appVersion }: { appVersion?: string }) {
  const [category, setCategory] = useState('bug')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    const body = message.trim()
    if (!body || busy) {
      if (!body) setError('Tell us a little more first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const r = await feedbackApi.send({ category, message: body.slice(0, 2000), app_version: appVersion })
      if (r?.success) {
        setDone(true)
        setMessage('')
      } else {
        setError(r?.message || 'Could not send — try again.')
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || 'Could not send — try again.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <div className="rounded-xl border border-[var(--k-border)] p-3 text-center">
        <p className="text-sm font-semibold">Thanks — feedback received ✓</p>
        <p className="text-xs text-muted-foreground mt-0.5">We read everything.</p>
        <button onClick={() => setDone(false)} className="mt-2 text-xs text-primary hover:underline font-medium">
          Send another
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        {CATS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCategory(c.id)}
            className={`flex-1 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${
              category === c.id
                ? 'bg-primary text-primary-foreground border-transparent'
                : 'bg-background border-[var(--k-border)] hover:bg-muted'
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value.slice(0, 2000))}
        placeholder="What broke, or what should we build?"
        rows={3}
        className="w-full px-3 py-2 rounded-xl bg-background border border-[var(--k-border)] outline-none text-sm resize-none"
      />
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground tabular-nums">{message.length}/2000</span>
        <span className="flex-1" />
        {error && <span className="text-[11px] text-destructive">{error}</span>}
        <button
          onClick={submit}
          disabled={busy || !message.trim()}
          className="px-4 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50 flex items-center gap-1.5 min-h-[40px]"
        >
          <Send className="w-3.5 h-3.5" /> {busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  )
}
