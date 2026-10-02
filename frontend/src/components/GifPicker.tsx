import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { giphyApi } from '../services/api'
import { useDebounce } from '../hooks/useDebounce'

/** GIPHY search + trending grid. Sends the tapped GIF as a chat image. */
export function GifPicker({ onSelect }: { onSelect: (url: string) => void }) {
  const [q, setQ] = useState('')
  const debounced = useDebounce(q, 400)
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    let live = true
    setLoading(true)
    setErr(null)
    const p = debounced.trim() ? giphyApi.search(debounced.trim()) : giphyApi.trending()
    p.then((r: any) => {
      if (live) setItems(r?.data || [])
    })
      .catch(() => {
        if (live) setErr('GIFs unavailable right now')
      })
      .finally(() => {
        if (live) setLoading(false)
      })
    return () => {
      live = false
    }
  }, [debounced])

  const pick = (g: any) => {
    const url =
      g?.images?.fixed_height?.url || g?.images?.original?.url || g?.images?.fixed_width_small?.url
    if (url) onSelect(url)
  }

  return (
    <div className="flex flex-col min-h-0">
      <div className="relative mb-2">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search GIFs…"
          className="w-full pl-9 pr-3 py-2 rounded-xl bg-muted outline-none text-sm"
        />
      </div>
      {loading ? (
        <p className="text-xs text-muted-foreground text-center py-6">Loading GIFs…</p>
      ) : err ? (
        <p className="text-xs text-destructive text-center py-6">{err}</p>
      ) : items.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-6">No GIFs found</p>
      ) : (
        <div className="grid grid-cols-3 gap-1.5 overflow-y-auto pr-0.5">
          {items.map((g: any) => (
            <button
              key={g.id}
              onClick={() => pick(g)}
              className="rounded-lg overflow-hidden bg-muted hover:opacity-85 transition active:scale-95"
              title={g.title || 'GIF'}
            >
              <img
                src={g?.images?.fixed_width_small?.url}
                alt={g.title || 'GIF'}
                loading="lazy"
                decoding="async"
                className="w-full h-20 object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
