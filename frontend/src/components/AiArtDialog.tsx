import { useState } from 'react'
import { X, Sparkles, RefreshCw, Check } from 'lucide-react'
import { aiApi } from '../services/api'

/** AI art from a text prompt (keyless image backend): preview, regenerate,
 * then hand the URL to the caller (chat wallpaper, group icon, …). */
export function AiArtDialog({ onClose, onPick, cta = 'Use this' }: {
  onClose: () => void
  onPick: (url: string) => void
  cta?: string
}) {
  const [prompt, setPrompt] = useState('')
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const generate = async () => {
    const p = prompt.trim()
    if (!p || busy) return
    setBusy(true)
    setError(null)
    try {
      const r: any = await aiApi.generateImage(p.slice(0, 500))
      const u = r?.data?.image_url
      if (r?.success && u) setUrl(u)
      else throw new Error(r?.message || 'Generation failed')
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || 'Generation failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-label="Generate AI art"
    >
      <div
        className="bg-card border border-border rounded-t-3xl sm:rounded-3xl w-full sm:max-w-md p-5 animate-slide-up max-h-[90dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="font-bold text-[17px] tracking-tight flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-primary" /> AI art
          </p>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void generate()
            }}
            placeholder="A sunset over mountains, pastel…"
            maxLength={500}
            autoFocus
            className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border bg-muted outline-none text-sm min-h-[44px]"
          />
          <button
            onClick={generate}
            disabled={busy || !prompt.trim()}
            className="px-4 py-2.5 rounded-xl btn-primary text-sm font-semibold disabled:opacity-50 min-h-[44px] shrink-0"
          >
            {busy ? '…' : 'Create'}
          </button>
        </div>
        {error && <p className="text-xs text-destructive mt-2">{error}</p>}
        {url ? (
          <div className="mt-3">
            <img src={url} alt={prompt} className="w-full rounded-2xl border border-subtle" loading="lazy" />
            <div className="flex gap-2 mt-3">
              <button
                onClick={generate}
                disabled={busy}
                className="flex-1 py-2.5 rounded-xl bg-muted text-sm font-medium disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[44px]"
              >
                <RefreshCw className="w-4 h-4" /> New version
              </button>
              <button
                onClick={() => onPick(url)}
                className="flex-1 py-2.5 rounded-xl btn-primary text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[44px]"
              >
                <Check className="w-4 h-4" /> {cta}
              </button>
            </div>
          </div>
        ) : (
          !busy && (
            <p className="text-xs text-muted-foreground mt-3">
              Describe anything — each Create rolls a fresh variation.
            </p>
          )
        )}
        {busy && !url && <p className="text-xs text-muted-foreground mt-3 animate-pulse">Painting…</p>}
      </div>
    </div>
  )
}
