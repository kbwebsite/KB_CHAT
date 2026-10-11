import { useState } from 'react'
import { MapPin, Plus, Trash2, X } from 'lucide-react'
import { TH_DEFAULT_RADIUS, TH_MAX_CLUES, type THClue } from '../utils/treasureHunt'

interface Row extends THClue {
  key: number
}

const RADII = [50, 100, 250, 500]

/** Hunt setup sheet: title + up to 6 GPS checkpoints. */
export function HuntBuilder({ onClose, onStart }: { onClose: () => void; onStart: (json: string) => void }) {
  const [title, setTitle] = useState('')
  const [rows, setRows] = useState<Row[]>([
    { key: 1, t: '', la: NaN, lo: NaN, r: TH_DEFAULT_RADIUS },
    { key: 2, t: '', la: NaN, lo: NaN, r: TH_DEFAULT_RADIUS },
  ])
  const [locBusy, setLocBusy] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const patch = (key: number, p: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const useMyLocation = (key: number) => {
    if (!('geolocation' in navigator)) {
      setError('Geolocation not supported in this browser.')
      return
    }
    setLocBusy(key)
    setError(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patch(key, { la: pos.coords.latitude, lo: pos.coords.longitude })
        setLocBusy(null)
      },
      () => {
        setError('Location unavailable — allow access and retry.')
        setLocBusy(null)
      },
      { timeout: 15000 },
    )
  }

  const valid = rows.filter(
    (r) => r.t.trim() && Number.isFinite(r.la) && Number.isFinite(r.lo),
  )

  const start = () => {
    if (!title.trim()) {
      setError('Give the hunt a title first.')
      return
    }
    if (valid.length < 1) {
      setError('Add at least one clue with a location.')
      return
    }
    onStart(
      JSON.stringify({
        title: title.trim().slice(0, 60),
        clues: valid.map((r) => ({
          t: r.t.trim().slice(0, 140),
          la: r.la,
          lo: r.lo,
          r: r.r,
        })),
      }),
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-3"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border bg-card p-4 shadow-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-sm">🗺️ New treasure hunt</h3>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full hover:bg-muted">
            <X className="w-4 h-4" />
          </button>
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Hunt title (e.g. Campus dash)"
          maxLength={60}
          className="w-full px-3 h-11 rounded-xl bg-muted text-sm outline-none mb-2"
        />
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={r.key} className="rounded-xl bg-muted/50 border border-border/60 p-2.5">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[11px] font-bold text-primary">#{i + 1}</span>
                {rows.length > 1 && (
                  <button
                    onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
                    aria-label={`Remove clue ${i + 1}`}
                    className="ml-auto p-1 rounded hover:bg-muted text-muted-foreground"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <input
                value={r.t}
                onChange={(e) => patch(r.key, { t: e.target.value })}
                placeholder="Clue text (e.g. where the banyan shades…)"
                maxLength={140}
                className="w-full px-2.5 h-10 rounded-lg bg-background text-xs outline-none mb-1.5"
              />
              <div className="flex gap-1.5">
                <input
                  value={Number.isFinite(r.la) ? String(r.la) : ''}
                  onChange={(e) => patch(r.key, { la: Number(e.target.value) })}
                  placeholder="Lat"
                  inputMode="decimal"
                  className="flex-1 min-w-0 px-2 h-9 rounded-lg bg-background text-xs outline-none"
                />
                <input
                  value={Number.isFinite(r.lo) ? String(r.lo) : ''}
                  onChange={(e) => patch(r.key, { lo: Number(e.target.value) })}
                  placeholder="Lon"
                  inputMode="decimal"
                  className="flex-1 min-w-0 px-2 h-9 rounded-lg bg-background text-xs outline-none"
                />
                <select
                  value={r.r}
                  onChange={(e) => patch(r.key, { r: Number(e.target.value) })}
                  aria-label="Radius"
                  className="px-1.5 h-9 rounded-lg bg-background text-xs outline-none shrink-0"
                >
                  {RADII.map((v) => (
                    <option key={v} value={v}>
                      ±{v}m
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => useMyLocation(r.key)}
                  disabled={locBusy === r.key}
                  title="Use my location"
                  aria-label={`Use my location for clue ${i + 1}`}
                  className="px-2 h-9 rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition shrink-0 disabled:opacity-50"
                >
                  <MapPin className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
        {rows.length < TH_MAX_CLUES && (
          <button
            onClick={() => setRows((rs) => [...rs, { key: Date.now(), t: '', la: NaN, lo: NaN, r: TH_DEFAULT_RADIUS }])}
            className="mt-2 w-full py-2 rounded-xl bg-muted hover:bg-accent text-xs font-semibold flex items-center justify-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" /> Add clue ({rows.length}/{TH_MAX_CLUES})
          </button>
        )}
        {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        <button
          onClick={start}
          className="mt-3 w-full py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold min-h-[44px]"
        >
          Start hunt 🗺️
        </button>
      </div>
    </div>
  )
}
