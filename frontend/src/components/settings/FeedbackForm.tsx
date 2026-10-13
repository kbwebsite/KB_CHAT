import { useEffect, useRef, useState } from 'react'
import { Send, ImagePlus, X } from 'lucide-react'
import { feedbackApi, uploadApi } from '../../services/api'

const CATS = [
  { id: 'bug', label: 'Bug', emoji: '🐞' },
  { id: 'idea', label: 'Idea', emoji: '💡' },
  { id: 'other', label: 'Other', emoji: '💬' },
]

/** In-app feedback: category + message + optional screenshot. */
export function FeedbackForm({ appVersion }: { appVersion?: string }) {
  const [category, setCategory] = useState('bug')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [image, setImage] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!image) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(image)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [image])

  const pickImage = (f: File | undefined) => {
    setError(null)
    if (!f) return
    if (!f.type.startsWith('image/')) {
      setError('Only images can be attached.')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      setError('Image must be under 10 MB.')
      return
    }
    setImage(f)
  }

  const submit = async () => {
    const body = message.trim()
    if (!body || busy) {
      if (!body) setError('Tell us a little more first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      let image_url: string | undefined
      if (image) {
        const up: any = await uploadApi.upload(image)
        const att = up?.data
        image_url =
          att?.cloudinary_url ||
          att?.url ||
          (att?.filename ? `/api/uploads/file/${att.filename}` : undefined)
        if (!image_url) throw new Error('Image upload failed.')
      }
      const r = await feedbackApi.send({
        category,
        message: body.slice(0, 2000),
        app_version: appVersion,
        image_url,
      })
      if (r?.success) {
        setDone(true)
        setMessage('')
        setImage(null)
      } else {
        setError(r?.message || 'Could not send — try again.')
      }
    } catch (e: any) {
      setError(e.response?.data?.detail || e.message || 'Could not send — try again.')
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
      {preview ? (
        <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-[var(--k-border)]">
          <img src={preview} alt="Screenshot preview" className="w-full h-full object-cover" />
          <button
            onClick={() => setImage(null)}
            className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white"
            aria-label="Remove image"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ImagePlus className="w-4 h-4" /> Attach screenshot (optional)
        </button>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          pickImage(e.target.files?.[0])
          e.target.value = ''
        }}
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
