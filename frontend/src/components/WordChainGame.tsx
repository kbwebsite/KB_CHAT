import { useState } from 'react'
import { Send } from 'lucide-react'
import { ShareWinButton } from './ShareWinButton'
import {
  collectWordChain,
  isWordChainChallenge,
} from '../utils/wordChain'

export { isWordChainChallenge }

export function WordChainGame({
  challenge,
  msgs,
  onWord,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  onWord: (challenge: any, word: string) => void
  onRematch: () => void
}) {
  const [draft, setDraft] = useState('')
  const settingUp = !(challenge.id > 0)
  const state = collectWordChain(challenge.id, msgs)
  const tail = state.valid.slice(-4)

  const submit = () => {
    const w = draft.trim()
    if (!w || settingUp) return
    onWord(challenge, w)
    setDraft('')
  }

  return (
    <div className="w-full max-w-[260px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">🔗 Word Chain</p>
      <div className="rounded-xl bg-muted/60 border border-border/60 p-3">
        {state.valid.length === 0 ? (
          <p className="text-xs opacity-70 text-center">
            No words yet — start with <span className="font-bold">any</span> word!
          </p>
        ) : (
          <p className="text-sm font-medium leading-relaxed break-words" aria-label="Word chain">
            {tail.map((v, i) => (
              <span key={`${v.word}-${i}`}>
                {i > 0 && <span className="opacity-50"> → </span>}
                <span title={v.senderName}>{v.word}</span>
              </span>
            ))}
            {state.valid.length > 4 && (
              <span className="opacity-60 text-xs"> (+{state.valid.length - 4} more)</span>
            )}
          </p>
        )}
        {state.needLetter && (
          <p className="text-[11px] mt-1.5 font-semibold text-primary">
            Next word starts with “{state.needLetter}”
          </p>
        )}
        {state.strikes.length > 0 && (
          <p className="text-[11px] opacity-70 mt-1.5" aria-label="Rejected words">
            ❌ {state.strikes.slice(-2).map((s) => `${s.word} (${s.reason})`).join(' · ')}
          </p>
        )}
      </div>
      {!settingUp && (
        <div className="mt-2 flex gap-1.5">
          <label htmlFor={`wc-input-${challenge.id ?? 'new'}`} className="sr-only">
            Play a word
          </label>
          <input
            id={`wc-input-${challenge.id ?? 'new'}`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            placeholder={state.needLetter ? `Starts with ${state.needLetter}…` : 'Your word…'}
            maxLength={30}
            className="flex-1 min-w-0 px-3 h-11 rounded-xl bg-muted text-sm outline-none"
          />
          <button
            onClick={(e) => {
              e.stopPropagation()
              submit()
            }}
            aria-label="Play word"
            className="w-11 h-11 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      )}
      {state.scores.length > 0 && (
        <p className="text-[11px] opacity-80 mt-2" aria-label="Word chain scores">
          🏅 {state.scores.map((s) => `${s.name} ${s.count}`).join(' · ')}
        </p>
      )}
      {!settingUp && (
        <button onClick={onRematch} className="mt-1.5 text-[11px] px-2.5 py-1.5 rounded-lg bg-muted hover:bg-accent font-semibold min-h-[36px]">
          New chain
        </button>
      )}
      <ShareWinButton
        title="Kryzen Word Chain"
        text={`🔗 We built a ${state.valid.length}-word chain on Kryzen Chat! Can you keep up?`}
      />
    </div>
  )
}
