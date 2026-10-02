/** Full-screen message effects (confetti, hearts, fireworks, slam).
 * Local-only delight: firing plays the effect on this device, no protocol
 * or backend change needed. Incoming messages auto-trigger via keywords.
 */

export type EffectKind = 'confetti' | 'hearts' | 'fireworks' | 'slam'

type Listener = (kind: EffectKind) => void

const listeners = new Set<Listener>()

export function onEffect(fn: Listener): () => void {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function fireEffect(kind: EffectKind): void {
  try {
    if (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      return
    }
    listeners.forEach((fn) => {
      try {
        fn(kind)
      } catch {}
    })
  } catch {}
}

const KEYWORDS: { kind: EffectKind; test: RegExp }[] = [
  { kind: 'confetti', test: /congrat|celebrat|happy birthday|party\b|cheers|well done|promotion|graduat/i },
  { kind: 'hearts', test: /i love you|love you|❤|💕|xoxo|miss you|anniversary|valentine/i },
  { kind: 'fireworks', test: /\bwow\b|amazing|awesome|incredible|mind ?blown|🎆|🎇|new year/i },
  { kind: 'slam', test: /\burgent\b|breaking|asap|emergency|important!/i },
]

/** Returns the effect a message text should trigger, if any. */
export function effectForText(text: string | null | undefined): EffectKind | null {
  if (!text) return null
  const hit = KEYWORDS.find((k) => k.test.test(text))
  return hit ? hit.kind : null
}

/** Trailing tag carrying a sender-chosen effect to the receiver, e.g. ` [fx:confetti]`.
 * Always stripped before display (see stripFxMarker). */
const FX_MARKER_RE = / \[fx:(confetti|hearts|fireworks|slam)\]\s*$/

export function withFxMarker(body: string, kind: EffectKind): string {
  return `${body.replace(/\s+$/, '')} [fx:${kind}]`
}

/** Effect requested by the sender via marker tag, if any. */
export function parseFxMarker(text: string | null | undefined): EffectKind | null {
  if (!text) return null
  const m = FX_MARKER_RE.exec(text)
  return m ? (m[1] as EffectKind) : null
}

/** Display text with any effect marker removed. Safe on any input. */
export function stripFxMarker(text: any): any {
  return typeof text === 'string' ? text.replace(FX_MARKER_RE, '') : text
}

/** Sidebar/preview-safe text: effect markers stripped, game messages
 * (including ones sent before moves were hidden) shown as pretty labels. */
export function prettyPreview(text: any): any {
  if (typeof text !== 'string' || !text) return text
  const clean = stripFxMarker(text)
  if (clean.startsWith('🎮TTT:move:') || clean.startsWith('🎮RPS:move:') || clean.startsWith('🎮C4:move:')) return '🎮 Game move'
  if (clean.startsWith('🎮TTT:new')) return '🎮 Tic-tac-toe challenge'
  if (clean.startsWith('🎮RPS:new')) return '✊ Rock-paper-scissors'
  if (clean.startsWith('🎮C4:new')) return '🔴 Connect Four'
  return clean
}

/** True for tic-tac-toe move messages (hidden from history, live on the board). */
export function isTTTTMove(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮TTT:move:')
}

/** True for rock-paper-scissors throw messages (hidden the same way). */
export function isRpsMove(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮RPS:move:')
}

/** True for Connect Four drop messages (hidden the same way). */
export function isC4Move(text: unknown): boolean {
  return typeof text === 'string' && text.startsWith('🎮C4:move:')
}

/** True for any hidden game-state message (any game). */
export function isGameMoveMsg(text: unknown): boolean {
  return isTTTTMove(text) || isRpsMove(text) || isC4Move(text)
}

export const EFFECT_OPTIONS: { kind: EffectKind; emoji: string; label: string }[] = [
  { kind: 'confetti', emoji: '🎉', label: 'Confetti' },
  { kind: 'hearts', emoji: '💕', label: 'Hearts' },
  { kind: 'fireworks', emoji: '🎆', label: 'Fireworks' },
  { kind: 'slam', emoji: '💥', label: 'Slam' },
]
