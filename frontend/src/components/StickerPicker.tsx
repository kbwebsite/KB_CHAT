import { useState, useEffect } from 'react'
import { stickerApi } from '../services/api'

interface Sticker { id: number; image_url: string; emoji?: string }
interface StickerPack { id: number; name: string; stickers: Sticker[] }

export default function StickerPicker({ onSelect }: { onSelect: (url: string) => void }) {
  const [packs, setPacks] = useState<StickerPack[]>([])
  const [recent, setRecent] = useState<Sticker[]>([])
  const [activeTab, setActiveTab] = useState<'recent' | number>('recent')

  useEffect(() => {
    stickerApi.packs().then(r => setPacks(r.data || []))
    stickerApi.recent().then(r => setRecent(r.data || []))
  }, [])

  const handleSelect = async (s: Sticker) => {
    stickerApi.use(s.id)
    onSelect(s.image_url)
  }

  const activeStickers = activeTab === 'recent' ? recent : packs.find(p => p.id === activeTab)?.stickers || []

  return (
    <div className="w-72 bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden">
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
      </div>
      <div className="grid grid-cols-4 gap-1 p-2 max-h-48 overflow-y-auto">
        {activeStickers.length === 0 && <p className="col-span-4 text-xs text-gray-400 text-center py-4">No stickers</p>}
        {activeStickers.map(s => (
          <button key={s.id} onClick={() => handleSelect(s)}
            className="w-14 h-14 rounded-lg hover:bg-[var(--bg-tertiary)] flex items-center justify-center p-1 transition-colors">
            <img src={s.image_url} alt={s.emoji || 'sticker'} className="w-full h-full object-contain" />
          </button>
        ))}
      </div>
    </div>
  )
}
