import { useMemo, useState } from 'react'
import { Dices, Send, Sparkles, X } from 'lucide-react'
import { agentApi } from '../services/api'
import {
  ICEBREAKER_CATEGORIES,
  randomIcebreaker,
} from '../utils/icebreakers'

const AI_PROMPT =
  'Suggest one short, friendly icebreaker question to start a chat conversation. Reply with only the question text, no quotes or explanation.'

export function fillComposerDraft(conversationId: number, text: string): void {
  try {
    const raw = localStorage.getItem('kb_drafts')
    const map = raw ? JSON.parse(raw) : {}
    const obj = map && typeof map === 'object' ? map : {}
    if (text.trim()) obj[String(conversationId)] = text
    else delete obj[String(conversationId)]
    localStorage.setItem('kb_drafts', JSON.stringify(obj))
  } catch {}
  try {
    window.dispatchEvent(
      new CustomEvent('kryzen:fill-draft', { detail: { cid: conversationId, text } }),
    )
  } catch {}
}

/**
 * Break-the-ice sheet: category decks with shuffle, one-tap composer fill,
 * and one AI-generated question when the agent backend answers (silent
 * fallback to the local deck otherwise — the sheet never hard-fails).
 */
export function IcebreakerSheet({
  conversationId,
  onClose,
  onUsed,
}: {
  conversationId: number
  onClose: () => void
  onUsed: (text: string) => void
}) {
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [current, setCurrent] = useState(() => randomIcebreaker(null))
  const [aiBusy, setAiBusy] = useState(false)
  const [aiNote, setAiNote] = useState<string | null>(null)

  const shuffle = (cat: string | null) => {
    setCurrent(randomIcebreaker(cat))
    setAiNote(null)
  }

  const useIt = () => {
    fillComposerDraft(conversationId, current.question)
    onUsed(current.question)
    onClose()
  }

  const askAi = async () => {
    setAiBusy(true)
    setAiNote(null)
    try {
      const res = await agentApi.chat(AI_PROMPT, null)
      const text = String(res?.data?.response || '').trim().slice(0, 200)
      if (!text) throw new Error('empty')
      setCurrent({
        category: { id: 'ai', label: 'Kryzen AI', questions: [] },
        question: text,
      })
    } catch {
      setAiNote('AI is unavailable — here is one from the deck instead.')
      setCurrent(randomIcebreaker(categoryId))
    } finally {
      setAiBusy(false)
    }
  }

  const cats = useMemo(() => ICEBREAKER_CATEGORIES, [])

  return (
    <>
      <div className="bottom-sheet-overlay open" onClick={onClose} />
      <div className="bottom-sheet open" role="dialog" aria-modal="true" aria-label="Break the ice">
        <div className="bottom-sheet-handle" aria-hidden="true" />
        <div className="bottom-sheet-title flex items-center justify-between">
          <span className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" aria-hidden="true" />
            Break the ice
          </span>
          <button onClick={onClose} aria-label="Close icebreakers" className="icon-btn">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="px-5 pb-5 space-y-3">
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar" role="tablist" aria-label="Icebreaker vibes">
            <button
              role="tab"
              aria-selected={categoryId === null}
              onClick={() => { setCategoryId(null); shuffle(null) }}
              className={`shrink-0 px-3 h-9 rounded-full text-xs font-semibold border transition min-h-[44px] ${categoryId === null ? 'chip-active border-transparent' : 'bg-muted border-transparent'}`}
            >
              Any vibe
            </button>
            {cats.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={categoryId === c.id}
                onClick={() => { setCategoryId(c.id); shuffle(c.id) }}
                className={`shrink-0 px-3 h-9 rounded-full text-xs font-semibold border transition min-h-[44px] ${categoryId === c.id ? 'chip-active border-transparent' : 'bg-muted border-transparent'}`}
              >
                {c.label}
              </button>
            ))}
          </div>
          <div className="rounded-2xl border border-border p-4 bg-muted/40">
            <p className="text-[11px] font-semibold text-primary uppercase tracking-wide">{current.category.label}</p>
            <p className="text-[15px] font-medium leading-snug mt-1">{current.question}</p>
          </div>
          {aiNote && <p className="text-xs text-muted-foreground">{aiNote}</p>}
          <div className="flex gap-2">
            <button
              onClick={() => shuffle(categoryId)}
              className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-sm font-semibold flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <Dices className="w-4 h-4" aria-hidden="true" /> Shuffle
            </button>
            <button
              onClick={askAi}
              disabled={aiBusy}
              className="flex-1 py-2.5 rounded-xl bg-muted hover:bg-muted/80 transition-colors text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1.5 min-h-[48px]"
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              {aiBusy ? 'Asking AI…' : 'Ask AI'}
            </button>
          </div>
          <button
            onClick={useIt}
            className="w-full py-3 rounded-2xl btn-primary text-[15px] font-bold flex items-center justify-center gap-2 min-h-[48px]"
          >
            <Send className="w-4 h-4" aria-hidden="true" /> Use in chat
          </button>
        </div>
      </div>
    </>
  )
}
