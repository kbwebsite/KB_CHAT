import { useRef, useState, lazy, Suspense } from 'react'
import { Smile, X } from 'lucide-react'
import type { EmojiClickData, Theme as EmojiTheme } from 'emoji-picker-react'
import StickerPicker from './StickerPicker'
import { GifPicker } from './GifPicker'

export type MediaTab = 'emoji' | 'gif' | 'sticker' | 'meme'

// Heavy picker (~300KB) loads on first open, never with the chat bundle.
const EmojiPicker = lazy(() => import('emoji-picker-react'))

// Theme enum lives in the lazily-loaded picker bundle; these literals match
// its values ('dark' | 'light') without statically importing the module.
function pickEmojiTheme(): EmojiTheme {
  try {
    return (document.documentElement.classList.contains('dark') ? 'dark' : 'light') as EmojiTheme
  } catch {
    return 'light' as EmojiTheme
  }
}

/**
 * One WhatsApp-style bottom sheet for emoji, GIFs, stickers and meme
 * creation — a tab bar on top, content below. Replaces the three separate
 * composer pickers so every media option lives in a single place.
 */
export function MediaSheet({
  tab,
  onTab,
  onEmoji,
  onSticker,
  onGif,
  onMemeFile,
  onClose,
}: {
  tab: MediaTab
  onTab: (t: MediaTab) => void
  onEmoji: (e: EmojiClickData) => void
  onSticker: (url: string) => void
  onGif: (url: string) => void
  onMemeFile: (f: File) => void
  onClose: () => void
}) {
  const memeInputRef = useRef<HTMLInputElement>(null)
  const [memeName, setMemeName] = useState<string | null>(null)

  const tabs: { id: MediaTab; label: string; icon: React.ReactNode }[] = [
    { id: 'emoji', label: 'Emoji', icon: <Smile className="w-5 h-5" /> },
    { id: 'gif', label: 'GIF', icon: <span className="text-[11px] font-black tracking-tight">GIF</span> },
    { id: 'sticker', label: 'Stickers', icon: <span className="text-xl leading-none">🤪</span> },
    { id: 'meme', label: 'Make a meme', icon: <span className="text-xl leading-none">🎨</span> },
  ]

  return (
    <div className="composer-picker" data-testid="media-sheet">
      <div className="rounded-2xl border bg-card shadow-xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center gap-1 px-2 pt-2" role="tablist" aria-label="Media options">
          {tabs.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              aria-label={t.id === 'emoji' ? 'Emoji' : t.id === 'gif' ? 'GIFs' : t.id === 'sticker' ? 'Stickers' : 'Make a meme'}
              onClick={() => onTab(t.id)}
              className={`flex-1 min-w-0 h-11 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold transition-colors touch-44 ${tab === t.id ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted'}`}
            >
              {t.icon}
              <span className="hidden min-[400px]:inline truncate">{t.label}</span>
            </button>
          ))}
          <button onClick={onClose} className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center text-muted-foreground hover:bg-muted touch-44" aria-label="Close media">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Content */}
        <div className="p-2 max-h-[340px] overflow-hidden flex flex-col min-h-0">
          {tab === 'emoji' && (
            <Suspense fallback={<div className="h-[280px] skeleton" aria-label="Loading emoji" />}>
              <EmojiPicker onEmojiClick={onEmoji} height={280} width="100%" theme={pickEmojiTheme()} />
            </Suspense>
          )}
          {tab === 'gif' && <GifPicker onSelect={onGif} />}
          {tab === 'sticker' && <StickerPicker onSelect={onSticker} />}
          {tab === 'meme' && (
            <div className="py-6 px-4 text-center">
              <p className="text-sm font-semibold">Turn a photo into a meme</p>
              <p className="text-xs text-muted-foreground mt-1">Pick a photo, add top/bottom text, send it.</p>
              <button
                onClick={() => memeInputRef.current?.click()}
                className="mt-4 px-5 py-2.5 rounded-full btn-primary text-sm font-semibold min-h-[44px]"
              >
                {memeName ? 'Choose another photo' : 'Choose photo'}
              </button>
              {memeName && <p className="text-xs text-muted-foreground mt-2 truncate">{memeName}</p>}
              <input
                ref={memeInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (memeInputRef.current) memeInputRef.current.value = ''
                  if (f) {
                    setMemeName(f.name)
                    onMemeFile(f)
                  }
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
