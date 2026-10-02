import { useState } from 'react'
import { Share2 } from 'lucide-react'
import { shareText } from '../utils/share'

/** Bragging rights: native share sheet first, clipboard fallback. */
export function ShareWinButton({ title, text }: { title: string; text: string }) {
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation()
        if (busy) return
        setBusy(true)
        try {
          const r = await shareText(title, text)
          setMsg(r === 'shared' ? 'Shared!' : r === 'copied' ? 'Copied!' : 'Sharing not supported')
          setTimeout(() => setMsg(null), 2500)
        } finally {
          setBusy(false)
        }
      }}
      className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-medium hover:bg-primary/25 transition shrink-0 flex items-center gap-1"
      title="Share this result"
    >
      <Share2 className="w-3 h-3" /> {msg || 'Share'}
    </button>
  )
}
