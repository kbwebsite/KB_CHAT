import { ShareWinButton } from './ShareWinButton'

/**
 * Emoji-movie guessing game played entirely through chat messages —
 * no protocol change, same pattern as TicTacToe/RPS/ConnectFour.
 * Challenge:  `🎮EMOJI:new\n<human text>`
 * Guess:      `🎮EMOJI:move:<challengeId>:<free text guess>`
 *
 * The puzzle is derived deterministically from the challenge id
 * (`deck[abs(id) % deck.length]`), so every device — including the
 * challenger's — sees the same movie with zero extra messages and no
 * hidden state to leak. First exact (normalized) guess wins.
 */

const CHALLENGE_PREFIX = '🎮EMOJI:new'
const GUESS_RE = /^🎮EMOJI:move:(-?\d+):([\s\S]*)/m

export interface EmojiPuzzle {
  emoji: string
  title: string
}

export const EMOJI_DECK: EmojiPuzzle[] = [
  { emoji: '🚢🧊💔', title: 'Titanic' },
  { emoji: '🦁👑', title: 'The Lion King' },
  { emoji: '🧙⚡', title: 'Harry Potter' },
  { emoji: '🕷️🧑', title: 'Spider-Man' },
  { emoji: '🦇🌃', title: 'Batman' },
  { emoji: '🧸🚀🌌', title: 'Toy Story' },
  { emoji: '❄️👭', title: 'Frozen' },
  { emoji: '🦖🏝️', title: 'Jurassic Park' },
  { emoji: '👽🚲🌕', title: 'E.T.' },
  { emoji: '🥊🥩🔔', title: 'Rocky' },
  { emoji: '🏴‍☠️🦜', title: 'Pirates of the Caribbean' },
  { emoji: '🧛🧄', title: 'Dracula' },
  { emoji: '🤠👽', title: 'Cowboys and Aliens' },
  { emoji: '🐼🥋', title: 'Kung Fu Panda' },
  { emoji: '🔍🕵️', title: 'Sherlock Holmes' },
  { emoji: '🧟🧠', title: 'Zombieland' },
  { emoji: '🚀🌑', title: 'Apollo 13' },
  { emoji: '🐟🔍', title: 'Finding Nemo' },
  { emoji: '👻🚫', title: 'Ghostbusters' },
  { emoji: '💍🌋', title: 'The Lord of the Rings' },
  { emoji: '🃏🦇', title: 'Joker' },
  { emoji: '🚗💨', title: 'Fast and Furious' },
  { emoji: '🧜🌊', title: 'The Little Mermaid' },
  { emoji: '🐒🍌', title: 'Planet of the Apes' },
  { emoji: '🎭👺', title: 'The Mask' },
  { emoji: '🏔️🥶', title: 'Everest' },
  { emoji: '🤖❤️', title: 'Wall-E' },
  { emoji: '🧙‍♂️💍', title: 'The Hobbit' },
  { emoji: '🦸⚡', title: 'Shazam' },
  { emoji: '🌊🌀', title: 'Moana' },
  { emoji: '🐭🧀', title: 'Ratatouille' },
  { emoji: '🕰️🐇', title: 'Alice in Wonderland' },
]

export function isEmojiChallenge(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith(CHALLENGE_PREFIX)
}

export function parseEmojiGuess(text: string): { challengeId: number; guess: string } | null {
  const m = GUESS_RE.exec(text || '')
  if (!m) return null
  return { challengeId: Number(m[1]), guess: m[2] }
}

/** Normalize for fair matching: case, spacing, punctuation, leading "the". */
export function normalizeGuess(text: string): string {
  return (text || '')
    .toLowerCase()
    .trim()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Deterministic shared puzzle for a challenge id (stable after send). */
export function puzzleFor(challengeId: number): EmojiPuzzle {
  return EMOJI_DECK[Math.abs(challengeId) % EMOJI_DECK.length]
}

export interface EmojiGuess {
  guess: string
  senderId: number | null
  senderName: string
}

export function collectEmojiGuesses(challengeId: number, msgs: any[]): EmojiGuess[] {
  const out: EmojiGuess[] = []
  const sorted = [...msgs].sort((a, b) => a.id - b.id)
  for (const m of sorted) {
    if (m.is_deleted) continue
    const p = parseEmojiGuess(m.content || '')
    if (!p || p.challengeId !== challengeId) continue
    if (!p.guess.trim()) continue
    out.push({
      guess: p.guess,
      senderId: m.sender_id ?? null,
      senderName: m.sender_display_name || m.sender_username || 'Someone',
    })
  }
  return out
}

/** First guess that normalizes to the answer wins (any player may win). */
export function emojiWinner(puzzle: EmojiPuzzle, guesses: EmojiGuess[]): EmojiGuess | null {
  const want = normalizeGuess(puzzle.title)
  for (const g of guesses) {
    if (normalizeGuess(g.guess) === want) return g
  }
  return null
}

export function EmojiMovieGame({
  challenge,
  msgs,
  onGuess,
  onRematch,
}: {
  challenge: any
  msgs: any[]
  onGuess: (challenge: any, guess: string) => void
  onRematch: () => void
}) {
  const settingUp = !(challenge.id > 0)
  const puzzle = settingUp ? null : puzzleFor(challenge.id)
  const guesses = settingUp || !puzzle ? [] : collectEmojiGuesses(challenge.id, msgs)
  const winner = puzzle ? emojiWinner(puzzle, guesses) : null

  return (
    <div className="w-full max-w-[240px] min-w-0 overflow-hidden">
      <p className="text-xs font-semibold mb-2 flex items-center gap-1.5">🎬 Emoji Movies</p>
      {settingUp || !puzzle ? (
        <p className="text-xs opacity-70">Setting up…</p>
      ) : (
        <>
          <p className="text-3xl leading-snug tracking-wide mb-2" aria-label="Emoji clue">{puzzle.emoji}</p>
          {winner ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-primary">
                🎉 {winner.senderName} guessed “{puzzle.title}”!
              </p>
              <div className="flex items-center gap-1.5">
                <ShareWinButton
                  title="Kryzen Emoji Movies"
                  text={`🏆 ${winner.senderName} guessed the movie from ${puzzle.emoji} on Kryzen Chat! Can you beat them?`}
                />
                <button
                  onClick={(e) => { e.stopPropagation(); onRematch() }}
                  className="text-[11px] px-2.5 py-1.5 rounded-lg bg-primary/15 text-primary font-medium hover:bg-primary/25 transition shrink-0"
                >
                  New puzzle
                </button>
              </div>
            </div>
          ) : (
            <form
              className="flex gap-1.5"
              onSubmit={(e) => {
                e.preventDefault()
                e.stopPropagation()
                const input = (e.currentTarget.elements as any).namedItem('guess') as HTMLInputElement | null
                const v = input?.value || ''
                if (v.trim()) onGuess(challenge, v)
                if (input) input.value = ''
              }}
            >
              <label htmlFor={`emoji-guess-${challenge.id}`} className="sr-only">Guess the movie</label>
              <input
                id={`emoji-guess-${challenge.id}`}
                name="guess"
                placeholder="Guess the movie…"
                autoComplete="off"
                maxLength={80}
                className="flex-1 min-w-0 px-2.5 py-1.5 rounded-lg bg-muted/60 border border-border/60 text-xs outline-none focus:border-primary/60 min-h-[44px]"
              />
              <button
                type="submit"
                aria-label="Submit guess"
                className="px-3 rounded-lg bg-primary/15 text-primary text-xs font-semibold hover:bg-primary/25 transition shrink-0 min-h-[44px] min-w-[44px]"
              >
                Go
              </button>
            </form>
          )}
          {guesses.length > 0 && !winner && (
            <p className="text-[11px] opacity-70 mt-1.5">
              {guesses.length} guess{guesses.length === 1 ? '' : 'es'} so far — latest: “{(guesses[guesses.length - 1].guess || '').slice(0, 30)}”
            </p>
          )}
        </>
      )}
    </div>
  )
}
