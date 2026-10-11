import { useState, useEffect } from 'react'
import { stickerApi, aiApi } from '../services/api'

interface Sticker { id: number; image_url: string; emoji?: string }
interface StickerPack { id: number; name: string; is_owner?: boolean; is_builtin?: boolean; stickers: Sticker[] }

export default function StickerPicker({ onSelect }: { onSelect: (url: string) => void }) {
  const [packs, setPacks] = useState<StickerPack[]>([])
  const [recent, setRecent] = useState<Sticker[]>([])
  const [activeTab, setActiveTab] = useState<'recent' | number | 'make'>('recent')

  const loadPacks = () => {
    stickerApi.packs().then(r => setPacks(r.data || r || []))
  }

  useEffect(() => {
    loadPacks()
    stickerApi.recent().then(r => setRecent(r.data || r || []))
  }, [])

  const handleSelect = async (s: Sticker) => {
    stickerApi.use(s.id)
    onSelect(s.image_url)
  }

  const ownPacks = packs.filter(p => p.is_owner && !p.is_builtin)
  const activeStickers = activeTab === 'recent' ? recent : activeTab === 'make' ? [] : packs.find(p => p.id === activeTab)?.stickers || []

  return (
    <div className="w-full max-w-72 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
      <div className="flex gap-1 p-2 border-b border-[var(--border)] overflow-x-auto">
        <button onClick={() => setActiveTab('recent')}
          className={`text-xs px-2 py-1 rounded shrink-0 ${activeTab === 'recent' ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--bg-tertiary)]'}`}>
          Recent
        </button>
        {packs.map(p => (
          <button key={p.id} onClick={() => setActiveTab(p.id)}
            className={`text-xs px-2 py-1 rounded shrink-0 ${activeTab === p.id ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--bg-tertiary)]'}`}>
            {p.name}
          </button>
        ))}
        <button onClick={() => setActiveTab('make')} aria-label="Make a sticker with AI"
          className={`text-xs px-2 py-1 rounded shrink-0 ${activeTab === 'make' ? 'bg-[var(--primary)] text-white' : 'hover:bg-[var(--bg-tertiary)]'}`}>
          ✨ New
        </button>
      </div>
      {activeTab === 'make' ? (
        <StickerMaker packs={ownPacks} onSaved={(packId) => { loadPacks(); setActiveTab(packId) }} />
      ) : (
      <div className="grid grid-cols-4 gap-1 p-2 max-h-48 overflow-y-auto">
        {activeStickers.length === 0 && <p className="col-span-4 text-xs text-gray-400 text-center py-4">No stickers</p>}
        {activeStickers.map(s => (
          <StickerButton key={s.id} s={s} onSelect={() => handleSelect(s)} />
        ))}
      </div>
      )}
    </div>
  )
}

function StickerButton({ s, onSelect }: { s: Sticker; onSelect: () => void }) {
  const [imgOk, setImgOk] = useState(true)
  return (
    <button onClick={onSelect}
      className="w-14 h-14 rounded-lg hover:bg-[var(--bg-tertiary)] flex items-center justify-center p-1 transition-colors">
      {imgOk && s.image_url ? (
        <img src={s.image_url} alt={s.emoji || 'sticker'} className="w-full h-full object-contain" onError={() => setImgOk(false)} loading="lazy" />
      ) : (
        <span className="text-3xl leading-none">{s.emoji || '🙂'}</span>
      )}
    </button>
  )
}

/** AI sticker maker: describe → generate → save into one of your packs.
 * User packs are owner-scoped server-side; builtin packs never appear as
 * save targets. Generation uses the existing image endpoint. */
export function StickerMaker({ packs, onSaved }: {
  packs: StickerPack[]
  onSaved: (packId: number) => void
}) {
  const [prompt, setPrompt] = useState('')
  const [genUrl, setGenUrl] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [emoji, setEmoji] = useState('')
  const [packSel, setPackSel] = useState<string>('new')
  const [newPackName, setNewPackName] = useState('My Stickers')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const generate = async () => {
    const p = prompt.trim()
    if (!p || generating) return
    setGenerating(true)
    setGenError(null)
    setGenUrl(null)
    try {
      const r: any = await aiApi.generateImage(`cute sticker style, sticker art, ${p}`)
      const url = r?.data?.image_url ?? r?.image_url
      if (!url) throw new Error('no image url')
      setGenUrl(url)
    } catch {
      setGenError('Could not generate — the image service may be busy. Try again.')
    } finally {
      setGenerating(false)
    }
  }

  const save = async () => {
    if (!genUrl || saving) return
    setSaving(true)
    setSaveError(null)
    try {
      let pid: number
      if (packSel !== 'new') {
        // An existing pack wins outright; the new-pack name is ignored.
        const existing = Number(packSel)
        if (!Number.isFinite(existing)) throw new Error('pick a pack')
        pid = existing
      } else {
        const fresh = newPackName.trim()
        if (!fresh) throw new Error('name')
        const created: any = await stickerApi.createPack(fresh.slice(0, 100))
        const data = created?.data ?? created
        if (!data?.id) throw new Error('create failed')
        pid = data.id
      }
      const added: any = await stickerApi.addSticker(pid, {
        image_url: genUrl,
        ...(emoji.trim() ? { emoji: emoji.trim().slice(0, 20) } : {}),
      })
      const data = added?.data ?? added
      if (!data?.id) throw new Error('add failed')
      onSaved(pid)
    } catch (e: any) {
      setSaveError(e?.message === 'name' ? 'Name your pack first.' : 'Could not save — try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-2 space-y-2 max-h-64 overflow-y-auto">
      <div className="flex gap-1.5">
        <label htmlFor="sticker-prompt" className="sr-only">Describe your sticker</label>
        <input
          id="sticker-prompt"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') void generate() }}
          placeholder="A sleepy cat astronaut…"
          maxLength={200}
          className="flex-1 min-w-0 px-2.5 py-2 rounded-lg bg-muted text-xs outline-none min-h-[44px]"
        />
        <button
          onClick={() => void generate()}
          disabled={!prompt.trim() || generating}
          aria-label="Generate sticker image"
          className="px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 min-h-[44px]"
        >
          {generating ? '…' : 'Draw'}
        </button>
      </div>
      {genError && <p className="text-[11px] text-destructive" role="alert">{genError}</p>}
      {genUrl && (
        <div className="rounded-xl border border-border p-2 space-y-2 bg-muted/40">
          <img src={genUrl} alt={prompt} loading="lazy" className="w-full h-32 rounded-lg object-contain bg-background" />
          <div className="flex gap-1.5">
            <label htmlFor="sticker-emoji" className="sr-only">Emoji label (optional)</label>
            <input
              id="sticker-emoji"
              value={emoji}
              onChange={e => setEmoji(e.target.value)}
              placeholder="Emoji 🙂"
              maxLength={20}
              className="w-24 px-2 py-2 rounded-lg bg-muted text-xs outline-none min-h-[44px]"
            />
            <label htmlFor="sticker-pack" className="sr-only">Save to pack</label>
            <select
              id="sticker-pack"
              value={packSel}
              onChange={e => setPackSel(e.target.value)}
              className="flex-1 min-w-0 px-2 py-2 rounded-lg bg-muted text-xs outline-none min-h-[44px]"
            >
              <option value="new">＋ New pack…</option>
              {packs.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          {(packSel === 'new' || packs.length === 0) && (
            <>
              <label htmlFor="sticker-pack-name" className="sr-only">New pack name</label>
              <input
                id="sticker-pack-name"
                value={newPackName}
                onChange={e => setNewPackName(e.target.value)}
                placeholder="Pack name"
                maxLength={100}
                className="w-full px-2.5 py-2 rounded-lg bg-muted text-xs outline-none min-h-[44px]"
              />
            </>
          )}
          <button
            onClick={() => void save()}
            disabled={saving}
            className="w-full py-2 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 min-h-[44px]"
          >
            {saving ? 'Saving…' : 'Save sticker'}
          </button>
          {saveError && <p className="text-[11px] text-destructive" role="alert">{saveError}</p>}
        </div>
      )}
    </div>
  )
}
